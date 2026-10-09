/**
 * HTTP contract of the agent worker. No model is called: every test injects a
 * fake `execute` through buildServer options.
 */
import { afterEach, describe, expect, it } from "vitest";

import { egressSnapshot, installEgressRecorder } from "../src/egress.js";
import type { GoalOutcome, GoalRequest } from "../src/run-goal.js";
import { buildServer } from "../src/server.js";
import { executeDefinition } from "../src/run-goal.js";

const TOKEN = "k".repeat(40);
const AUTH = { authorization: `Bearer ${TOKEN}` };

type Execute = (request: GoalRequest, signal?: AbortSignal) => Promise<GoalOutcome>;

const succeeded = (value: string): GoalOutcome => ({ state: "SUCCEEDED", result: { value }, trace: undefined as never });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

async function until(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("condition not reached");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const apps: ReturnType<typeof buildServer>[] = [];
function server(execute: Execute, maxConcurrentRuns = 4) {
  const app = buildServer({ token: TOKEN, maxConcurrentRuns, execute, retainMs: 60_000 });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const body = (run_id: string, goal_type = "MANGA_PAGE") => ({ run_id, goal_type, input: {} });

describe("auth", () => {
  it("rejects /internal/* without a token", async () => {
    const app = server(async () => succeeded("x"));
    const res = await app.inject({ method: "POST", url: "/internal/v2/runs", payload: body("r1") });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("rejects /internal/* with a wrong token (same length and other length)", async () => {
    const app = server(async () => succeeded("x"));
    for (const token of ["z".repeat(40), "short"]) {
      const res = await app.inject({ method: "GET", url: "/internal/v2/egress", headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(401);
    }
    const noBearer = await app.inject({ method: "GET", url: "/internal/v2/egress", headers: { authorization: TOKEN } });
    expect(noBearer.statusCode).toBe(401);
  });

  it("leaves /healthz open", async () => {
    const app = server(async () => succeeded("x"));
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("POST /internal/v2/runs", () => {
  it("accepts the Flash model and refuses an unknown model or thinking level", async () => {
    let seen: string | undefined;
    const app = server(async (request) => {
      seen = request.model;
      return succeeded("x");
    });
    const ok = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: { ...body("flash"), model: "MiniMax-M3.1-Flash-Preview", thinking: "off" } });
    expect(ok.statusCode).toBe(200);
    await until(() => seen !== undefined);
    expect(seen).toBe("MiniMax-M3.1-Flash-Preview");
    for (const payload of [{ ...body("m1"), model: "gpt-4o" }, { ...body("m2"), thinking: "xhigh" }]) {
      const res = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it("returns 400 on a bad body and does not execute", async () => {
    let calls = 0;
    const app = server(async () => {
      calls += 1;
      return succeeded("x");
    });
    const bad = [{}, { goal_type: "MANGA_PAGE" }, { run_id: "", goal_type: "MANGA_PAGE" }, { run_id: "r1", goal_type: "NOPE" }, { run_id: "r1", goal_type: "PAGE_REVIEW" }];
    for (const payload of bad) {
      const res = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe("BAD_REQUEST");
    }
    expect(calls).toBe(0);
  });

  it("is idempotent by run_id: a repeat returns the same result without executing again", async () => {
    let calls = 0;
    const app = server(async () => {
      calls += 1;
      return succeeded(`call-${calls}`);
    });
    const first = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: body("same") });
    const second = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: body("same") });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(calls).toBe(1);
    expect(first.json()).toMatchObject({ run_id: "same", state: "SUCCEEDED", result: { value: "call-1" } });
    expect(second.json()).toEqual(first.json());

    const fetched = await app.inject({ method: "GET", url: "/internal/v2/runs/same", headers: AUTH });
    expect(fetched.json()).toEqual(first.json());
  });

  it("re-executes a run whose earlier attempt FAILED", async () => {
    let calls = 0;
    const app = server(async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return succeeded("ok");
    });
    const first = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: body("retry") });
    expect(first.json()).toMatchObject({ state: "FAILED", error: { code: "WORKER_ERROR", message: "boom" } });
    const second = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: body("retry") });
    expect(second.json()).toMatchObject({ state: "SUCCEEDED", result: { value: "ok" } });
    expect(calls).toBe(2);
  });

  it("returns 429 at capacity", async () => {
    const gate = deferred();
    let started = 0;
    const app = server(async () => {
      started += 1;
      await gate.promise;
      return succeeded("done");
    }, 1);
    const running = app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: body("a") });
    await until(() => started === 1);
    const busy = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: body("b") });
    expect(busy.statusCode).toBe(429);
    expect(busy.json().error.code).toBe("AT_CAPACITY");
    gate.resolve();
    expect((await running).json()).toMatchObject({ run_id: "a", state: "SUCCEEDED" });
    const after = await app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: body("b") });
    expect(after.statusCode).toBe(200);
    expect(started).toBe(2);
  });
});

describe("cancel", () => {
  it("aborts the signal of a running goal and reports CANCELLED", async () => {
    let seen: AbortSignal | undefined;
    const app = server(
      (_request, signal) =>
        new Promise<GoalOutcome>((resolve) => {
          seen = signal;
          signal?.addEventListener("abort", () => resolve({ state: "CANCELLED", error: { code: "CANCELLED", message: String(signal.reason) } }));
        }),
    );
    const running = app.inject({ method: "POST", url: "/internal/v2/runs", headers: AUTH, payload: body("c1") });
    await until(() => seen !== undefined);
    expect(seen!.aborted).toBe(false);
    const cancel = await app.inject({ method: "POST", url: "/internal/v2/runs/c1/cancel", headers: AUTH });
    expect(cancel.statusCode).toBe(200);
    expect(seen!.aborted).toBe(true);
    expect(cancel.json()).toMatchObject({ run_id: "c1", state: "CANCELLED" });
    expect((await running).json()).toMatchObject({ state: "CANCELLED" });
  });

  it("returns 404 for an unknown run", async () => {
    const app = server(async () => succeeded("x"));
    const res = await app.inject({ method: "POST", url: "/internal/v2/runs/nope/cancel", headers: AUTH });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /internal/v2/egress", () => {
  it("returns {hosts: {host/path: count}} for every outbound fetch", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}")) as typeof fetch;
    try {
      installEgressRecorder();
      await fetch("https://api.minimax.io/anthropic/v1/messages", { method: "POST" });
      await fetch(new URL("https://api.minimax.io/anthropic/v1/messages"));
    } finally {
      globalThis.fetch = original;
    }
    const app = server(async () => succeeded("x"));
    const res = await app.inject({ method: "GET", url: "/internal/v2/egress", headers: AUTH });
    expect(res.statusCode).toBe(200);
    const payload = res.json() as { hosts: Record<string, number> };
    expect(Object.keys(payload)).toEqual(["hosts"]);
    expect(payload.hosts["api.minimax.io/anthropic/v1/messages"]).toBe(2);
    expect(payload.hosts).toEqual(egressSnapshot());
    for (const count of Object.values(payload.hosts)) expect(Number.isInteger(count)).toBe(true);
  });
});

describe("vision gate", () => {
  const seen = async (model: string, vision: boolean): Promise<boolean> => {
    let got: boolean | undefined;
    const goal = {
      defaults: { model: "MiniMax-M3", thinking: "off" },
      parseInput: (x: unknown) => x,
      prepare: (_i: unknown, o: { vision: boolean }) => {
        got = o.vision;
        throw new Error("stop");
      },
    };
    await executeDefinition(goal as never, { goal_type: "MANGA_PAGE", run_id: "r", input: {}, model, vision } as never).catch(() => undefined);
    return got as boolean;
  };
  it("allows vision for M3 and Flash and refuses it for M2.7", async () => {
    expect(await seen("MiniMax-M3", true)).toBe(true);
    expect(await seen("MiniMax-M3.1-Flash-Preview", true)).toBe(true);
    expect(await seen("MiniMax-M2.7", true)).toBe(false);
    expect(await seen("MiniMax-M3.1-Flash-Preview", false)).toBe(false);
  });
});
