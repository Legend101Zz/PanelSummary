"""Regression tests for the mandatory MiniMax text and low-cost image policy."""

from __future__ import annotations

from app.image_generator import DEFAULT_IMAGE_MODEL, _low_cost_image_model
from app.llm_client import DEFAULT_TEXT_LLM_MODEL, TEXT_LLM_PROVIDER


def test_text_policy_constants_pin_the_minimax_lane():
    assert TEXT_LLM_PROVIDER == "minimax"
    assert DEFAULT_TEXT_LLM_MODEL == "MiniMax-M3"


def test_image_policy_rejects_more_expensive_requested_model():
    assert _low_cost_image_model("google/gemini-3-pro-image-preview") == DEFAULT_IMAGE_MODEL
    assert _low_cost_image_model(None) == DEFAULT_IMAGE_MODEL
