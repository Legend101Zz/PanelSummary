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

describe("brokered read-tool results", () => {
  it("carries the bounded data payload in the model-visible text", async () => {
    // Session 4 regression (ADR-012 addendum): the pinned Pi SDK never sends
    // `details` to the model, so read tools MUST serialize their data into
    // the content text or the model only sees the one-line summary.
    const [tool] = createBrokeredTools({
      names: ["get_manga_canon"],
      broker: {
        async execute() {
          return {
            content: "Accepted project-scoped manga canon returned.",
            data: {
              artifacts: [{ artifact_id: "manga_plan_1", content: { beats: ["<b>"] } }],
            },
          };
        },
      },
      scope: {
        correlation_id: "correlation_1",
        goal_id: "goal_read",
        run_id: "run_1",
        stage_run_id: "stage_1",
        context_pack_id: "context_1",
        project_id: "project_1",
      },
      maxToolCalls: 4,
      maxRepairAttempts: 1,
      onCandidate: () => undefined,
      onToolCall: () => undefined,
    });

    const result = await tool.execute(
      "read_1",
      { artifact_ids: ["manga_plan_1"] },
      undefined,
      undefined,
      {} as never,
    );
    const [part] = result.content as [{ type: string; text: string }];
    expect(part.type).toBe("text");
    expect(part.text).toContain("Accepted project-scoped manga canon returned.");
    expect(part.text).toContain('"artifact_id":"manga_plan_1"');
    expect(part.text).toContain("<tool_data>");
    // Raw angle brackets from payloads stay escaped inside the wrapper.
    expect(part.text).not.toContain("<b>");
  });

  it("projects validate_layout_draft data to the model and keeps the full payload in details", async () => {
    // Session 5 regression (ADR-012 addendum): the live thumbnail goal burned
    // ~158k input tokens on the compiled_layout + preview_svg echo. The model
    // sees only the verdict, issues, and normalized plan; the control plane
    // keeps everything through `details`.
    const fullData = {
      passed: false,
      compiler_hash: "hash_1",
      preview_hash: "hash_2",
      issues: [{ code: "RTL_READING_FLOW_INCOHERENT", severity: "error" }],
      normalized_page_plan: { page_plan_id: "plan_1" },
      compiled_layout: { panels: [{ panel_id: "panel_1", clip_path: "M0 0" }] },
      preview_svg: "<svg>giant-preview-payload</svg>",
    };
    const [tool] = createBrokeredTools({
      names: ["validate_layout_draft"],
      broker: {
        async execute() {
          return {
            content: "Layout draft compiled without any provider or image call.",
            data: fullData,
          };
        },
      },
      scope: {
        correlation_id: "correlation_1",
        goal_id: "goal_layout",
        run_id: "run_1",
        stage_run_id: "stage_1",
        context_pack_id: "context_1",
        project_id: "project_1",
      },
      maxToolCalls: 4,
      maxRepairAttempts: 1,
      onCandidate: () => undefined,
      onToolCall: () => undefined,
    });

    const result = await tool.execute(
      "layout_1",
      { page_plan: {}, script_set_artifact_id: "script_1", page_index: 0 },
      undefined,
      undefined,
      {} as never,
    );
    const [part] = result.content as [{ type: string; text: string }];
    expect(part.text).toContain('"passed":false');
    expect(part.text).toContain('"RTL_READING_FLOW_INCOHERENT"');
    expect(part.text).toContain('"normalized_page_plan"');
    expect(part.text).toContain('"compiler_hash":"hash_1"');
    expect(part.text).not.toContain("compiled_layout");
    expect(part.text).not.toContain("preview_svg");
    expect(part.text).not.toContain("giant-preview-payload");
    expect(result.details).toEqual(fullData);
  });

  it("passes the compilation-failure shape through the projection unchanged", async () => {
    const [tool] = createBrokeredTools({
      names: ["validate_layout_draft"],
      broker: {
        async execute() {
          return {
            content: "Layout draft failed deterministic compilation.",
            data: { passed: false, issues: [{ code: "LAYOUT_COMPILE_FAILED" }] },
          };
        },
      },
      scope: {
        correlation_id: "correlation_1",
        goal_id: "goal_layout",
        run_id: "run_1",
        stage_run_id: "stage_1",
        context_pack_id: "context_1",
        project_id: "project_1",
      },
      maxToolCalls: 4,
      maxRepairAttempts: 1,
      onCandidate: () => undefined,
      onToolCall: () => undefined,
    });

    const result = await tool.execute(
      "layout_2",
      { page_plan: {}, script_set_artifact_id: "script_1", page_index: 0 },
      undefined,
      undefined,
      {} as never,
    );
    const [part] = result.content as [{ type: string; text: string }];
    expect(part.text).toContain('"passed":false');
    expect(part.text).toContain('"LAYOUT_COMPILE_FAILED"');
  });
});
