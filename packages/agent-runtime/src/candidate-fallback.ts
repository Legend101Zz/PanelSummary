import type { JsonValue } from "./types.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseObject(text: string): JsonValue | undefined {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(withoutThinking)?.[1];
  const candidates = fenced ? [fenced, withoutThinking] : [withoutThinking];
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
      if (record(parsed)) return parsed as JsonValue;
    } catch {
      // Only exact JSON objects are eligible for the authenticated broker fallback.
    }
  }
  return undefined;
}

/**
 * Recover a structured candidate when a provider emits JSON as assistant text
 * instead of the requested tool-call frame. The candidate still goes through
 * the normal authenticated broker and canonical validators before acceptance.
 */
export function extractAssistantJsonCandidate(
  messages: readonly unknown[],
): JsonValue | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = record(messages[index]);
    if (!message || message.role !== "assistant") continue;
    if (typeof message.content === "string") {
      const candidate = parseObject(message.content);
      if (candidate !== undefined) return candidate;
      continue;
    }
    if (!Array.isArray(message.content)) continue;
    const text = message.content
      .map((part) => record(part))
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => String(part?.text))
      .join("\n");
    const candidate = parseObject(text);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}
