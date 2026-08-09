import { describe, expect, it } from "vitest";

import { PiAgentRuntime, resolvePinnedModel } from "../src/pi-runtime.js";

const broker = {
  execute: async () => ({ content: "unused" }),
};

describe("pinned Pi model selection", () => {
  it("resolves the exact MiniMax M3 identifier from the bundled registry", async () => {
    const selection = await resolvePinnedModel("minimax", "MiniMax-M3");

    expect(selection?.model.provider).toBe("minimax");
    expect(selection?.model.id).toBe("MiniMax-M3");
  });

  it("does not substitute another MiniMax model for an unknown identifier", async () => {
    await expect(resolvePinnedModel("minimax", "MiniMax-M3-invented")).resolves.toBeUndefined();
  });

  it("stays not-ready until the exact model credential is present", async () => {
    const selection = await resolvePinnedModel("minimax", "MiniMax-M3");
    expect(selection).toBeDefined();

    const missingCredential = new PiAgentRuntime({
      broker,
      skills: {} as never,
      provider: "minimax",
      model: "MiniMax-M3",
      modelSelection: selection,
      credentialReady: () => false,
    });
    const configured = new PiAgentRuntime({
      broker,
      skills: {} as never,
      provider: "minimax",
      model: "MiniMax-M3",
      modelSelection: selection,
      credentialReady: () => true,
    });

    expect(missingCredential.isReady()).toBe(false);
    expect(configured.isReady()).toBe(true);
  });
});
