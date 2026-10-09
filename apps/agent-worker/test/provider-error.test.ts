/**
 * A provider refusal reaches the backend as its own machine code, not as NO_SUBMISSION.
 * Fake fetch only: no MiniMax call, no spend.
 */
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeDefinition } from "../src/run-goal.js";
import { buildServer } from "../src/server.js";

const goal = {
  type: "MANGA_PAGE",
  skillName: "manga-page",
  defaults: { model: "MiniMax-M3", thinking: "off", limits: { maxTurns: 8, maxToolCalls: 4, maxSubmits: 1, maxOutputTokens: 1000, maxCostUsd: 1, timeoutMs: 60_000 } },
  parseInput: (x: unknown) => x,
  prepare: () => ({
    skillName: "manga-page",
    userPrompt: "go",
    tools: [
      {
        name: "submit",
        description: "submit",
        parameters: Type.Object({ candidate_json: Type.String() }),
        execute: async () => ({ text: "ACCEPTED", accepted: {} }),
      },
    ],
    submitTool: "submit",
    limits: { maxTurns: 8, maxToolCalls: 4, maxSubmits: 1, maxOutputTokens: 1000, maxCostUsd: 1, timeoutMs: 60_000 },
    allowImages: false,
    finalize: (x: unknown) => x,
  }),
};

describe("provider refusal in the worker", () => {
  let savedKey: string | undefined;
  let calls: number;
  beforeEach(() => {
    savedKey = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = "fake-key-for-tests";
    calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response(
          JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "Token Plan usage limit reached: Upgrade your Token Plan or purchase Credits for more usage. (2056)" } }),
          { status: 429, headers: { "content-type": "application/json", "x-should-retry": "false", "retry-after-ms": "1" } },
        );
      }),
    );
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = savedKey;
    vi.unstubAllGlobals();
  });

  it("returns PROVIDER_LIMIT with the provider's type and message, and the trace says provider_error", async () => {
    const outcome = await executeDefinition(goal as never, { goal_type: "MANGA_PAGE", run_id: "r1", input: {} } as never);
    expect(outcome.state).toBe("FAILED");
    if (outcome.state !== "FAILED") return;
    expect(outcome.error).toMatchObject({ code: "PROVIDER_LIMIT", provider_type: "rate_limit_error", http_status: 429 });
    expect(outcome.error.provider_message).toContain("Token Plan usage limit reached");
    expect(outcome.error.code).not.toBe("NO_SUBMISSION");
    expect(outcome.trace?.stop_reason).toBe("provider_error");
    expect(outcome.trace?.tokens.output).toBe(0);
    expect(JSON.stringify(outcome)).not.toContain("fake-key-for-tests");
    expect(calls).toBeGreaterThan(0);
  }, 60_000);

  it("the HTTP surface passes the code and the fields through", async () => {
    const app = buildServer({ token: "k".repeat(40), maxConcurrentRuns: 2, retainMs: 60_000, execute: (request, signal) => executeDefinition(goal as never, request, signal) });
    try {
      const res = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: { authorization: `Bearer ${"k".repeat(40)}` }, payload: { run_id: "r2", goal_type: "MANGA_PAGE", input: {} } });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.state).toBe("FAILED");
      expect(json.error.code).toBe("PROVIDER_LIMIT");
      expect(json.error.provider_type).toBe("rate_limit_error");
      expect(json.trace.provider_error.code).toBe("PROVIDER_LIMIT");
    } finally {
      await app.close();
    }
  }, 60_000);
});
