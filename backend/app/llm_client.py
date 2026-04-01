"""
llm_client.py — LLM API Client
================================
Handles communication with OpenAI and OpenRouter APIs.

KEY DESIGN DECISIONS:
1. User provides their own key — we never store it
2. OpenRouter compatible (same API format as OpenAI but with 100+ models)
3. Automatic JSON parsing with retry on malformed output
4. Token counting to prevent context overflow
5. Cost tracking so users can see what they spent
"""

import json
import logging
import re
import time
from typing import Optional

import tiktoken
from openai import AsyncOpenAI, APIError, RateLimitError

logger = logging.getLogger(__name__)

# ============================================================
# OPENROUTER MODELS (cheaper alternatives to OpenAI)
# ============================================================
OPENROUTER_MODELS = {
    "cheap": "meta-llama/llama-3.1-8b-instruct:free",     # FREE but slower
    "balanced": "anthropic/claude-3-haiku",                  # Fast + cheap
    "quality": "anthropic/claude-3.5-sonnet",               # Best quality
    "openai_cheap": "gpt-4o-mini",                          # OpenAI cheap
    "openai_quality": "gpt-4o",                              # OpenAI quality
}


class LLMClient:
    """
    Unified client for OpenAI and OpenRouter.
    Both use the same API format, just different base URLs and models.
    """

    def __init__(
        self,
        api_key: str,
        provider: str = "openai",
        model: Optional[str] = None,
    ):
        """
        api_key: User's API key (sk-... for OpenAI, sk-or-v1-... for OpenRouter)
        provider: "openai" or "openrouter"
        model: Model name. Defaults to gpt-4o-mini / claude-haiku
        """
        self.provider = provider
        self.api_key = api_key

        if provider == "openrouter":
            self.client = AsyncOpenAI(
                api_key=api_key,
                base_url="https://openrouter.ai/api/v1",
                default_headers={
                    "HTTP-Referer": "https://panelsummary.app",
                    "X-Title": "PanelSummary",
                },
            )
            self.model = model or "anthropic/claude-3-haiku"
        else:
            self.client = AsyncOpenAI(api_key=api_key)
            self.model = model or "gpt-4o-mini"

        # Token counter (for cost estimation)
        try:
            self.encoder = tiktoken.encoding_for_model("gpt-4o-mini")
        except Exception:
            self.encoder = tiktoken.get_encoding("cl100k_base")

        logger.info(f"LLM client initialized: {provider}/{self.model}")

    def count_tokens(self, text: str) -> int:
        """Count tokens in a string. Used to estimate cost before calling API."""
        return len(self.encoder.encode(text))

    def estimate_cost_usd(self, input_tokens: int, output_tokens: int) -> float:
        """
        Rough cost estimate. Uses gpt-4o-mini pricing as default.
        WHY: We track this to show users their spending.
        """
        # gpt-4o-mini: $0.15/1M input, $0.60/1M output
        input_cost = (input_tokens / 1_000_000) * 0.15
        output_cost = (output_tokens / 1_000_000) * 0.60
        return round(input_cost + output_cost, 6)

    async def chat(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 4000,
        temperature: float = 0.7,
        json_mode: bool = True,
    ) -> dict:
        """
        Send a message to the LLM and return parsed response.

        Returns:
        {
            "content": str,       # raw response text
            "parsed": dict | None, # parsed JSON (if json_mode=True)
            "input_tokens": int,
            "output_tokens": int,
            "estimated_cost_usd": float,
        }
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        input_tokens = self.count_tokens(system_prompt + user_message)

        # Build API call kwargs
        kwargs = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        # JSON mode for OpenAI models that support it
        if json_mode and self.provider == "openai":
            kwargs["response_format"] = {"type": "json_object"}

        # For OpenRouter only: disable thinking mode on Qwen3/DeepSeek/o1 etc.
        # This avoids <think>...</think> blocks in the output and saves tokens.
        if self.provider == "openrouter":
            model_lower = (self.model or "").lower()
            is_thinking = any(x in model_lower for x in ["qwen3", "qwq", "deepseek-r1", "o1", "o3"])
            if is_thinking:
                kwargs["extra_body"] = {"thinking": {"type": "disabled"}}

        try:
            logger.debug(f"Calling LLM: {self.model}, ~{input_tokens} input tokens")
            start_time = time.time()

            response = await self.client.chat.completions.create(**kwargs)

            elapsed = time.time() - start_time
            content = response.choices[0].message.content or ""
            output_tokens = response.usage.completion_tokens if response.usage else self.count_tokens(content)
            input_tokens_actual = response.usage.prompt_tokens if response.usage else input_tokens

            logger.debug(f"LLM response: {output_tokens} tokens in {elapsed:.1f}s")

            result = {
                "content": content,
                "parsed": None,
                "input_tokens": input_tokens_actual,
                "output_tokens": output_tokens,
                "estimated_cost_usd": self.estimate_cost_usd(input_tokens_actual, output_tokens),
            }

            # Try to parse JSON
            if json_mode:
                parsed = self._parse_json_response(content)
                result["parsed"] = parsed

            return result

        except APIError as e:
            logger.error(f"LLM API error: {e}")
            # 429 — surface immediately so the worker can mark the task failed
            status = getattr(e, "status_code", None)
            if status == 429:
                raise RateLimitError(
                    f"Rate limit hit on model '{self.model}'. "
                    "Switch to a less-loaded model (e.g. google/gemini-2.0-flash-001 or qwen/qwq-32b) "
                    "or add credits at openrouter.ai/settings/integrations."
                ) from e
            raise

    def _parse_json_response(self, content: str) -> Optional[dict | list]:
        """
        Robustly parse JSON from LLM responses.

        Handles these real-world patterns in order of priority:
        1. Qwen3 / DeepSeek-R1: <think>...</think> reasoning block BEFORE the JSON
        2. Markdown ```json ... ``` wrappers
        3. Plain JSON object or array
        4. JSON buried somewhere in text (last resort regex)
        """
        if not content:
            return None

        content = content.strip()

        # ── 1. Strip Qwen3/DeepSeek <think>...</think> blocks ──────────────
        # These models emit a chain-of-thought section before the actual output.
        # Strip ALL <think>...</think> occurrences (can be multiple).
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

        # ── 2. Strip markdown code fences ──────────────────────────────────
        if content.startswith("```"):
            content = re.sub(r"^```(?:json|python|js|javascript)?\s*", "", content)
            content = re.sub(r"\s*```\s*$", "", content)
            content = content.strip()

        # ── 3. Direct JSON parse ────────────────────────────────────────────
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # ── 4. Find the outermost JSON object or array ─────────────────────
        # Walk character-by-character to find the first { or [ and its matching closer.
        for start_char, end_char in [('{', '}'), ('[', ']')]:
            start = content.find(start_char)
            if start == -1:
                continue
            depth = 0
            in_string = False
            escape = False
            for i, ch in enumerate(content[start:], start):
                if escape:
                    escape = False
                    continue
                if ch == '\\' and in_string:
                    escape = True
                    continue
                if ch == '"' and not escape:
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == start_char:
                    depth += 1
                elif ch == end_char:
                    depth -= 1
                    if depth == 0:
                        candidate = content[start:i+1]
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            break  # try the other bracket type

        logger.warning(f"PARSE FAIL — first 500 chars of cleaned content: {content[:500]!r}")
        return None

    async def chat_with_retry(
        self,
        system_prompt: str,
        user_message: str,
        max_retries: int = 2,
        **kwargs,
    ) -> dict:
        """
        Call chat() with automatic retry on JSON parse failure.
        WHY: LLMs occasionally produce malformed JSON. Retry usually fixes it.
        """
        last_result = None
        for attempt in range(max_retries + 1):
            try:
                result = await self.chat(system_prompt, user_message, **kwargs)

                # If JSON mode and parsing failed, retry with stronger instruction
                if kwargs.get("json_mode", True) and result["parsed"] is None and attempt < max_retries:
                    logger.warning(f"JSON parse failed, retry {attempt + 1}/{max_retries}")
                    # Append stricter instruction
                    retry_message = user_message + "\n\nIMPORTANT: Your response MUST be valid JSON only. No markdown, no explanation, just the JSON object/array."
                    last_result = result
                    user_message = retry_message
                    continue

                return result

            except RateLimitError:
                raise  # Never retry 429s — fail fast so the worker marks it as failed
            except Exception as e:
                if attempt < max_retries:
                    logger.warning(f"LLM call failed (attempt {attempt + 1}): {e}")
                    time.sleep(2 ** attempt)  # Exponential backoff: 1s, 2s, 4s
                else:
                    raise

        return last_result or {"content": "", "parsed": None, "input_tokens": 0, "output_tokens": 0, "estimated_cost_usd": 0}
