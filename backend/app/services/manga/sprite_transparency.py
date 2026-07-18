"""Local sprite transparency post-processing.

Image providers do not always honor transparent-background requests. This
helper first tries optional rembg matting, then falls back to a deterministic
light-background matte so generated sprites still get usable alpha.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from statistics import median

from PIL import Image


@dataclass(frozen=True)
class SpriteTransparencyResult:
    path: str
    method: str
    alpha_coverage: float
    error: str = ""

    def model_dump(self) -> dict[str, object]:
        return asdict(self)


def alpha_coverage(path: str | Path) -> float:
    image_path = Path(path)
    if not image_path.exists():
        return 0.0
    with Image.open(image_path) as img:
        rgba = img.convert("RGBA")
        alpha = rgba.getchannel("A")
        total = alpha.width * alpha.height
        if total <= 0:
            return 0.0
        transparent = sum(1 for value in alpha.getdata() if value < 250)
        return transparent / total


def ensure_sprite_transparency(path: str | Path) -> SpriteTransparencyResult:
    image_path = Path(path)
    if not image_path.exists():
        return SpriteTransparencyResult(str(image_path), "missing", 0.0, "file not found")

    before = alpha_coverage(image_path)
    if before >= 0.01:
        return SpriteTransparencyResult(str(image_path), "existing_alpha", before)

    rembg_result = _try_rembg(image_path)
    if rembg_result.alpha_coverage >= 0.01:
        return rembg_result

    fallback_result = _matte_light_background(image_path)
    if fallback_result.alpha_coverage >= 0.01:
        return fallback_result
    return fallback_result if not rembg_result.error else SpriteTransparencyResult(
        str(image_path),
        fallback_result.method,
        fallback_result.alpha_coverage,
        rembg_result.error,
    )


def _try_rembg(image_path: Path) -> SpriteTransparencyResult:
    try:
        from rembg import remove  # type: ignore
    except Exception as exc:  # noqa: BLE001 - optional dependency
        return SpriteTransparencyResult(str(image_path), "rembg_unavailable", 0.0, str(exc))

    try:
        output = remove(image_path.read_bytes())
        image_path.write_bytes(output)
        return SpriteTransparencyResult(str(image_path), "rembg", alpha_coverage(image_path))
    except Exception as exc:  # noqa: BLE001 - fall back to deterministic matte
        return SpriteTransparencyResult(str(image_path), "rembg_failed", 0.0, str(exc))


def _corner_background_rgb(img: Image.Image) -> tuple[int, int, int]:
    rgba = img.convert("RGBA")
    width, height = rgba.size
    sample = max(2, min(width, height) // 24)
    points: list[tuple[int, int, int]] = []
    boxes = [
        (0, 0, sample, sample),
        (width - sample, 0, width, sample),
        (0, height - sample, sample, height),
        (width - sample, height - sample, width, height),
    ]
    for box in boxes:
        crop = rgba.crop(box)
        points.extend((r, g, b) for r, g, b, _ in crop.getdata())
    return (
        int(median(pixel[0] for pixel in points)),
        int(median(pixel[1] for pixel in points)),
        int(median(pixel[2] for pixel in points)),
    )


def _matte_light_background(image_path: Path) -> SpriteTransparencyResult:
    try:
        with Image.open(image_path) as img:
            rgba = img.convert("RGBA")
            bg = _corner_background_rgb(rgba)
            pixels = []
            for r, g, b, a in rgba.getdata():
                distance = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
                if distance < 32:
                    next_alpha = 0
                elif distance < 120:
                    next_alpha = int(255 * ((distance - 32) / 88))
                else:
                    next_alpha = 255
                pixels.append((r, g, b, min(a, next_alpha)))
            rgba.putdata(pixels)
            rgba.save(image_path)
    except Exception as exc:  # noqa: BLE001 - caller records failure
        return SpriteTransparencyResult(str(image_path), "fallback_failed", 0.0, str(exc))

    return SpriteTransparencyResult(str(image_path), "light_background_matte", alpha_coverage(image_path))
