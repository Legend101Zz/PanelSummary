"""Tests for local sprite transparency post-processing."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.manga.sprite_transparency import alpha_coverage, ensure_sprite_transparency


def test_light_background_matte_adds_alpha_to_rgb_sprite(tmp_path: Path):
    path = tmp_path / "sprite.png"
    image = Image.new("RGB", (96, 96), "white")
    draw = ImageDraw.Draw(image)
    draw.ellipse((28, 12, 68, 56), fill="black")
    draw.rectangle((36, 54, 60, 88), fill="black")
    image.save(path)

    assert alpha_coverage(path) == 0

    result = ensure_sprite_transparency(path)

    assert result.alpha_coverage > 0.3
    assert result.method in {"light_background_matte", "rembg"}
