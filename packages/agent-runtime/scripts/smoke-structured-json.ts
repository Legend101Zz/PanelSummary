/**
 * Tiny structured-JSON smoke through the SAME pinned-Pi driver (issue #3).
 *
 * History gate: MiniMax highspeed models have failed exactly this before
 * (M2.5-highspeed, 2026-07-10) — never burn a full goal on a model before
 * its structured-JSON smoke passes. This script mirrors the sealed
 * `PiAgentRuntime` session construction (bundled catalog only, in-memory
 * settings, sealed resource loader, no built-in tools) and asks for one
 * exact JSON object. PASS = the reply parses to `{"ready": true, ...}`
 * under the same thinking-stripping extraction the production fallback
 * uses (candidate-fallback.ts).
 *
 * Usage (MINIMAX_API_KEY exported):
 *   cd apps/agent-worker && pnpm exec tsx scripts/smoke-structured-json.ts [modelId]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { resolvePinnedModel } from "@scrollstack/agent-runtime";

const PROVIDER = "minimax";
const modelId = process.argv[2] ?? "MiniMax-M2.7-highspeed";

// Mirrors candidate-fallback.ts parseObject (not exported by the package).
function parseObject(text: string): Record<string, unknown> | undefined {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(withoutThinking)?.[1];
  const candidates = fenced ? [fenced, withoutThinking] : [withoutThinking];
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // only exact JSON objects count
    }
  }
  return undefined;
}

function lastAssistantText(messages: readonly unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as Record<string, unknown> | null;
    if (!message || message.role !== "assistant") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      const texts = message.content
        .map((part) => {
          const record = part as Record<string, unknown>;
          return record?.type === "text" && typeof record.text === "string" ? record.text : "";
        })
        .filter(Boolean);
      if (texts.length > 0) return texts.join("\n");
    }
  }
  return undefined;
}

async function main(): Promise<number> {
  if (!process.env.MINIMAX_API_KEY) {
    console.error("FAIL: MINIMAX_API_KEY must be exported");
    return 2;
  }
  const selection = await resolvePinnedModel(PROVIDER, modelId);
  if (!selection) {
    console.error(`FAIL: ${PROVIDER}/${modelId} does not resolve from the bundled catalog`);
    return 2;
  }

  const systemPrompt =
    "You are a JSON echo service. Reply with exactly the JSON object the user " +
    "requests: no prose, no markdown fences, no additional keys.";
  const settingsManager = SettingsManager.inMemory({
    defaultProvider: PROVIDER,
    defaultModel: modelId,
    enableAnalytics: false,
    enableInstallTelemetry: false,
    images: { blockImages: true, autoResize: false },
    retry: { enabled: true, maxRetries: 2 },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt,
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    promptsOverride: () => ({ prompts: [], diagnostics: [] }),
    themesOverride: () => ({ themes: [], diagnostics: [] }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    noTools: "builtin",
    excludeTools: ["bash", "read", "write", "edit", "grep", "find", "ls"],
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    resourceLoader,
    modelRuntime: selection.runtime,
    model: { ...selection.model, maxTokens: 4096 },
  });

  const startedAt = performance.now();
  await session.prompt(
    'Return exactly this JSON object: {"ready": true, "lane": "structured-json-smoke"}',
    { expandPromptTemplates: false, source: "rpc" },
  );
  await session.waitForIdle();
  const latencyMs = Math.round(performance.now() - startedAt);

  const text = lastAssistantText(session.messages) ?? "";
  const parsed = parseObject(text);
  const stats = session.getSessionStats();
  const passed = parsed?.ready === true;

  const receipt = {
    smoke: "structured-json",
    provider: PROVIDER,
    model: session.model?.id ?? modelId,
    session_id: session.sessionId,
    tokens: stats.tokens,
    cost_usd: stats.cost,
    latency_ms: latencyMs,
    assistant_text: text.slice(0, 2_000),
    parsed: parsed ?? null,
    passed,
    created_at: new Date().toISOString(),
  };
  const outDir = path.resolve(process.cwd(), "../../docs/evidence/session4-bakeoff");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `smoke_${modelId.replaceAll(".", "_")}.json`);
  writeFileSync(outPath, JSON.stringify(receipt, null, 2));

  console.log(JSON.stringify(receipt, null, 2));
  console.log(passed ? `PASS: ${modelId} structured-JSON smoke` : `FAIL: ${modelId} smoke`);
  return passed ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error("FAIL:", error);
    process.exit(1);
  },
);
