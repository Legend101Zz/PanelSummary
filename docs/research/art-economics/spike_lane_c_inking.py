#!/usr/bin/env python3
"""Spike: lane C — conditioned full-page inking (issue #12).

One image-model call renders ALL panels of a page, conditioned on:
  1. the compiled layout skeleton (from the layout-template spike), and
  2. character reference sheets (existing accepted WMC assets).
Text is forbidden in the image; lettering is composited deterministically after.

Variants:
  V1 layout-conditioned (the mechanism under test) — 2 attempts
  V2 unconditioned control (same briefs, no layout image) — 1 attempt

Outputs into ./out/: generated pages, OCR gate verdicts, receipts.json,
and a lettering-composite demo over the best V1 page.
"""
from __future__ import annotations

import base64
import io
import json
import subprocess
import time
from pathlib import Path

import httpx

HERE = Path(__file__).parent
REPO = HERE.parent.parent.parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

MODEL = "google/gemini-2.5-flash-image"
LAYOUT_PNG = REPO / "docs/research/layout-templates/golden/t_ref_rows_2_3_2.png"
ASSETS = REPO / "storage/images/manga_assets/6a0b5a5b201a8d03f1d82503"
REFS = [ASSETS / "haw__reference_sheet__front.png", ASSETS / "hem__reference_sheet__front.png"]

PANEL_BRIEFS = """Panel 0 (top right): wide establishing shot — two small mouse-sized men in
running gear stand at the entrance of a huge maze corridor, morning light.
Panel 1 (top left): the two men jog through the corridor, confident, relaxed.
Panel 2 (middle right): close-up of Haw smiling, wiping sweat.
Panel 3 (middle center): close-up of Hem frowning slightly, suspicious.
Panel 4 (middle left): their feet skidding to a stop on the corridor floor.
Panel 5 (bottom right): medium shot — both stare ahead in shock, jaws open.
Panel 6 (bottom left): reveal — an enormous empty food station, only crumbs left,
dramatic radial speedlines."""

RULES = """HARD RULES:
- Monochrome black-and-white manga ink style with screentones.
- ABSOLUTELY NO TEXT of any kind: no letters, numbers, words, captions, speech
  bubbles, thought bubbles, sound-effect lettering, signs, or logos. Leave quiet
  empty areas near the top of panels for lettering to be added later.
- The two characters must match the attached character reference sheets exactly
  (same faces, hair, outfits)."""


def data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def load_key() -> str:
    for line in (REPO / "backend/.env").read_text().splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("OPENROUTER_API_KEY not found in backend/.env")


def call(variant: str, attempt: int, conditioned: bool, key: str) -> dict:
    content: list[dict] = []
    if conditioned:
        content.append({"type": "text", "text":
            "The FIRST attached image is the exact panel layout skeleton of a manga page. "
            "Reproduce its panel borders (positions, angled cuts, gutters) precisely and "
            "fill each panel, following the numbered reading order, with the briefs below. "
            "The other attached images are character reference sheets.\n\n"
            + PANEL_BRIEFS + "\n\n" + RULES})
        content.append({"type": "image_url", "image_url": {"url": data_url(LAYOUT_PNG)}})
    else:
        content.append({"type": "text", "text":
            "Draw one complete manga PAGE with 7 panels covering the following briefs in "
            "reading order. The attached images are character reference sheets.\n\n"
            + PANEL_BRIEFS + "\n\n" + RULES})
    for ref in REFS:
        content.append({"type": "image_url", "image_url": {"url": data_url(ref)}})

    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": "2:3"},
        "usage": {"include": True},
    }
    t0 = time.time()
    resp = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json=payload, timeout=180,
    )
    latency_ms = int((time.time() - t0) * 1000)
    resp.raise_for_status()
    body = resp.json()
    msg = body["choices"][0]["message"]
    images = [im["image_url"]["url"] for im in (msg.get("images") or [])]
    receipt = {
        "variant": variant, "attempt": attempt, "model": MODEL,
        "conditioned": conditioned, "latency_ms": latency_ms,
        "usage": body.get("usage"), "n_images": len(images),
    }
    if not images:
        receipt["error"] = "no image returned"
        return receipt
    raw = base64.b64decode(images[0].split(",", 1)[1])
    out_path = OUT / f"{variant}_a{attempt}.png"
    out_path.write_bytes(raw)
    receipt["file"] = out_path.name

    ocr = subprocess.run(
        ["tesseract", str(out_path), "stdout", "--psm", "11"],
        capture_output=True, text=True)
    found = [w for w in ocr.stdout.split() if len(w) >= 3 and any(c.isalpha() for c in w)]
    receipt["ocr_gate"] = {"clean": not found, "words_found": found[:20]}
    print(f"{variant} a{attempt}: {latency_ms}ms, ocr_clean={not found}, "
          f"words={found[:6]}")
    return receipt


def letter_demo(page: Path) -> None:
    """Deterministic lettering composited over the generated art (proof of layer order)."""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.open(page).convert("RGB")
    d = ImageDraw.Draw(img)
    W, H = img.size
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Comic Sans MS.ttf", int(W * 0.024))
    except OSError:
        font = ImageFont.load_default()

    def bubble(cx, cy, lines):
        w = max(d.textlength(t, font=font) for t in lines) + int(W * 0.03)
        h = (font.size + 6) * len(lines) + int(W * 0.02)
        box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
        d.ellipse(box, fill="white", outline="black", width=3)
        y = cy - h / 2 + int(W * 0.012)
        for t in lines:
            d.text((cx - d.textlength(t, font=font) / 2, y), t, fill="black", font=font)
            y += font.size + 6

    bubble(W * 0.78, H * 0.10, ["WHO MOVED", "MY CHEESE?!"])
    bubble(W * 0.30, H * 0.86, ["IT WAS ALL", "GONE."])
    d.rectangle([W * 0.03, H * 0.955, W * 0.52, H * 0.99], fill="black")
    d.text((W * 0.045, H * 0.960), "Chapter 2 - The empty station", fill="white", font=font)
    out = page.with_name(page.stem + "_lettered.png")
    img.save(out)
    print(f"lettering demo -> {out.name}")


def main() -> None:
    key = load_key()
    receipts = [
        call("v1_conditioned", 1, True, key),
        call("v1_conditioned", 2, True, key),
        call("v2_control", 1, False, key),
    ]
    (OUT / "receipts.json").write_text(json.dumps(receipts, indent=2))
    best = next((r for r in receipts if r["variant"] == "v1_conditioned" and r.get("file")), None)
    if best:
        letter_demo(OUT / best["file"])
    print("receipts.json written")


if __name__ == "__main__":
    main()
