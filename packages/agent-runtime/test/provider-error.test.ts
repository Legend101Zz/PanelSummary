/**
 * A provider refusal must show as itself (stop_reason "provider_error" + a machine code),
 * never as "finished without an accepted submission". No real network: fetch is a fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Type } from "typebox";

import { classifyProviderError, FLASH_MODEL, GoalRunError, runGoal, scrubProviderText, type GoalRunRequest, type GoalTool } from "../src/index.js";

const PLAN_LIMIT = {
  type: "error",
  error: { type: "rate_limit_error", message: "Token Plan usage limit reached: Upgrade your Token Plan or purchase Credits for more usage. (2056)" },
};

describe("classifyProviderError", () => {
  it("maps the real MiniMax plan-limit answer to PROVIDER_LIMIT", () => {
    const got = classifyProviderError(`429 ${JSON.stringify(PLAN_LIMIT)}`);
    expect(got).toEqual({
      code: "PROVIDER_LIMIT",
      type: "rate_limit_error",
      http_status: 429,
      message: PLAN_LIMIT.error.message,
    });
  });

  it("maps the rate-limit shapes to PROVIDER_LIMIT", () => {
    expect(classifyProviderError("429 Too Many Requests")?.code).toBe("PROVIDER_LIMIT");
    expect(classifyProviderError('{"type":"error","error":{"type":"rate_limit_error","message":"slow down"}}')?.code).toBe("PROVIDER_LIMIT");
    expect(classifyProviderError("You exceeded your current quota, please add Credits")?.code).toBe("PROVIDER_LIMIT");
    expect(classifyProviderError('400 {"error":{"type":"insufficient_quota","message":"x"}}')?.code).toBe("PROVIDER_LIMIT");
  });

  it("maps 5xx, overloaded and dropped connections to PROVIDER_UNAVAILABLE", () => {
    expect(classifyProviderError('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')?.code).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyProviderError("503 Service Unavailable")?.code).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyProviderError('500 {"type":"error","error":{"type":"api_error","message":"Internal server error"}}')?.code).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyProviderError("Connection error.")?.code).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyProviderError("fetch failed")?.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("maps 401 and 403 to PROVIDER_AUTH, never to a limit", () => {
    expect(classifyProviderError('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')?.code).toBe("PROVIDER_AUTH");
    expect(classifyProviderError("403 Forbidden")?.code).toBe("PROVIDER_AUTH");
  });

  it("leaves other errors alone", () => {
    expect(classifyProviderError("")).toBeUndefined();
    expect(classifyProviderError(undefined)).toBeUndefined();
    expect(classifyProviderError('400 {"type":"error","error":{"type":"invalid_request_error","message":"messages: bad shape"}}')).toBeUndefined();
    expect(classifyProviderError("Tool-call limit reached (8). Stop.")).toBeUndefined();
    expect(classifyProviderError("Validation failed for tool submit")).toBeUndefined();
  });

  it("keeps no key and no header in the message", () => {
    const text = `401 {"error":{"type":"authentication_error","message":"bad key sk-abcdefghijklmnop12345 sent as Bearer abcdefgh12345678 authorization: topsecret"}}`;
    const got = classifyProviderError(text)!;
    expect(got.message).not.toMatch(/sk-abcdefghijklmnop|abcdefgh12345678|topsecret/);
    expect(scrubProviderText("x".repeat(2000)).length).toBe(400);
  });
});

describe("a refused call in a full run (fake fetch)", () => {
  const submit: GoalTool = {
    name: "submit",
    description: "submit",
    parameters: Type.Object({ candidate_json: Type.String() }),
    execute: async (args) => ({ text: "ACCEPTED", accepted: JSON.parse(String(args.candidate_json)) }),
  };
  const request = (overrides: Partial<GoalRunRequest> = {}): GoalRunRequest => ({
    goalType: "TEST",
    runId: "run-refused",
    model: FLASH_MODEL,
    thinking: "off",
    skill: { name: "test", version: "1.0.0", content: "Submit {}.", contentHash: "0" },
    userPrompt: "go",
    tools: [submit],
    submitTool: "submit",
    limits: { maxTurns: 4, maxToolCalls: 4, maxSubmits: 2, maxOutputTokens: 4000, maxCostUsd: 1, timeoutMs: 60_000 },
    allowImages: false,
    textFallbackArgument: "candidate_json",
    ...overrides,
  });

  let savedKey: string | undefined;
  let calls: number;
  let answer: () => Response;

  beforeEach(() => {
    savedKey = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = "fake-key-for-tests";
    calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return answer();
      }),
    );
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = savedKey;
    vi.unstubAllGlobals();
  });

  const refuse = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-should-retry": "false", "retry-after-ms": "1" } });

  async function failure(): Promise<GoalRunError> {
    try {
      await runGoal(request());
    } catch (error) {
      expect(error).toBeInstanceOf(GoalRunError);
      return error as GoalRunError;
    }
    throw new Error("the run should have failed");
  }

  it("reports a plan limit as provider_error / PROVIDER_LIMIT and sends no nudge", async () => {
    answer = refuse(429, PLAN_LIMIT);
    const error = await failure();
    expect(error.trace.stop_reason).toBe("provider_error");
    expect(error.trace.provider_error).toMatchObject({ code: "PROVIDER_LIMIT", type: "rate_limit_error", http_status: 429 });
    expect(error.trace.provider_error?.message).toContain("Token Plan usage limit reached");
    expect(error.message).toContain("rate_limit_error: Token Plan usage limit reached");
    expect(error.message).not.toContain("finished without an accepted submission");
    expect(error.trace.nudges).toBe(0);
    expect(error.trace.tokens.output).toBe(0);
    // Pi's own retries (settings maxRetries 2) are the only extra calls: no nudge prompt after them.
    expect(calls).toBe(3);
    expect(JSON.stringify(error.trace)).not.toContain("fake-key-for-tests");
  }, 60_000);

  it("reports an overloaded provider as PROVIDER_UNAVAILABLE", async () => {
    answer = refuse(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    const error = await failure();
    expect(error.trace.stop_reason).toBe("provider_error");
    expect(error.trace.provider_error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", type: "overloaded_error" });
  }, 60_000);

  it("reports a bad key as PROVIDER_AUTH after one call (not retried)", async () => {
    answer = refuse(401, { type: "error", error: { type: "authentication_error", message: "invalid api key" } });
    const error = await failure();
    expect(error.trace.provider_error?.code).toBe("PROVIDER_AUTH");
    expect(calls).toBe(1);
  }, 60_000);

  it("keeps a non-provider 400 as a plain error with its text", async () => {
    answer = refuse(400, { type: "error", error: { type: "invalid_request_error", message: "messages: bad shape" } });
    const error = await failure();
    expect(error.trace.stop_reason).toBe("error");
    expect(error.trace.provider_error).toBeUndefined();
    expect(error.message).toContain("bad shape");
  }, 60_000);
});
