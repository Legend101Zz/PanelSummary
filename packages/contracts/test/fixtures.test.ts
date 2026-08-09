import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  contractSchemas,
  isReelSpec,
  validateContract,
  type ContractName,
} from "../src/index.js";

type FixtureManifest = {
  schema_version: "fixture-manifest.v1";
  fixtures: Array<{ schema: ContractName; path: string }>;
};

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(testDirectory, "..", "..", "fixtures");
const manifest = JSON.parse(
  readFileSync(resolve(fixtureRoot, "manifest.json"), "utf8"),
) as FixtureManifest;

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtureRoot, path), "utf8"));
}

function replaceAt(document: unknown, pointer: string, value: unknown): void {
  const parts = pointer.replace(/^\//, "").split("/");
  let target = document as Record<string, unknown> | unknown[];
  for (const part of parts.slice(0, -1)) {
    target = (Array.isArray(target) ? target[Number(part)] : target[part]) as
      | Record<string, unknown>
      | unknown[];
  }
  const last = parts.at(-1);
  if (!last) throw new Error("invalid fixture pointer");
  if (Array.isArray(target)) target[Number(last)] = value;
  else target[last] = value;
}

function removeAt(document: unknown, pointer: string): void {
  const parts = pointer.replace(/^\//, "").split("/");
  let target = document as Record<string, unknown> | unknown[];
  for (const part of parts.slice(0, -1)) {
    target = (Array.isArray(target) ? target[Number(part)] : target[part]) as
      | Record<string, unknown>
      | unknown[];
  }
  const last = parts.at(-1);
  if (!last) throw new Error("invalid fixture pointer");
  if (Array.isArray(target)) target.splice(Number(last), 1);
  else delete target[last];
}

describe("canonical cross-language fixtures", () => {
  for (const item of manifest.fixtures) {
    it(`validates ${item.schema}`, () => {
      const result = validateContract(item.schema, fixture(item.path));
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }

  it("keeps the fixture manifest and schema registry aligned", () => {
    expect([...new Set(manifest.fixtures.map((item) => item.schema))].sort()).toEqual(
      Object.keys(contractSchemas).sort(),
    );
  });
});

describe("strict ReelSpec boundary", () => {
  const reelPath = manifest.fixtures.find((item) => item.schema === "reel_spec.v1")?.path;
  if (!reelPath) throw new Error("reel fixture is missing");

  it("rejects an unknown scene discriminator", () => {
    const reel = fixture(reelPath) as { scenes: Array<Record<string, unknown>> };
    reel.scenes[0].scene_type = "model_authored_component";
    reel.scenes[0].component_id = "model_authored_component";
    expect(isReelSpec(reel)).toBe(false);
  });

  it("rejects arbitrary component props", () => {
    const reel = fixture(reelPath) as { scenes: Array<Record<string, unknown>> };
    reel.scenes[0].props = { remote_url: "https://attacker.invalid/payload" };
    expect(isReelSpec(reel)).toBe(false);
  });

  it("rejects a URL where an asset ID is required", () => {
    const reel = fixture(reelPath) as { scenes: Array<Record<string, unknown>> };
    reel.scenes[0].asset_id = "https://attacker.invalid/panel.png";
    expect(isReelSpec(reel)).toBe(false);
  });
});

describe("manga page-plan semantic boundary", () => {
  for (const invalidName of [
    "layout_cycle.v1.json",
    "layout_ratio.v1.json",
    "text_reference.v1.json",
  ]) {
    it(`rejects ${invalidName}`, () => {
      const invalid = fixture(`invalid/${invalidName}`) as {
        base_fixture: string;
        operation: "remove" | "replace";
        path: string;
        value?: unknown;
      };
      const document = fixture(invalid.base_fixture);
      if (invalid.operation === "remove") removeAt(document, invalid.path);
      else replaceAt(document, invalid.path, invalid.value);
      expect(validateContract("manga_page_plan.v1", document).valid).toBe(false);
    });
  }

  it("rejects a reversed chain whose page-turn panel is no longer last", () => {
    const invalid = fixture("invalid/reading_order.v1.json") as { base_fixture: string };
    const document = fixture(invalid.base_fixture) as {
      reading_edges: Array<{ from_panel_id: string; to_panel_id: string; reason: string }>;
    };
    document.reading_edges[0] = {
      from_panel_id: "panel_2",
      to_panel_id: "panel_1",
      reason: "reversed on purpose",
    };
    expect(validateContract("manga_page_plan.v1", document).valid).toBe(false);
  });
});

describe("reel delivery boundary", () => {
  const playerPath = manifest.fixtures.find(
    (item) => item.schema === "reel_player_payload.v1",
  )?.path;
  if (!playerPath) throw new Error("reel player fixture is missing");

  it("rejects a non-browser media URL", () => {
    const player = fixture(playerPath) as { poster_url: string };
    player.poster_url = "file:///etc/passwd";
    expect(validateContract("reel_player_payload.v1", player).valid).toBe(false);
  });

  it("rejects unknown progress update fields", () => {
    const progressPath = manifest.fixtures.find(
      (item) => item.schema === "series_progress_update.v1",
    )?.path;
    if (!progressPath) throw new Error("progress update fixture is missing");
    const progress = fixture(progressPath) as Record<string, unknown>;
    progress.user_id = "spoofed-user";
    expect(validateContract("series_progress_update.v1", progress).valid).toBe(false);
  });
});
