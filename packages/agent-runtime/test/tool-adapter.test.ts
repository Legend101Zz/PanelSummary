import { describe, expect, it } from "vitest";

import { createBrokeredTools } from "../src/tool-adapter.js";

describe("brokered submission repair budget", () => {
  it("allows one initial submission plus the configured repairs", async () => {
    let brokerCalls = 0;
    const [tool] = createBrokeredTools({
      names: ["submit_manga_plan"],
      broker: {
        async execute() {
          brokerCalls += 1;
          throw new Error("candidate rejected");
        },
      },
      scope: {
        correlation_id: "correlation_1",
        goal_id: "goal_1",
        run_id: "run_1",
        stage_run_id: "stage_1",
        context_pack_id: "context_1",
        project_id: "project_1",
      },
      maxToolCalls: 10,
      maxRepairAttempts: 2,
      onCandidate: () => undefined,
      onToolCall: () => undefined,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        tool.execute(
          `call_${attempt}`,
          { plan: {} },
          undefined,
          undefined,
          {} as never,
        ),
      ).rejects.toThrow("candidate rejected");
    }
    await expect(
      tool.execute("call_4", { plan: {} }, undefined, undefined, {} as never),
    ).rejects.toThrow("submit_manga_plan repair budget exceeded (2 repairs)");
    expect(brokerCalls).toBe(3);
  });

  it("applies the same repair cap to thumbnail submissions", async () => {
    let brokerCalls = 0;
    const [tool] = createBrokeredTools({
      names: ["submit_thumbnail_set"],
      broker: {
        async execute() {
          brokerCalls += 1;
          throw new Error("layout rejected");
        },
      },
      scope: {
        correlation_id: "correlation_1",
        goal_id: "goal_thumbnail",
        run_id: "run_1",
        stage_run_id: "stage_thumbnail",
        context_pack_id: "context_1",
        project_id: "project_1",
      },
      maxToolCalls: 4,
      maxRepairAttempts: 1,
      onCandidate: () => undefined,
      onToolCall: () => undefined,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        tool.execute(
          `thumbnail_${attempt}`,
          { thumbnail_set: {} },
          undefined,
          undefined,
          {} as never,
        ),
      ).rejects.toThrow("layout rejected");
    }
    await expect(
      tool.execute(
        "thumbnail_3",
        { thumbnail_set: {} },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("submit_thumbnail_set repair budget exceeded (1 repairs)");
    expect(brokerCalls).toBe(2);
  });
});
