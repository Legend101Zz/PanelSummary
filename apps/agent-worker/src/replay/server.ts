/** HTTP surface of the replay worker: the same endpoints as apps/agent-worker/src/server.ts that the backend uses. */
import { timingSafeEqual } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";

import type { ReplayHandler, ReplayOutcome, ReplayRequest } from "./handler.js";

const GOAL_TYPES = ["BOOK_UNDERSTANDING", "ADAPTATION_PLAN", "MANGA_PAGE"];

interface RunRecord {
  state: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  goal_type: string;
  controller: AbortController;
  outcome?: ReplayOutcome;
  completion: Promise<void>;
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildReplayServer(options: { token: string; handler: Pick<ReplayHandler, "execute">; logger?: boolean }): FastifyInstance {
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

  app.get("/healthz", async () => ({ ok: true, replay: true }));
  // Ready without a key: the replay worker needs none. `replay: true` lets check.sh say so.
  app.get("/readyz", async () => ({ ready: true, replay: true, active_runs: active }));

  const view = (runId: string, record: RunRecord) => ({ run_id: runId, goal_type: record.goal_type, ...(record.outcome ?? {}), state: record.state });

  app.post("/internal/v2/runs", async (request, reply) => {
    const body = request.body as Partial<ReplayRequest> | undefined;
    if (!body || typeof body.run_id !== "string" || !body.run_id || !GOAL_TYPES.includes(String(body.goal_type))) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: "run_id and a known goal_type are required" } });
    }
    const existing = runs.get(body.run_id);
    if (existing && existing.state !== "FAILED" && existing.state !== "CANCELLED") {
      await existing.completion;
      return reply.send(view(body.run_id, existing));
    }
    const record: RunRecord = { state: "RUNNING", goal_type: String(body.goal_type), controller: new AbortController(), completion: Promise.resolve() };
    runs.set(body.run_id, record);
    active += 1;
    // The backend drops the connection when it cancels a call: stop the run then too.
    reply.raw.on("close", () => {
      if (record.state === "RUNNING") record.controller.abort();
    });
    record.completion = options.handler
      .execute(body as ReplayRequest, record.controller.signal)
      .then((outcome) => {
        record.outcome = outcome;
        record.state = outcome.state;
      })
      .catch((error: unknown) => {
        record.state = "FAILED";
        record.outcome = { state: "FAILED", error: { code: "WORKER_ERROR", message: error instanceof Error ? error.message : String(error) } } as ReplayOutcome;
      })
      .finally(() => {
        active -= 1;
      });
    await record.completion;
    return reply.send(view(body.run_id, record));
  });

  app.post("/internal/v2/runs/:id/cancel", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const record = runs.get(id);
    if (!record) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "unknown run" } });
    if (record.state === "RUNNING") {
      record.controller.abort("cancelled by backend");
      await record.completion;
    }
    return reply.send(view(id, record));
  });

  // The replay worker makes no outbound request: the list is always empty.
  app.get("/internal/v2/egress", async () => ({ hosts: {} }));

  return app;
}
