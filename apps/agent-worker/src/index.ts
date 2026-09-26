import { installEgressRecorder } from "./egress.js";
import { buildServer } from "./server.js";

installEgressRecorder();

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

const token = process.env.AGENT_WORKER_TOKEN ?? "";
if (token.length < 32) throw new Error("AGENT_WORKER_TOKEN must be set (at least 32 characters)");
if (!process.env.MINIMAX_API_KEY) console.warn("MINIMAX_API_KEY is not set; /readyz will report not ready");

const app = buildServer({
  token,
  maxConcurrentRuns: positiveInteger("AGENT_MAX_CONCURRENCY", 4),
  logger: true,
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down agent worker");
  await app.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: process.env.AGENT_WORKER_HOST ?? "127.0.0.1", port: positiveInteger("AGENT_WORKER_PORT", 8788) });
