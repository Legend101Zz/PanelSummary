import { randomUUID } from "node:crypto";

import type { ScrollStackAgentRuntime } from "@scrollstack/agent-runtime";
import { isAgentGoal, isContextPack } from "@scrollstack/contracts";
import { Type, type Static } from "@sinclair/typebox";
import Fastify, { type FastifyInstance } from "fastify";

import { CapacityError, RunRegistry } from "./run-registry.js";
import { createServiceAuthHook } from "./security/auth.js";

const RunRequestSchema = Type.Object(
  {
    goal: Type.Record(Type.String(), Type.Unknown()),
    context: Type.Record(Type.String(), Type.Unknown()),
    instructions: Type.Optional(Type.String({ maxLength: 20_000 })),
  },
  { additionalProperties: false },
);
type RunRequest = Static<typeof RunRequestSchema>;

const RunParamsSchema = Type.Object({ id: Type.String({ minLength: 1, maxLength: 160 }) });
type RunParams = Static<typeof RunParamsSchema>;

export interface ContractValidators {
  isAgentGoal(value: unknown): value is import("@scrollstack/contracts").AgentGoal;
  isContextPack(value: unknown): value is import("@scrollstack/contracts").ContextPack;
}

export interface BuildServerOptions {
  runtime: ScrollStackAgentRuntime;
  internalServiceToken: string;
  maxConcurrentRuns: number;
  maxRequestBytes: number;
  runTimeoutMs: number;
  signedTokenMaxAgeMs: number;
  validators?: ContractValidators;
  logger?: boolean;
}

function correlationId(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[A-Za-z0-9._:-]{1,128}$/.test(raw) ? raw : randomUUID();
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: options.maxRequestBytes,
    requestIdHeader: false,
    genReqId: (request) => correlationId(request.headers["x-correlation-id"]),
    disableRequestLogging: options.logger === false,
  });
  const validators = options.validators ?? { isAgentGoal, isContextPack };
  const registry = new RunRegistry({
    runtime: options.runtime,
    maxConcurrentRuns: options.maxConcurrentRuns,
    runTimeoutMs: options.runTimeoutMs,
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-correlation-id", request.id);
  });
  app.addHook(
    "preHandler",
    createServiceAuthHook({
      secret: options.internalServiceToken,
      maxAgeMs: options.signedTokenMaxAgeMs,
    }),
  );

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async (_request, reply) => {
    const ready = options.runtime.isReady();
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready" });
  });

  app.post<{ Body: RunRequest }>(
    "/internal/v1/agent-runs",
    { schema: { body: RunRequestSchema } },
    async (request, reply) => {
      if (!validators.isAgentGoal(request.body.goal)) {
        return reply.code(400).send({
          error: { code: "INVALID_AGENT_GOAL", message: "goal does not match AgentGoal v1" },
        });
      }
      if (!validators.isContextPack(request.body.context)) {
        return reply.code(400).send({
          error: { code: "INVALID_CONTEXT_PACK", message: "context does not match ContextPack v1" },
        });
      }

      try {
        const run = registry.start({
          goal: request.body.goal,
          context: request.body.context,
          instructions: request.body.instructions,
          correlationId: request.id,
        });
        const prefer = Array.isArray(request.headers.prefer)
          ? request.headers.prefer.join(",")
          : request.headers.prefer;
        if (prefer?.toLowerCase().includes("respond-async")) {
          return reply.code(202).send(registry.get(run.run_id));
        }
        const completed = await registry.wait(run.run_id);
        return reply.code(completed?.state === "SUCCEEDED" ? 200 : 422).send(completed);
      } catch (error) {
        if (error instanceof CapacityError) {
          reply.header("retry-after", "1");
          return reply.code(429).send({
            error: { code: "WORKER_CAPACITY_EXCEEDED", message: error.message, limit: error.limit },
          });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: RunParams }>(
    "/internal/v1/agent-runs/:id",
    { schema: { params: RunParamsSchema } },
    async (request, reply) => {
      const run = registry.get(request.params.id);
      return run
        ? reply.send(run)
        : reply.code(404).send({ error: { code: "RUN_NOT_FOUND", message: "Agent run not found" } });
    },
  );

  app.post<{ Params: RunParams }>(
    "/internal/v1/agent-runs/:id/cancel",
    { schema: { params: RunParamsSchema } },
    async (request, reply) => {
      const run = await registry.cancel(request.params.id);
      return run
        ? reply.send(run)
        : reply.code(404).send({ error: { code: "RUN_NOT_FOUND", message: "Agent run not found" } });
    },
  );

  app.setErrorHandler((error, request, reply) => {
    const appError = error as Error & { statusCode?: number };
    request.log.error({ err: appError, correlation_id: request.id }, "agent worker request failed");
    const status = appError.statusCode && appError.statusCode >= 400 ? appError.statusCode : 500;
    void reply.code(status).send({
      error: {
        code: status === 413 ? "REQUEST_TOO_LARGE" : status < 500 ? "INVALID_REQUEST" : "INTERNAL_ERROR",
        message: status < 500 ? appError.message : "Internal agent worker error",
        correlation_id: request.id,
      },
    });
  });

  return app;
}
