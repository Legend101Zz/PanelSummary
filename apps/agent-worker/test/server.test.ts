import type {
  AgentRunOptions,
  AgentRunResult,
  AgentSessionRef,
  ResumeInput,
  ScrollStackAgentRuntime,
} from "@scrollstack/agent-runtime";
import type { AgentGoal, ContextPack } from "@scrollstack/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server.js";
import { createSignedServiceToken } from "../src/security/auth.js";

const token = "test-internal-token-123456789";
const goal = {
  goal_id: "goal-1",
  run_id: "run-1",
  stage_run_id: "stage-1",
  goal_type: "MANGA_DIRECTION",
  allowed_tools: ["submit_manga_plan"],
} as AgentGoal;
const context = { context_pack_id: "ctx-1", project_id: "project-1" } as ContextPack;

class FakeRuntime implements ScrollStackAgentRuntime {
  readonly cancellations: string[] = [];
  constructor(
    private readonly handler: (
      goal: AgentGoal,
      context: ContextPack,
      options: AgentRunOptions,
    ) => Promise<AgentRunResult> = async () => ({
      session_ref: { session_id: "session-1" },
      candidate: { plan_id: "plan-1" },
      trace: {
        session_id: "session-1",
        goal_type: "MANGA_DIRECTION",
        skill_name: "manga-direction",
        skill_version: "1.0.0",
        skill_hash: "hash",
        tool_calls: [],
        tokens: { input: 1, output: 1, cache_read: 0, cache_write: 0, total: 2 },
        cost_usd: 0,
        latency_ms: 1,
        compaction_count: 0,
      },
    }),
    private readonly ready = true,
  ) {}

  run(goalValue: AgentGoal, contextValue: ContextPack, options: AgentRunOptions) {
    return this.handler(goalValue, contextValue, options);
  }
  async resume(_sessionRef: AgentSessionRef, _input: ResumeInput): Promise<AgentRunResult> {
    throw new Error("not used");
  }
  async cancel(runId: string): Promise<void> {
    this.cancellations.push(runId);
  }
  isReady(): boolean {
    return this.ready;
  }
}

const apps: Array<ReturnType<typeof buildServer>> = [];
function app(runtime: ScrollStackAgentRuntime = new FakeRuntime(), maxConcurrentRuns = 2) {
  const instance = buildServer({
    runtime,
    internalServiceToken: token,
    maxConcurrentRuns,
    maxRequestBytes: 50_000,
    runTimeoutMs: 5_000,
    signedTokenMaxAgeMs: 60_000,
    validators: {
      isAgentGoal: (value: unknown): value is AgentGoal =>
        (value as { goal_type?: unknown }).goal_type === "MANGA_DIRECTION",
      isContextPack: (value: unknown): value is ContextPack =>
        typeof (value as { context_pack_id?: unknown }).context_pack_id === "string",
    },
  });
  apps.push(instance);
  return instance;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((instance) => instance.close()));
});

describe("agent worker", () => {
  it("keeps liveness public but requires service auth for internal runs", async () => {
    const instance = app();
    expect((await instance.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    const response = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      payload: { goal, context },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("accepts a body-bound signed bearer token only once", async () => {
    const instance = app();
    const body = { goal, context };
    const signed = createSignedServiceToken({
      secret: token,
      method: "POST",
      path: "/internal/v1/agent-runs",
      body,
      nonce: "unique-nonce",
    });
    const first = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${signed}` },
      payload: body,
    });
    expect(first.statusCode).toBe(200);
    const replay = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${signed}` },
      payload: body,
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe("REPLAYED_TOKEN");
  });

  it("rejects unknown goal contracts before starting the runtime", async () => {
    const runtime = new FakeRuntime();
    const runSpy = vi.spyOn(runtime, "run");
    const response = await app(runtime).inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${token}` },
      payload: { goal: { ...goal, goal_type: "UNKNOWN" }, context },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_AGENT_GOAL");
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("reports readiness independently from liveness", async () => {
    const instance = app(new FakeRuntime(undefined, false));
    expect((await instance.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    expect((await instance.inject({ method: "GET", url: "/readyz" })).statusCode).toBe(503);
  });

  it("cancels an asynchronous run by goal execution id", async () => {
    const runtime = new FakeRuntime(
      async (_goal, _context, options) =>
        new Promise<AgentRunResult>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    const instance = app(runtime);
    const started = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${token}`, prefer: "respond-async" },
      payload: { goal, context },
    });
    expect(started.statusCode).toBe(202);
    const cancelled = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs/goal-1/cancel",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().state).toBe("CANCELLED");
    expect(runtime.cancellations).toContain("goal-1");
  });

  it("rejects excess concurrency without queuing another paid run", async () => {
    let release: (() => void) | undefined;
    const runtime = new FakeRuntime(
      async () =>
        new Promise<AgentRunResult>((resolve) => {
          release = () =>
            resolve({
              session_ref: { session_id: "session-1" },
              candidate: {},
              trace: {
                session_id: "session-1",
                goal_type: "MANGA_DIRECTION",
                skill_name: "manga-direction",
                skill_version: "1.0.0",
                skill_hash: "hash",
                tool_calls: [],
                tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 },
                cost_usd: 0,
                latency_ms: 1,
                compaction_count: 0,
              },
            });
        }),
    );
    const instance = app(runtime, 1);
    const first = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${token}`, prefer: "respond-async" },
      payload: { goal, context },
    });
    expect(first.statusCode).toBe(202);
    const second = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${token}`, prefer: "respond-async" },
      payload: { goal: { ...goal, run_id: "run-2", goal_id: "goal-2" }, context },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("WORKER_CAPACITY_EXCEEDED");
    release?.();
  });

  it("retries and reuses one goal while allowing later goals in the generation run", async () => {
    let attempts = 0;
    const runtime = new FakeRuntime(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient provider failure");
      return {
        session_ref: { session_id: "session-retry" },
        candidate: { plan_id: "plan-retry" },
        trace: {
          session_id: "session-retry",
          goal_type: "MANGA_DIRECTION",
          skill_name: "manga-direction",
          skill_version: "1.0.0",
          skill_hash: "hash",
          tool_calls: [],
          tokens: { input: 1, output: 1, cache_read: 0, cache_write: 0, total: 2 },
          cost_usd: 0,
          latency_ms: 1,
          compaction_count: 0,
        },
      };
    });
    const instance = app(runtime);
    const first = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${token}` },
      payload: { goal, context },
    });
    const retry = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${token}` },
      payload: { goal, context },
    });
    const repeatedSuccess = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${token}` },
      payload: { goal, context },
    });
    const nextGoal = await instance.inject({
      method: "POST",
      url: "/internal/v1/agent-runs",
      headers: { authorization: `Bearer ${token}` },
      payload: { goal: { ...goal, goal_id: "goal-page-writing" }, context },
    });

    expect(first.statusCode).toBe(422);
    expect(retry.statusCode).toBe(200);
    expect(repeatedSuccess.statusCode).toBe(200);
    expect(nextGoal.statusCode).toBe(200);
    expect(attempts).toBe(3);
  });
});
