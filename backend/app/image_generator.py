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


async def generate_image_with_model(
    *,
    prompt: str,
    api_key: str,
    output_path: str,
    image_model: str,
    aspect_ratio: str = "1:1",
) -> bool:
    """Generate an image with exactly the requested model.

    Manga v2 uses this strict helper for reusable character assets. It avoids
    silently switching models because visual consistency matters more than
    returning "some" image. If the selected model fails, the caller can surface a
    clear asset-generation error instead of hiding quality drift.
    """
    modalities = ["image", "text"] if "gemini" in image_model else ["image"]
    payload = {
        "model": image_model,
        "messages": [{"role": "user", "content": prompt[:1200]}],
        "modalities": modalities,
    }
    if "gemini" in image_model:
        payload["image_config"] = {"aspect_ratio": aspect_ratio}

    async with httpx.AsyncClient(timeout=90.0) as client:
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
        logger.warning("OpenRouter image %s HTTP %s: %s", image_model, resp.status_code, resp.text[:200])
        return False

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        return False

    message = choices[0].get("message", {})
    image_urls: list[str] = []
    for image in message.get("images", []) or []:
        url = image.get("image_url", {}).get("url", "")
        if url:
            image_urls.append(url)

    content = message.get("content", "")
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and part.get("type") in ("image_url", "image"):
                url = (part.get("image_url") or {}).get("url", "")
                if url:
                    image_urls.append(url)

    for img_url in image_urls:
        if img_url.startswith("data:image"):
            _, b64 = img_url.split(",", 1)
            img_bytes = base64.b64decode(b64)
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(img_bytes)
            logger.info("Strict image saved (%sKB) via %s: %s", len(img_bytes) // 1024, image_model, output_path)
            return True

    logger.warning("No image payload returned from strict image model %s", image_model)
    return False


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
MAX_SPRITES_PER_BOOK = 4  # Cost control: max character portrait sprites per book


async def generate_character_sprite(
    character: dict,
    style: str,
    api_key: str,
    output_path: str,
    image_model: str = None,
) -> bool:
    """Generate a reusable character portrait sprite for a manga character.

    This is called ONCE per character during blueprint phase and the resulting
    image is injected into every DSL panel featuring that character — giving
    the manga consistent character visuals across all panels.

    Args:
        character: Blueprint character dict with 'visual_description', 'name', etc.
        style: Manga style key (manga/noir/minimalist/comedy/academic)
        api_key: OpenRouter API key
        output_path: Where to save the PNG
        image_model: Override image model (falls back to DEFAULT_IMAGE_MODEL)
    """
    name = character.get("name", "character")
    visual_desc = character.get("visual_description", name)
    # Truncate to avoid overly long prompts
    visual_desc = visual_desc[:300]

    style_hint = STYLE_SUFFIXES.get(style, STYLE_SUFFIXES["manga"])
    prompt = (
        f"{visual_desc}. "
        f"Manga character portrait, centered, upper body visible, "
        f"white or transparent background, "
        f"black and white ink art, bold clean outlines, expressive face. "
        f"Style: {style_hint}."
    )[:500]

    logger.info(f"Generating character sprite for '{name}'")
    return await generate_panel_image(
        visual_description=prompt,
        style=style,
        api_key=api_key,
        output_path=output_path,
        panel_type="portrait",   # → aspect "1:1" (square portrait)
        image_model=image_model,
    )


def _distribute_budget(eligible: list, max_images: int) -> list:
    """Pick panels distributed across the book's narrative arc.

    Instead of taking the first N eligible panels (which clusters
    images in early chapters), pick from evenly spaced positions
    across the book — roughly at 25%, 50%, 75%, 100% of the way through.

    This ensures every act of the story gets visual representation.
    """
    n = len(eligible)
    if n <= max_images:
        return eligible

    # Pick evenly spaced indices
    step = n / max_images
    indices = [int(step * i + step / 2) for i in range(max_images)]
    # Clamp to valid range
    indices = [min(i, n - 1) for i in indices]
    # Deduplicate while preserving order
    seen = set()
    result = []
    for i in indices:
        if i not in seen:
            seen.add(i)
            result.append(eligible[i])
    return result


async def generate_images_for_summary(
    book_id: str,
    manga_chapters: list,
    style: str,
    api_key: str,
    image_base_dir: str,
    progress_callback=None,
    max_images: int = MAX_IMAGES_PER_BOOK,
    image_model: str = None,
) -> tuple[list, int, int, float]:
    """Generate images ONLY for splash panels (page-based layout).

    Budget is distributed across narrative positions (issue 4.1).
    Failures are tracked and returned (issue 4.2).

    Returns: (manga_chapters, generated_count, failed_count, cost)
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

    # Distribute budget across narrative arc (issue 4.1)
    selected = _distribute_budget(eligible, max_images)
    total = len(selected)
    generated = 0
    failed = 0

    for idx, (ci, ch, page, panel) in enumerate(selected):
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
        else:
            failed += 1
            logger.warning(
                f"Image generation failed for chapter {ci}, page {page_idx} "
                f"(attempt used all {len(IMAGE_MODELS)} model fallbacks)"
            )

    logger.info(
        f"Image generation: {generated}/{total} succeeded, "
        f"{failed} failed (budget: {max_images})"
    )
    return manga_chapters, generated, failed, 0.0
