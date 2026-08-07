import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { ProductionSkill, SupportedGoalType } from "@scrollstack/agent-runtime";

const SKILL_PATHS: Readonly<Record<SupportedGoalType, readonly URL[]>> = {
  BOOK_CANON: [new URL("./book-canon/SKILL.md", import.meta.url)],
  MANGA_DIRECTION: [
    new URL("./manga-direction/SKILL.md", import.meta.url),
    new URL("./manga-direction/references/manga-plan-v1.md", import.meta.url),
    new URL("./manga-direction/references/manga-grammar.md", import.meta.url),
    new URL("./manga-direction/references/source-grounding.md", import.meta.url),
  ],
  MANGA_PAGE_WRITING: [new URL("./manga-page-writing/SKILL.md", import.meta.url)],
  MANGA_THUMBNAIL: [new URL("./manga-thumbnail/SKILL.md", import.meta.url)],
  MANGA_COMPOSITION: [
    new URL("./manga-composition/SKILL.md", import.meta.url),
    new URL("./manga-composition/references/panel-rhythm.md", import.meta.url),
    new URL("./manga-composition/references/bubbles-and-narration.md", import.meta.url),
    new URL("./manga-composition/references/asset-reuse.md", import.meta.url),
  ],
  REEL_DIRECTION: [
    new URL("./reel-direction/SKILL.md", import.meta.url),
    new URL("./reel-direction/references/pacing.md", import.meta.url),
    new URL("./reel-direction/references/manga-camera-language.md", import.meta.url),
    new URL("./reel-direction/references/reel-safe-zones.md", import.meta.url),
  ],
};

function skillName(goalType: SupportedGoalType): string {
  return goalType.toLowerCase().replaceAll("_", "-");
}

export async function loadProductionSkills(): Promise<Readonly<Record<SupportedGoalType, ProductionSkill>>> {
  const entries = await Promise.all(
    Object.entries(SKILL_PATHS).map(async ([goalType, urls]) => {
      const parts = await Promise.all(
        urls.map(async (url) => {
          const source = await readFile(fileURLToPath(url), "utf8");
          return `\n<!-- approved-resource:${url.pathname.split("/").at(-1)} -->\n${source}`;
        }),
      );
      const content = parts.join("\n");
      const value: ProductionSkill = {
        name: skillName(goalType as SupportedGoalType),
        version: "1.0.0",
        content,
        content_hash: createHash("sha256").update(content).digest("hex"),
      };
      return [goalType, value] as const;
    }),
  );
  return Object.fromEntries(entries) as Readonly<Record<SupportedGoalType, ProductionSkill>>;
}
