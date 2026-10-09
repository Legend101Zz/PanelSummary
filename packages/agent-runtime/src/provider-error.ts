/**
 * Provider refusals, told apart from "the model did not submit".
 *
 * After its own retries, the pinned Pi session (0.80.10) does NOT throw when the provider refuses a
 * call. The last assistant message has stopReason "error" and an errorMessage. For the Anthropic
 * Messages API that text is the SDK error message, for example
 *   429 {"type":"error","error":{"type":"rate_limit_error","message":"Token Plan usage limit reached ... (2056)"}}
 * This module turns such a message into a machine code. It keeps the provider's type and message and
 * never keeps headers or a key.
 */

export const PROVIDER_ERROR_CODES = ["PROVIDER_LIMIT", "PROVIDER_UNAVAILABLE", "PROVIDER_AUTH"] as const;
export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export interface ProviderError {
  /** PROVIDER_LIMIT: rate or plan limit. PROVIDER_UNAVAILABLE: 5xx, overloaded, no connection. PROVIDER_AUTH: 401/403. */
  code: ProviderErrorCode;
  /** The provider's error type (for example "rate_limit_error"), or "http_429" when it gave none. */
  type: string;
  /** HTTP status when the message carries one. */
  http_status?: number;
  /** The provider's own message, cleaned and shortened. No key, no headers. */
  message: string;
}

const MAX_MESSAGE = 400;

/** Remove anything that looks like a credential or a header line, then shorten. */
export function scrubProviderText(text: string): string {
  return text
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [removed]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[removed]")
    .replace(/\b(authorization|x-api-key|api[-_]?key)\b\s*[:=]\s*\S+/gi, "$1: [removed]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE);
}

interface Parsed {
  status?: number;
  type?: string;
  message?: string;
}

/** Pull status, error type and message from "429 {json}", "{json}" or plain text. */
function parse(raw: string): Parsed {
  const out: Parsed = {};
  const lead = /^\s*(?:error:\s*)?(\d{3})\b/i.exec(raw);
  if (lead) out.status = Number(lead[1]);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const body = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      const inner = (body.error && typeof body.error === "object" ? body.error : body) as Record<string, unknown>;
      if (typeof inner.type === "string" && inner.type !== "error") out.type = inner.type;
      else if (typeof body.type === "string" && body.type !== "error") out.type = body.type;
      if (typeof inner.message === "string") out.message = inner.message;
      else if (typeof body.message === "string") out.message = body.message;
      if (out.status === undefined && typeof body.status === "number") out.status = body.status;
    } catch {
      // not JSON: fall through to the text rules
    }
  }
  if (out.type === undefined) {
    const named = /\b(rate_limit_error|overloaded_error|authentication_error|permission_error|api_error|billing_error|insufficient_quota)\b/.exec(raw);
    if (named) out.type = named[1];
  }
  if (out.message === undefined) out.message = raw;
  return out;
}

const LIMIT_TEXT = /usage limit|credits|token plan|quota|rate.?limit|too many requests|insufficient_quota|billing|\(2056\)/i;
const AUTH_TEXT = /invalid api key|incorrect api key|unauthori[sz]ed|authentication|forbidden|permission/i;
const UNAVAILABLE_TEXT = /overloaded|service.?unavailable|internal.?server.?error|bad gateway|gateway time-?out|connection error|fetch failed|econnreset|econnrefused|enotfound|socket hang up|network.?error|terminated|timed? ?out/i;

/**
 * Classify an assistant errorMessage (or a thrown error text).
 * Returns undefined when the text is not a provider refusal (so the caller keeps its old stop reason).
 */
export function classifyProviderError(raw: string | undefined | null): ProviderError | undefined {
  const text = (raw ?? "").trim();
  if (!text) return undefined;
  const { status, type, message } = parse(text);
  const clean = scrubProviderText(message ?? text);
  const make = (code: ProviderErrorCode, fallbackType: string): ProviderError => ({
    code,
    type: type ?? fallbackType,
    ...(status !== undefined ? { http_status: status } : {}),
    message: clean,
  });
  // Order matters: a plan limit sometimes arrives with a 5xx-looking wrapper, an auth error never is a limit.
  if (status === 401 || status === 403 || type === "authentication_error" || type === "permission_error") return make("PROVIDER_AUTH", `http_${status ?? 401}`);
  if (status === 429 || type === "rate_limit_error" || type === "billing_error" || type === "insufficient_quota") return make("PROVIDER_LIMIT", "http_429");
  if (status !== undefined && status >= 500 && status <= 599) {
    // MiniMax has been seen to put a plan limit in a 5xx body; the words win.
    if (LIMIT_TEXT.test(clean) && !/overloaded/i.test(clean)) return make("PROVIDER_LIMIT", `http_${status}`);
    return make("PROVIDER_UNAVAILABLE", `http_${status}`);
  }
  if (type === "overloaded_error" || type === "api_error") return make("PROVIDER_UNAVAILABLE", type);
  if (status === undefined && type === undefined) {
    if (AUTH_TEXT.test(clean) && /api key|token|credential|unauthori/i.test(clean)) return make("PROVIDER_AUTH", "auth");
    if (LIMIT_TEXT.test(clean)) return make("PROVIDER_LIMIT", "limit");
    if (UNAVAILABLE_TEXT.test(clean)) return make("PROVIDER_UNAVAILABLE", "unavailable");
  }
  return undefined;
}
