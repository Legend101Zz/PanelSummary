/**
 * MiniMax-M3.1-Flash-Preview in the harness. No real network: fetch is replaced by a fake
 * Anthropic-style SSE server that records every request BODY (never headers).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Type } from "typebox";

import {
  applyThinkingToPayload,
  costBasisFor,
  DEFAULT_GOAL_MODEL,
  describeThinkingSent,
  extractFinalJson,
  FLASH_COST_BASIS,
  FLASH_MODEL,
  flashThinkingWire,
  resolveModel,
  runGoal,
  THINKING_LEVELS,
  type GoalRunRequest,
  type GoalTool,
  type ThinkingLevel,
} from "../src/index.js";

type Block =
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

function sse(blocks: Block[]): Response {
  const events: Array<[string, unknown]> = [
    ["message_start", { type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: "x", content: [], usage: { input_tokens: 10, output_tokens: 0 } } }],
  ];
  blocks.forEach((b, index) => {
    if (b.type === "thinking") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "thinking", thinking: "" } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: b.thinking } }]);
      if (b.signature) events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "signature_delta", signature: b.signature } }]);
    } else if (b.type === "text") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } }]);
    } else {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } }]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  const stop = blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 20 } }]);
  events.push(["message_stop", { type: "message_stop" }]);
  const body = events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const submit: GoalTool = {
  name: "submit",
  description: "submit",
  parameters: Type.Object({ candidate_json: Type.String() }),
  execute: async (args) => ({ text: "ACCEPTED", accepted: JSON.parse(String(args.candidate_json)) }),
};
const request = (overrides: Partial<GoalRunRequest> = {}): GoalRunRequest => ({
  goalType: "TEST",
  runId: "run-flash",
  model: FLASH_MODEL,
  thinking: "off",
  skill: { name: "test", version: "1.0.0", content: "Submit {}.", contentHash: "0" },
  userPrompt: "go",
  tools: [submit],
  submitTool: "submit",
  limits: { maxTurns: 4, maxToolCalls: 4, maxSubmits: 2, maxOutputTokens: 4000, maxCostUsd: 1, timeoutMs: 20_000 },
  allowImages: false,
  textFallbackArgument: "candidate_json",
  ...overrides,
});

describe("MiniMax-M3.1-Flash-Preview registration (offline)", () => {
  it("resolves as a custom model with the M3 shape", async () => {
    const flash = (await resolveModel(FLASH_MODEL))!.model as Record<string, unknown>;
    const m3 = (await resolveModel("MiniMax-M3"))!.model as Record<string, unknown>;
    expect(flash).toMatchObject({
      id: FLASH_MODEL,
      provider: "minimax",
      api: "anthropic-messages",
      baseUrl: "https://api.minimax.io/anthropic",
      input: ["text", "image"],
      contextWindow: 1_000_000,
      reasoning: true,
    });
    expect(flash.cost).toEqual(m3.cost);
    expect(m3).toMatchObject({ id: "MiniMax-M3", contextWindow: 1_000_000, input: ["text", "image"] });
  });

  it("keeps the other catalog models after registration", async () => {
    for (const id of ["MiniMax-M2.7", "MiniMax-M2.7-highspeed"] as const) {
      expect(((await resolveModel(id))!.model as { id: string }).id).toBe(id);
    }
  });

  it("keeps M3 as the default and says the Flash price is an estimate", () => {
    expect(DEFAULT_GOAL_MODEL).toBe("MiniMax-M3");
    expect(costBasisFor(FLASH_MODEL)).toBe(FLASH_COST_BASIS);
    expect(FLASH_COST_BASIS).toContain("estimate on MiniMax-M3 rates");
    expect(costBasisFor("MiniMax-M3")).toBe("Pi catalog rates");
  });
});

describe("thinking on the wire", () => {
  it("never sends disabled or effort none to Flash (the API refuses both)", () => {
    for (const level of [undefined, ...THINKING_LEVELS]) {
      const wire = flashThinkingWire(level as ThinkingLevel | undefined);
      expect(wire.thinking).toEqual({ type: "adaptive" });
      expect(["low", "medium", "high"]).toContain(wire.output_config.effort);
    }
    expect(flashThinkingWire("off").output_config.effort).toBe("low");
    expect(flashThinkingWire("minimal").output_config.effort).toBe("low");
    expect(flashThinkingWire("low").output_config.effort).toBe("low");
    expect(flashThinkingWire("medium").output_config.effort).toBe("medium");
    expect(flashThinkingWire("high").output_config.effort).toBe("high");
  });

  it("leaves the payload of every other model untouched (same object)", () => {
    const payload = { model: "MiniMax-M3", thinking: { type: "enabled", budget_tokens: 2048, display: "summarized" }, max_tokens: 6048 };
    const before = JSON.stringify(payload);
    for (const id of ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"]) {
      for (const level of [undefined, ...THINKING_LEVELS]) {
        expect(applyThinkingToPayload(id, payload, level as ThinkingLevel | undefined)).toBe(payload);
      }
    }
    expect(JSON.stringify(payload)).toBe(before);
  });

  it("rewrites the Flash payload and replaces a Pi thinking field", () => {
    const out = applyThinkingToPayload(FLASH_MODEL, { thinking: { type: "disabled" }, max_tokens: 100 }, "medium") as Record<string, unknown>;
    expect(out).toEqual({ thinking: { type: "adaptive" }, output_config: { effort: "medium" }, max_tokens: 100 });
  });

  it("describes what was sent", () => {
    expect(describeThinkingSent({ thinking: { type: "disabled" } })).toBe("disabled");
    expect(describeThinkingSent({ thinking: { type: "enabled", budget_tokens: 2048 } })).toBe("enabled:2048");
    expect(describeThinkingSent({ thinking: { type: "adaptive" }, output_config: { effort: "low" } })).toBe("adaptive:low");
    expect(describeThinkingSent({})).toBe("none");
  });
});

describe("full run on a fake Anthropic stream", () => {
  let savedKey: string | undefined;
  let bodies: Array<Record<string, unknown>>;
  let script: Block[][];

  beforeEach(() => {
    savedKey = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = "fake-key-for-tests";
    bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: { body?: string }) => {
        bodies.push(JSON.parse(String(init.body)));
        const next = script.shift();
        if (!next) throw new Error("fake stream script is empty");
        return sse(next);
      }),
    );
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = savedKey;
    vi.unstubAllGlobals();
  });

  it("accepts narration, then a thinking block with a signature and one without, before tool_use", async () => {
    script = [
      [
        { type: "thinking", thinking: "I will plan this.", signature: "sig-1" },
        { type: "text", text: "Let me submit the result now." },
        { type: "thinking", thinking: "no signature on this one" },
        { type: "tool_use", id: "t1", name: "submit", input: { candidate_json: '{"ok":true}' } },
      ],
    ];
    const { accepted, trace } = await runGoal(request({ thinking: "medium" }));
    expect(accepted).toEqual({ ok: true });
    expect(trace).toMatchObject({ model: FLASH_MODEL, thinking: "medium", thinking_sent: "adaptive:medium", submits: 1, nudges: 0, text_fallback_used: false, stop_reason: "accepted" });
    expect(trace.cost_basis).toBe(FLASH_COST_BASIS);
    expect(bodies[0]).toMatchObject({ model: FLASH_MODEL, thinking: { type: "adaptive" }, output_config: { effort: "medium" } });
  });

  it("sends the lowest effort for thinking off and records it", async () => {
    script = [[{ type: "tool_use", id: "t1", name: "submit", input: { candidate_json: "{}" } }]];
    const { trace } = await runGoal(request({ thinking: "off" }));
    expect(trace.thinking).toBe("off");
    expect(trace.thinking_sent).toBe("adaptive:low");
    expect(bodies[0]!.thinking).toEqual({ type: "adaptive" });
  });

  it("sends the same request for MiniMax-M3 as Pi built before Flash existed", async () => {
    const seen: Record<string, unknown> = {};
    for (const level of THINKING_LEVELS) {
      script = [[{ type: "tool_use", id: "t1", name: "submit", input: { candidate_json: "{}" } }]];
      const { trace } = await runGoal(request({ model: "MiniMax-M3", thinking: level, limits: { maxTurns: 4, maxToolCalls: 4, maxSubmits: 2, maxOutputTokens: 64_000, maxCostUsd: 1, timeoutMs: 20_000 } }));
      seen[level] = [bodies.at(-1)!.thinking, bodies.at(-1)!.output_config, trace.thinking_sent, trace.cost_basis];
    }
    expect(seen).toEqual({
      off: [{ type: "disabled" }, undefined, "disabled", "Pi catalog rates"],
      minimal: [{ type: "enabled", budget_tokens: 1024, display: "summarized" }, undefined, "enabled:1024", "Pi catalog rates"],
      low: [{ type: "enabled", budget_tokens: 2048, display: "summarized" }, undefined, "enabled:2048", "Pi catalog rates"],
      medium: [{ type: "enabled", budget_tokens: 8192, display: "summarized" }, undefined, "enabled:8192", "Pi catalog rates"],
      high: [{ type: "enabled", budget_tokens: 16384, display: "summarized" }, undefined, "enabled:16384", "Pi catalog rates"],
    });
  });

  it("falls back to the final JSON text after thinking blocks and narration", async () => {
    script = [[{ type: "thinking", thinking: "hmm", signature: "s" }, { type: "text", text: 'Here is the result: {"fallback":1}' }]];
    const { accepted, trace } = await runGoal(request());
    expect(accepted).toEqual({ fallback: 1 });
    expect(trace.text_fallback_used).toBe(true);
  });
});

describe("extractFinalJson with Flash-style messages", () => {
  it("ignores thinking blocks (with and without signature) and reads the text", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: 'draft {"no":1}', thinkingSignature: "sig" },
        { type: "thinking", thinking: 'unsigned {"no":2}', thinkingSignature: "" },
        { type: "text", text: 'Narration first. {"yes":true}' },
      ],
    };
    expect(extractFinalJson([message])).toEqual({ yes: true });
  });
});
