"""
credit_tracker.py — OpenRouter Credit Tracking
================================================
Queries OpenRouter for remaining credits and tracks
running cost during generation. Enables:
- Pre-flight cost estimation
- Real-time cost display
- Budget-exceeded cancellation
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Rough cost per 1M tokens for common models (input/output)
MODEL_COSTS_PER_M = {
    "google/gemini-3.1-flash-lite-preview": {"input": 0.0, "output": 0.0},
    "google/gemini-2.0-flash-001": {"input": 0.10, "output": 0.40},
    "anthropic/claude-3-haiku": {"input": 0.25, "output": 1.25},
    "anthropic/claude-3.5-sonnet": {"input": 3.0, "output": 15.0},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.0},
    "meta-llama/llama-3.1-8b-instruct:free": {"input": 0.0, "output": 0.0},
}

DEFAULT_COST = {"input": 0.50, "output": 2.0}  # conservative fallback


@dataclass
class CostSnapshot:
    """Current cost state for a generation run."""
    total_credits: float = 0.0
    used_credits: float = 0.0
    remaining_credits: float = 0.0
    run_cost: float = 0.0
    run_input_tokens: int = 0
    run_output_tokens: int = 0
    llm_calls: int = 0
    cancelled: bool = False
    cancel_reason: str = ""

    @property
    def remaining_after_run(self) -> float:
        return self.remaining_credits - self.run_cost

    def to_dict(self) -> dict:
        return {
            "total_credits": round(self.total_credits, 4),
            "used_credits": round(self.used_credits, 4),
            "remaining_credits": round(self.remaining_credits, 4),
            "run_cost": round(self.run_cost, 6),
            "run_input_tokens": self.run_input_tokens,
            "run_output_tokens": self.run_output_tokens,
            "llm_calls": self.llm_calls,
            "cancelled": self.cancelled,
        }


class CreditTracker:
    """Tracks OpenRouter credits and running costs for a generation session."""

    def __init__(self, api_key: str, model: str, budget_limit: Optional[float] = None):
        self.api_key = api_key
        self.model = model
        self.budget_limit = budget_limit  # max $ to spend on this run
        self.snapshot = CostSnapshot()
        self._costs = MODEL_COSTS_PER_M.get(model, DEFAULT_COST)

    async def fetch_credits(self) -> CostSnapshot:
        """Query OpenRouter for current credit balance."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://openrouter.ai/api/v1/credits",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                if resp.status_code == 200:
                    data = resp.json().get("data", {})
                    self.snapshot.total_credits = data.get("total_credits", 0)
                    self.snapshot.used_credits = data.get("total_usage", 0)
                    self.snapshot.remaining_credits = (
                        self.snapshot.total_credits - self.snapshot.used_credits
                    )
                    logger.info(
                        f"Credits: ${self.snapshot.remaining_credits:.4f} remaining "
                        f"(${self.snapshot.total_credits:.2f} total, "
                        f"${self.snapshot.used_credits:.4f} used)"
                    )
                else:
                    logger.warning(f"Credit check returned {resp.status_code}")
        except Exception as e:
            logger.warning(f"Could not fetch credits: {e}")

        return self.snapshot

    def record_call(self, input_tokens: int, output_tokens: int):
        """Record an LLM call's token usage and update running cost."""
        input_cost = (input_tokens / 1_000_000) * self._costs["input"]
        output_cost = (output_tokens / 1_000_000) * self._costs["output"]
        call_cost = input_cost + output_cost

        self.snapshot.run_cost += call_cost
        self.snapshot.run_input_tokens += input_tokens
        self.snapshot.run_output_tokens += output_tokens
        self.snapshot.llm_calls += 1

    def estimate_remaining_cost(self, remaining_calls: int, avg_tokens: int = 1500) -> float:
        """Estimate cost for remaining LLM calls."""
        per_call = (avg_tokens / 1_000_000) * (self._costs["input"] + self._costs["output"])
        return per_call * remaining_calls

    def should_cancel(self) -> bool:
        """Check if we've exceeded budget."""
        if self.snapshot.cancelled:
            return True
        if self.budget_limit and self.snapshot.run_cost >= self.budget_limit:
            self.snapshot.cancelled = True
            self.snapshot.cancel_reason = f"Budget limit ${self.budget_limit} exceeded"
            return True
        if (
            self.snapshot.remaining_credits > 0
            and self.snapshot.run_cost >= self.snapshot.remaining_credits * 0.95
        ):
            self.snapshot.cancelled = True
            self.snapshot.cancel_reason = "Would exceed remaining credits"
            return True
        return False

    def cancel(self, reason: str = "User cancelled"):
        """Manually cancel the run."""
        self.snapshot.cancelled = True
        self.snapshot.cancel_reason = reason
