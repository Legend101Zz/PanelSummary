"""Canonical hashing helpers shared by deterministic services."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def content_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def binary_content_hash(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def estimate_tokens(value: Any) -> int:
    """Stable conservative estimator used until a provider tokenizer is selected."""

    encoded = canonical_json(value).encode("utf-8")
    return max(1, (len(encoded) + 3) // 4)
