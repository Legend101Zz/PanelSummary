/**
 * Agent worker HTTP surface. The backend job runner calls it; nothing else
 * should. Runs are idempotent by run_id: a repeated request for a running or
 * finished run returns that run instead of starting (and paying for) another.
 */
import { timingSafeEqual } from "node:crypto";

import { ALLOWED_MODELS, THINKING_LEVELS } from "@panelsummary/agent-runtime";
import Fastify, { type FastifyInstance } from "fastify";

import { egressSnapshot } from "./egress.js";
import { GOAL_TYPES } from "./goals/index.js";
import { executeGoal, type GoalOutcome, type GoalRequest } from "./run-goal.js";

interface RunRecord {
  run_id: string;
  goal_type: string;
  state: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  started_at: string;
  finished_at?: string;
  outcome?: GoalOutcome;
  controller: AbortController;
  completion: Promise<void>;
}

export interface ServerOptions {
  token: string;
  maxConcurrentRuns: number;
  retainMs?: number;
  logger?: boolean;
  execute?: typeof executeGoal;
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function view(record: RunRecord) {
  return {
    run_id: record.run_id,
    goal_type: record.goal_type,
    started_at: record.started_at,
    finished_at: record.finished_at,
    ...(record.outcome ?? {}),
    state: record.state,
  };
}

export function buildServer(options: ServerOptions): FastifyInstance {
  const execute = options.execute ?? executeGoal;
  const retainMs = options.retainMs ?? 30 * 60_000;
  const runs = new Map<string, RunRecord>();
  let active = 0;

  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 16 * 1024 * 1024 });

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/internal/")) return;
    const header = request.headers.authorization ?? "";
    if (!header.startsWith("Bearer ") || !sameToken(header.slice(7), options.token)) {
      await reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "service token required" } });
    }
  });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/readyz", async (_request, reply) => {
    const ready = Boolean(process.env.MINIMAX_API_KEY);
    return reply.code(ready ? 200 : 503).send({ ready, active_runs: active });
  });

  app.post("/internal/v2/runs", async (request, reply) => {
    const body = request.body as Partial<GoalRequest> | undefined;
    if (!body || typeof body.run_id !== "string" || !body.run_id || !GOAL_TYPES.includes(body.goal_type as never)) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: "run_id and a known goal_type are required" } });
    }
    if (body.model !== undefined && !ALLOWED_MODELS.includes(body.model)) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: `model must be one of ${ALLOWED_MODELS.join(", ")}` } });
    }
    if (body.thinking !== undefined && !THINKING_LEVELS.includes(body.thinking)) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: `thinking must be one of ${THINKING_LEVELS.join(", ")}` } });
    }
    const existing = runs.get(body.run_id);
    if (existing && existing.state !== "FAILED" && existing.state !== "CANCELLED") {
      await existing.completion;
      return reply.send(view(existing));
    }
    if (active >= options.maxConcurrentRuns) {
      return reply.code(429).send({ error: { code: "AT_CAPACITY", message: `worker is running ${active} goals` } });
    }
    const controller = new AbortController();
    const record: RunRecord = {
      run_id: body.run_id,
      goal_type: String(body.goal_type),
      state: "RUNNING",
      started_at: new Date().toISOString(),
      controller,
      completion: Promise.resolve(),
    };
    runs.set(record.run_id, record);
    active += 1;
    record.completion = execute(body as GoalRequest, controller.signal)
      .then((outcome) => {
        record.outcome = outcome;
        record.state = outcome.state;
      })
      .catch((error: unknown) => {
        record.state = "FAILED";
        record.outcome = { state: "FAILED", error: { code: "WORKER_ERROR", message: error instanceof Error ? error.message : String(error) } };
      })
      .finally(() => {
        active -= 1;
        record.finished_at = new Date().toISOString();
        setTimeout(() => {
          if (runs.get(record.run_id) === record) runs.delete(record.run_id);
        }, retainMs).unref();
      });
    await record.completion;
    return reply.send(view(record));
  });

  app.get("/internal/v2/runs/:id", async (request, reply) => {
    const record = runs.get((request.params as { id: string }).id);
    if (!record) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "unknown run" } });
    return reply.send(view(record));
  });

  app.post("/internal/v2/runs/:id/cancel", async (request, reply) => {
    const record = runs.get((request.params as { id: string }).id);
    if (!record) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "unknown run" } });
    if (record.state === "RUNNING") {
      record.controller.abort("cancelled by backend");
      await record.completion;
    }
    return reply.send(view(record));
  });

  app.get("/internal/v2/egress", async () => ({ hosts: egressSnapshot() }));

  return app;
}
