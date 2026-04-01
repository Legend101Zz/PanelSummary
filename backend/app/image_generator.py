"""
image_generator.py — OpenRouter Image Generation
==================================================
Uses OpenRouter's image generation endpoint properly.
Docs: https://openrouter.ai/docs/guides/overview/multimodal/image-generation

Response format:
  choices[0].message.images[0].image_url.url  →  "data:image/png;base64,..."

Models (all available on OpenRouter, $0 image price tier):
  google/gemini-3.1-flash-image-preview  — best quality, Gemini-backed
  black-forest-labs/flux.2-klein-4b      — fast, good quality
  black-forest-labs/flux.2-pro           — highest quality, slower
"""

import base64
import logging
import os
import httpx

logger = logging.getLogger(__name__)

# Available image generation models (cheapest first — all via OpenRouter)
IMAGE_GENERATION_MODELS = [
    {
        "id": "google/gemini-2.5-flash-image",
        "name": "Gemini 2.5 Flash Image (Nano Banana) — $2.50/1M",
        "modalities": ["image", "text"],
    },
    {
        "id": "google/gemini-3.1-flash-image-preview",
        "name": "Gemini 3.1 Flash Image Preview (Nano Banana 2) — $3/1M",
        "modalities": ["image", "text"],
    },
    {
        "id": "google/gemini-3-pro-image-preview",
        "name": "Gemini 3 Pro Image Preview (Nano Banana Pro) — $12/1M",
        "modalities": ["image", "text"],
    },
]

DEFAULT_IMAGE_MODEL = IMAGE_GENERATION_MODELS[0]["id"]  # cheapest by default
IMAGE_MODELS = [m["id"] for m in IMAGE_GENERATION_MODELS]

STYLE_SUFFIXES = {
    "manga":       "manga illustration, black and white ink style, bold outlines, dynamic composition, expressive characters",
    "noir":        "noir comic art, heavy ink shadows, black and white, dramatic chiaroscuro lighting",
    "minimalist":  "minimalist line art, clean simple strokes, editorial illustration",
    "comedy":      "colorful cartoon manga, chibi style, expressive, bright bold colors",
    "academic":    "clean educational illustration, technical diagram style, clear labels",
}


async def generate_panel_image(
    visual_description: str,
    style: str,
    api_key: str,
    output_path: str,
    panel_type: str = "scene",
    image_model: str = None,
) -> bool:
    """
    Generate a manga panel image via OpenRouter's image generation API.
    Uses `image_model` as primary, falls back to cheaper models on failure.
    """
    style_hint = STYLE_SUFFIXES.get(style, STYLE_SUFFIXES["manga"])
    prompt = f"{visual_description}. Style: {style_hint}."[:500]

    # Aspect ratio: portrait for title/action, square for dialogue/scene
    aspect = "2:3" if panel_type in ("title", "action") else "1:1"

    # Build ordered model list: user-chosen first, then rest as fallback
    primary = image_model or DEFAULT_IMAGE_MODEL
    ordered = [primary] + [m for m in IMAGE_MODELS if m != primary]

    for model in ordered:
        # Gemini image models use modalities=["image","text"]
        # Flux models use modalities=["image"]
        modalities = ["image", "text"] if "gemini" in model else ["image"]

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "modalities": modalities,
        }
        # Add image config for Gemini models that support it
        if "gemini" in model:
            payload["image_config"] = {"aspect_ratio": aspect}

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "HTTP-Referer": "https://panelsummary.app",
                        "X-Title": "PanelSummary",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )

            if resp.status_code != 200:
                logger.warning(f"OpenRouter image {model} HTTP {resp.status_code}: {resp.text[:120]}")
                continue

            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                continue

            message = choices[0].get("message", {})

            # Per OpenRouter docs: message.images[0].image_url.url
            images = message.get("images", [])
            if images:
                img_url = images[0].get("image_url", {}).get("url", "")
                if img_url.startswith("data:image"):
                    _, b64 = img_url.split(",", 1)
                    img_bytes = base64.b64decode(b64)
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    with open(output_path, "wb") as f:
                        f.write(img_bytes)
                    logger.info(f"Panel image saved ({len(img_bytes)//1024}KB) via {model}: {os.path.basename(output_path)}")
                    return True

            # Also handle content-as-list format (some models)
            content = message.get("content", "")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") in ("image_url", "image"):
                        img_url = (part.get("image_url") or {}).get("url", "")
                        if img_url.startswith("data:image"):
                            _, b64 = img_url.split(",", 1)
                            img_bytes = base64.b64decode(b64)
                            os.makedirs(os.path.dirname(output_path), exist_ok=True)
                            with open(output_path, "wb") as f:
                                f.write(img_bytes)
                            logger.info(f"Panel image (content list) saved via {model}")
                            return True

            logger.debug(f"No image in response from {model} — keys: {list(message.keys())}")

        except Exception as e:
            logger.warning(f"Image gen error with {model}: {e}")
            continue

    return False


MAX_IMAGES_PER_BOOK = 4  # Cost control: max AI images per book


async def generate_images_for_summary(
    book_id: str,
    manga_chapters: list,
    style: str,
    api_key: str,
    image_base_dir: str,
    progress_callback=None,
    max_images: int = MAX_IMAGES_PER_BOOK,
    image_model: str = None,
) -> tuple[list, int, float]:
    """
    Generate images ONLY for splash panels (page-based layout).
    Budget: max 4 images per book to control cost.
    Falls back to old panel-based detection for legacy summaries.
    """
    eligible = []

    for ci, ch in enumerate(manga_chapters):
        # New page-based format
        if hasattr(ch, 'pages') and ch.pages:
            for page in ch.pages:
                for panel in page.panels:
                    if panel.content_type == "splash" and panel.image_prompt and not panel.image_id:
                        eligible.append((ci, ch, page, panel))
        # Legacy panel-based format
        elif hasattr(ch, 'panels') and ch.panels:
            for panel in ch.panels:
                if panel.panel_type not in ("title", "recap") and not panel.image_id:
                    eligible.append((ci, ch, None, panel))

    # Enforce budget
    eligible = eligible[:max_images]
    total = len(eligible)
    generated = 0

    for idx, (ci, ch, page, panel) in enumerate(eligible):
        if progress_callback:
            pct = int((idx / max(total, 1)) * 100)
            progress_callback(pct, f"Generating image {idx+1}/{total}: {ch.chapter_title[:30]}")

        page_idx = page.page_index if page else 0
        fname = f"splash_{ci}_{page_idx}.png"
        out_path = os.path.join(image_base_dir, book_id, fname)

        if os.path.isfile(out_path):
            panel.image_id = f"{book_id}/{fname}"
            generated += 1
            continue

        # Use image_prompt for new format, visual_description for legacy
        description = getattr(panel, 'image_prompt', None) or getattr(panel, 'visual_description', 'manga scene')

        ok = await generate_panel_image(
            visual_description=description,
            style=style,
            api_key=api_key,
            output_path=out_path,
            panel_type="splash",
            image_model=image_model,
        )
        if ok:
            panel.image_id = f"{book_id}/{fname}"
            generated += 1

    logger.info(f"Image generation: {generated}/{total} (budget: {max_images})")
    return manga_chapters, generated, 0.0
