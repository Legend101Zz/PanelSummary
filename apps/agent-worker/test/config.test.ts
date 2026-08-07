import { afterEach, describe, expect, it } from "vitest";

import { loadWorkerConfig } from "../src/config.js";

const originalEnv = { ...process.env };

function validBaseEnv(): void {
  process.env.AGENT_WORKER_TOKEN = "agent-worker-token-long-enough-123456";
  process.env.DOMAIN_TOOL_BROKER_URL = "http://backend:8000";
  process.env.DOMAIN_TOOL_BROKER_TOKEN = "domain-tool-token-long-enough-123456";
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("agent worker model configuration", () => {
  it("accepts the exact MiniMax credential environment mapping", () => {
    validBaseEnv();
    process.env.AGENT_PROVIDER = "minimax";
    process.env.AGENT_MODEL = "MiniMax-M3";
    process.env.AGENT_MODEL_API_KEY_ENV = "MINIMAX_API_KEY";

    const config = loadWorkerConfig();
    expect(config.modelProvider).toBe("minimax");
    expect(config.modelId).toBe("MiniMax-M3");
    expect(config.modelApiKeyEnv).toBe("MINIMAX_API_KEY");
  });

  it("rejects routing a MiniMax model through another provider credential", () => {
    validBaseEnv();
    process.env.AGENT_PROVIDER = "minimax";
    process.env.AGENT_MODEL = "MiniMax-M3";
    process.env.AGENT_MODEL_API_KEY_ENV = "OPENAI_API_KEY";

    expect(() => loadWorkerConfig()).toThrow(
      "MiniMax models require AGENT_MODEL_API_KEY_ENV=MINIMAX_API_KEY",
    );
  });

  it("rejects a partial provider/model selection", () => {
    validBaseEnv();
    process.env.AGENT_PROVIDER = "minimax";
    delete process.env.AGENT_MODEL;

    expect(() => loadWorkerConfig()).toThrow(
      "AGENT_PROVIDER and AGENT_MODEL must be configured together",
    );
  });

  it("requires distinct long service secrets", () => {
    validBaseEnv();
    process.env.DOMAIN_TOOL_BROKER_TOKEN = process.env.AGENT_WORKER_TOKEN;

    expect(() => loadWorkerConfig()).toThrow(
      "AGENT_WORKER_TOKEN and DOMAIN_TOOL_BROKER_TOKEN must be distinct",
    );
  });
});
