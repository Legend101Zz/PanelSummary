import { PiAgentRuntime, resolvePinnedModel } from "@scrollstack/agent-runtime";

import { loadWorkerConfig } from "./config.js";
import { buildServer } from "./server.js";
import { loadProductionSkills } from "./skills/load.js";
import { HttpDomainToolBroker } from "./tools/domain-tool-broker.js";

const config = loadWorkerConfig();
const modelSelection =
  config.modelProvider && config.modelId
    ? await resolvePinnedModel(config.modelProvider, config.modelId)
    : undefined;
const skills = await loadProductionSkills();
const broker = new HttpDomainToolBroker({
  baseUrl: config.domainToolBrokerUrl,
  token: config.domainToolBrokerToken,
  timeoutMs: config.toolTimeoutMs,
});
const runtime = new PiAgentRuntime({
  broker,
  skills,
  provider: config.modelProvider,
  model: config.modelId,
  modelSelection,
  credentialReady: () => Boolean(process.env[config.modelApiKeyEnv]),
});
const app = buildServer({
  runtime,
  internalServiceToken: config.internalServiceToken,
  maxConcurrentRuns: config.maxConcurrentRuns,
  maxRequestBytes: config.maxRequestBytes,
  runTimeoutMs: config.runTimeoutMs,
  signedTokenMaxAgeMs: config.signedTokenMaxAgeMs,
  logger: true,
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down agent worker");
  await app.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.host, port: config.port });
