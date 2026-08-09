export interface WorkerConfig {
  host: string;
  port: number;
  internalServiceToken: string;
  domainToolBrokerUrl: string;
  domainToolBrokerToken: string;
  modelProvider?: string;
  modelId?: string;
  modelApiKeyEnv: string;
  maxConcurrentRuns: number;
  maxRequestBytes: number;
  runTimeoutMs: number;
  toolTimeoutMs: number;
  signedTokenMaxAgeMs: number;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set and at least 32 characters`);
  }
  return value;
}

function optionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function loadWorkerConfig(): WorkerConfig {
  const brokerUrl = process.env.DOMAIN_TOOL_BROKER_URL;
  if (!brokerUrl) {
    throw new Error("DOMAIN_TOOL_BROKER_URL must be set");
  }
  const parsedBrokerUrl = new URL(brokerUrl);
  if (!(["http:", "https:"] as const).includes(parsedBrokerUrl.protocol as "http:" | "https:")) {
    throw new Error("DOMAIN_TOOL_BROKER_URL must use http or https");
  }

  const modelProvider = optionalString("AGENT_PROVIDER");
  const modelId = optionalString("AGENT_MODEL");
  const modelApiKeyEnv = process.env.AGENT_MODEL_API_KEY_ENV ?? "OPENAI_API_KEY";
  if ((modelProvider === undefined) !== (modelId === undefined)) {
    throw new Error("AGENT_PROVIDER and AGENT_MODEL must be configured together");
  }
  if (modelProvider === "minimax" && modelApiKeyEnv !== "MINIMAX_API_KEY") {
    throw new Error("MiniMax models require AGENT_MODEL_API_KEY_ENV=MINIMAX_API_KEY");
  }

  const internalServiceToken = requiredSecret("AGENT_WORKER_TOKEN");
  const domainToolBrokerToken = requiredSecret("DOMAIN_TOOL_BROKER_TOKEN");
  if (internalServiceToken === domainToolBrokerToken) {
    throw new Error("AGENT_WORKER_TOKEN and DOMAIN_TOOL_BROKER_TOKEN must be distinct");
  }

  return {
    host: process.env.AGENT_WORKER_HOST ?? "0.0.0.0",
    port: positiveInteger("AGENT_WORKER_PORT", 8788),
    internalServiceToken,
    domainToolBrokerUrl: parsedBrokerUrl.toString(),
    domainToolBrokerToken,
    modelProvider,
    modelId,
    modelApiKeyEnv,
    maxConcurrentRuns: positiveInteger("AGENT_MAX_CONCURRENCY", 2),
    maxRequestBytes: positiveInteger("AGENT_WORKER_MAX_REQUEST_BYTES", 2 * 1024 * 1024),
    runTimeoutMs: positiveInteger("AGENT_WORKER_RUN_TIMEOUT_MS", 15 * 60 * 1000),
    toolTimeoutMs: positiveInteger("AGENT_WORKER_TOOL_TIMEOUT_MS", 20_000),
    signedTokenMaxAgeMs: positiveInteger("AGENT_WORKER_SIGNED_TOKEN_MAX_AGE_MS", 60_000),
  };
}
