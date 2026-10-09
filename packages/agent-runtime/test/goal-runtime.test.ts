/**
 * Goal runtime guards that run before any model call. The network is stubbed
 * to throw, so a test that reached a provider would fail loudly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Type } from "typebox";

import { ALLOWED_MODELS, extractFinalJson, runGoal, VISION_MODELS, type GoalRunRequest, type GoalTool } from "../src/index.js";

const assistant = (...texts: string[]) => ({ role: "assistant", content: texts.map((text) => ({ type: "text", text })) });

describe("extractFinalJson", () => {
  it("returns the JSON object in the last assistant text", () => {
    const messages = [assistant('{"old":true}'), { role: "user", content: [{ type: "text", text: '{"user":1}' }] }, assistant('Here it is: {"a":1,"b":[2]} done')];
    expect(extractFinalJson(messages)).toEqual({ a: 1, b: [2] });
  });

  it("drops <think> blocks before looking for JSON", () => {
    expect(extractFinalJson([assistant('<think>maybe {"draft":1}</think>', '{"final":true}')])).toEqual({ final: true });
  });

  it("joins the text parts and ignores non-text parts", () => {
    const message = { role: "assistant", content: [{ type: "text", text: '{"x":' }, { type: "toolCall", name: "t" }, { type: "text", text: "1}" }] };
    expect(extractFinalJson([message])).toEqual({ x: 1 });
  });

  it("skips trailing non-assistant messages", () => {
    expect(extractFinalJson([assistant('{"a":1}'), { role: "toolResult", content: [{ type: "text", text: '{"t":1}' }] }])).toEqual({ a: 1 });
  });

  it("returns undefined for no JSON, broken JSON, or no assistant message", () => {
    expect(extractFinalJson([assistant("no json here")])).toBeUndefined();
    expect(extractFinalJson([assistant('{"a": 1,')])).toBeUndefined();
    expect(extractFinalJson([assistant('{"a":1}'), assistant("the last one has none")])).toBeUndefined();
    expect(extractFinalJson([{ role: "user", content: [{ type: "text", text: '{"a":1}' }] }])).toBeUndefined();
    expect(extractFinalJson([{ role: "assistant", content: "plain string" }])).toBeUndefined();
    expect(extractFinalJson([])).toBeUndefined();
  });
});

describe("runGoal preflight (no network)", () => {
  const submit: GoalTool = {
    name: "submit",
    description: "submit",
    parameters: Type.Object({ candidate_json: Type.String() }),
    execute: async () => ({ text: "ACCEPTED", accepted: {} }),
  };
  const request = (overrides: Partial<GoalRunRequest> = {}): GoalRunRequest => ({
    goalType: "TEST",
    runId: "run-1",
    model: "MiniMax-M3",
    thinking: "off",
    skill: { name: "test", version: "1.0.0", content: "Submit {}.", contentHash: "0" },
    userPrompt: "go",
    tools: [submit],
    submitTool: "submit",
    limits: { maxTurns: 1, maxToolCalls: 1, maxSubmits: 1, maxOutputTokens: 1000, maxCostUsd: 0.01, timeoutMs: 1000 },
    allowImages: false,
    ...overrides,
  });

  let savedKey: string | undefined;
  const network = vi.fn(async () => {
    throw new Error("network must not be called");
  });

  beforeEach(() => {
    savedKey = process.env.MINIMAX_API_KEY;
    vi.stubGlobal("fetch", network);
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = savedKey;
    vi.unstubAllGlobals();
    network.mockClear();
  });

  it("allows only the MiniMax models and only M3 and Flash for vision", () => {
    expect([...ALLOWED_MODELS]).toEqual(["MiniMax-M3", "MiniMax-M3.1-Flash-Preview", "MiniMax-M2.7-highspeed", "MiniMax-M2.7"]);
    expect([...VISION_MODELS]).toEqual(["MiniMax-M3", "MiniMax-M3.1-Flash-Preview"]);
  });

  it("rejects a model that is not allowed", async () => {
    for (const model of ["gpt-4o", "gemini-2.5-flash-image", "claude-sonnet-4"]) {
      await expect(runGoal(request({ model: model as never }))).rejects.toThrow(`Model ${model} is not allowed`);
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("rejects images for a model without vision", async () => {
    await expect(runGoal(request({ model: "MiniMax-M2.7-highspeed", allowImages: true }))).rejects.toThrow("cannot read images");
    expect(network).not.toHaveBeenCalled();
  });

  it("rejects a submit tool that is not in the tool list", async () => {
    await expect(runGoal(request({ submitTool: "submit_page" }))).rejects.toThrow("Submit tool submit_page is not in the tool list");
    expect(network).not.toHaveBeenCalled();
  });

  it("refuses to start without MINIMAX_API_KEY", async () => {
    delete process.env.MINIMAX_API_KEY;
    await expect(runGoal(request())).rejects.toThrow("MINIMAX_API_KEY is not set in the worker environment");
    expect(network).not.toHaveBeenCalled();
  }, 30_000);
});
