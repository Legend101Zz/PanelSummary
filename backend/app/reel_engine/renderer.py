"""
renderer.py — Calls reel-renderer subprocess → MP4
=====================================================
Bridges Python backend with Node.js Remotion renderer.
Writes DSL to temp file, invokes Remotion CLI, returns MP4 path.
"""

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

# Path to the reel-renderer project (sibling to backend/)
_ROOT = Path(__file__).resolve().parent.parent.parent.parent
RENDERER_DIR = _ROOT / "reel-renderer"


def render_video_reel(
    dsl: dict,
    book_id: str,
    reel_id: str,
    progress_callback=None,
) -> str:
    """
    Render a Video DSL to MP4 using Remotion CLI.

    Returns the relative path to the output video (from storage root).
    Raises RuntimeError on render failure.
    """
    settings = get_settings()
    reels_dir = Path(settings.reels_dir)

    # Ensure output directory exists
    book_reels_dir = reels_dir / book_id
    book_reels_dir.mkdir(parents=True, exist_ok=True)

    output_filename = f"reel-{reel_id}.mp4"
    output_path = book_reels_dir / output_filename
    relative_path = f"reels/{book_id}/{output_filename}"

    # Write DSL to temp file for Remotion to read
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, prefix="reel-dsl-"
    ) as f:
        json.dump(dsl, f)
        dsl_path = f.name

    try:
        canvas = dsl.get("canvas", {})
        width = canvas.get("width", 1080)
        height = canvas.get("height", 1920)
        fps = canvas.get("fps", 30)

        # Calculate total frames from scenes
        total_ms = sum(
            s.get("duration_ms", 0)
            for s in dsl.get("scenes", [])
            if isinstance(s, dict)
        )
        total_frames = max(1, int((total_ms / 1000) * fps))

        if progress_callback:
            progress_callback(10, "Starting Remotion render...")

        cmd = [
            "npx", "remotion", "render",
            "src/index.tsx",
            "ReelComposition",
            str(output_path),
            f"--props={dsl_path}",
            f"--width={width}",
            f"--height={height}",
            f"--fps={fps}",
            f"--frames=0-{total_frames - 1}",
            "--codec=h264",
            "--crf=23",
            "--log=error",
        ]

        logger.info(f"Rendering reel: {' '.join(cmd[:6])}...")
        logger.info(f"Output: {output_path} ({total_frames} frames, {total_ms}ms)")

        result = subprocess.run(
            cmd,
            cwd=str(RENDERER_DIR),
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
        )

        if result.returncode != 0:
            error_msg = result.stderr or result.stdout or "Unknown render error"
            logger.error(f"Remotion render failed: {error_msg}")
            raise RuntimeError(f"Render failed: {error_msg[:500]}")

        if not output_path.exists():
            raise RuntimeError(f"Render completed but output file not found: {output_path}")

        file_size = output_path.stat().st_size
        logger.info(
            f"Reel rendered: {relative_path} "
            f"({file_size / 1024 / 1024:.1f}MB, {total_ms / 1000:.1f}s)"
        )

        if progress_callback:
            progress_callback(95, "Video render complete!")

        return relative_path

    finally:
        # Clean up temp file
        try:
            os.unlink(dsl_path)
        except OSError:
            pass


def check_renderer_ready() -> tuple[bool, str]:
    """Check if the reel-renderer project is set up and ready."""
    if not RENDERER_DIR.exists():
        return False, f"reel-renderer directory not found at {RENDERER_DIR}"

    package_json = RENDERER_DIR / "package.json"
    if not package_json.exists():
        return False, "reel-renderer/package.json not found"

    node_modules = RENDERER_DIR / "node_modules"
    if not node_modules.exists():
        return False, "reel-renderer/node_modules not found — run: cd reel-renderer && npm install"

    # Check ffmpeg
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True, timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False, "ffmpeg not found — run: brew install ffmpeg"

    return True, "Renderer ready"
