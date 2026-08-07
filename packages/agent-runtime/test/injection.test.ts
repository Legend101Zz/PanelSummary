import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentGoal, ContextPack } from "@scrollstack/contracts";
import { describe, expect, it } from "vitest";

import { AgentPolicyError, assertGoalPolicy, GOAL_POLICIES } from "../src/policies.js";
import { productionSessionPolicy } from "../src/pi-runtime.js";
import { createBrokeredTools } from "../src/tool-adapter.js";
import type { DomainToolName, DomainToolRequest } from "../src/types.js";

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
);

function fixture<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(fixtureRoot, path), "utf8")) as T;
}

const maliciousGoal = fixture<AgentGoal>("injection/malicious_agent_goal.v1.json");
const maliciousContext = fixture<ContextPack>("injection/malicious_context_pack.v1.json");
const honestGoal = fixture<AgentGoal>("canonical/agent_goal.v1.json");

const scope: DomainToolRequest["scope"] = {
  correlation_id: "corr-injection",
  goal_id: "goal-injection",
  run_id: "run-injection",
  stage_run_id: "stage-injection",
  context_pack_id: maliciousContext.context_pack_id,
  project_id: maliciousContext.project_id,
};

describe("book text cannot expand agent capability", () => {
  it("carries a real injection payload in the fixture, not a placeholder", () => {
    const excerpt = maliciousContext.source_units[0].excerpt;
    expect(excerpt).toMatch(/IGNORE ALL PREVIOUS INSTRUCTIONS/);
    expect(excerpt).toMatch(/bash/);
    expect(excerpt).toMatch(/attacker\.invalid/);
  });

  it("rejects a goal that requests built-in shell/filesystem tools", () => {
    expect(() => assertGoalPolicy(maliciousGoal)).toThrowError(AgentPolicyError);
    try {
      assertGoalPolicy(maliciousGoal);
    } catch (error) {
      expect((error as AgentPolicyError).code).toBe("UNKNOWN_TOOL");
    }
  });

  it("never lets a built-in tool appear in an approved policy", () => {
    const banned = ["bash", "read", "write", "edit", "grep", "find", "ls"];
    for (const policy of Object.values(GOAL_POLICIES)) {
      for (const tool of policy.tools) {
        expect(banned).not.toContain(tool);
      }
    }
  });

  it("pins the session to custom tools and denies every built-in capability", () => {
    const policy = productionSessionPolicy(honestGoal);
    expect(policy.noTools).toBe("builtin");
    expect(policy.excludeTools).toEqual([
      "bash",
      "read",
      "write",
      "edit",
      "grep",
      "find",
      "ls",
    ]);
    expect(policy.tools).toEqual(honestGoal.allowed_tools);
  });

  it("builds exactly the goal's allowlist — pack content adds nothing", () => {
    const tools = createBrokeredTools({
      names: honestGoal.allowed_tools as DomainToolName[],
      broker: { execute: async () => ({ content: "unused" }) },
      scope,
      maxToolCalls: 4,
      maxRepairAttempts: 1,
      onCandidate: () => {},
      onToolCall: () => {},
    });
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [...honestGoal.allowed_tools].sort(),
    );
    for (const banned of ["bash", "read", "write", "edit", "grep", "find", "ls"]) {
      expect(tools.some((tool) => tool.name === banned)).toBe(false);
    }
  });

  it("keeps the tool-call budget binding under adversarial input", async () => {
    const attempted: string[] = [];
    const tools = createBrokeredTools({
      names: ["get_source_excerpt"],
      broker: {
        execute: async (request) => {
          attempted.push(request.name);
          return { content: JSON.stringify(request.arguments) };
        },
      },
      scope,
      maxToolCalls: 2,
      maxRepairAttempts: 0,
      onCandidate: () => {},
      onToolCall: () => {},
    });
    const call = () =>
      tools[0].execute("call-id", { source_unit_id: "unit_attacker_tool" }, undefined);
    await call();
    await call();
    await expect(call()).rejects.toThrowError(/Tool-call budget exceeded/);
    expect(attempted).toHaveLength(2);
  });

  it("routes every tool result through the broker, never a direct capability", async () => {
    const seen: DomainToolRequest[] = [];
    const tools = createBrokeredTools({
      names: ["get_source_excerpt"],
      broker: {
        execute: async (request) => {
          seen.push(request);
          return { content: "bounded untrusted evidence" };
        },
      },
      scope,
      maxToolCalls: 4,
      maxRepairAttempts: 0,
      onCandidate: () => {},
      onToolCall: () => {},
    });
    await tools[0].execute(
      "call-id",
      { source_unit_id: maliciousContext.source_units[0].source_ref.source_unit_id },
      undefined,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].scope).toEqual(scope);
    expect(seen[0].name).toBe("get_source_excerpt");
  });
});
