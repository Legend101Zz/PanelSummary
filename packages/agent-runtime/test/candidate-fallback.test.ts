import { describe, expect, it } from "vitest";

import { extractAssistantJsonCandidate } from "../src/candidate-fallback.js";

describe("assistant JSON candidate fallback", () => {
  it("extracts one fenced object after provider thinking text", () => {
    const candidate = extractAssistantJsonCandidate([
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: '<think>private reasoning</think>\n```json\n{"schema_version":"manga-plan.v1","beats":[]}\n```',
          },
        ],
      },
    ]);

    expect(candidate).toEqual({ schema_version: "manga-plan.v1", beats: [] });
  });

  it("rejects prose that does not contain an exact JSON object", () => {
    expect(
      extractAssistantJsonCandidate([
        { role: "assistant", content: [{ type: "text", text: "The plan is ready." }] },
      ]),
    ).toBeUndefined();
  });
});
