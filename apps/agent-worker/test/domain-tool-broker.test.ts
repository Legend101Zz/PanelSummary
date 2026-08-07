import { describe, expect, it } from "vitest";

import { HttpDomainToolBroker } from "../src/tools/domain-tool-broker.js";

describe("domain tool broker validation feedback", () => {
  it("returns bounded typed backend validation details to the sealed agent", async () => {
    const broker = new HttpDomainToolBroker({
      baseUrl: "http://backend:8000",
      token: "domain-tool-token-long-enough-123456",
      timeoutMs: 1_000,
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "artifact_validation_failed",
              message: "MangaPlan omits selected ContextPack source units",
            },
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    });

    await expect(
      broker.execute({
        name: "submit_manga_plan",
        arguments: { plan: {} },
        scope: {
          correlation_id: "correlation_1",
          goal_id: "goal_1",
          run_id: "run_1",
          stage_run_id: "stage_1",
          context_pack_id: "context_1",
          project_id: "project_1",
        },
      }),
    ).rejects.toThrow(
      "artifact_validation_failed: MangaPlan omits selected ContextPack source units",
    );
  });
});
