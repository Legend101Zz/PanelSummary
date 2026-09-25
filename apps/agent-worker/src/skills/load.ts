import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { GoalSkill } from "@scrollstack/agent-runtime";

export function frontmatterVersion(source: string): string {
  const match = /^---\n[\s\S]*?^version:\s*([^\s]+)\s*$/m.exec(source);
  return match?.[1] ?? "0.0.0";
}

const cache = new Map<string, Promise<GoalSkill>>();

/** Loads skills/<name>/SKILL.md plus every file in skills/<name>/references/ listed in its frontmatter `references:`. */
export function loadSkill(name: string): Promise<GoalSkill> {
  let pending = cache.get(name);
  if (!pending) {
    pending = (async () => {
      const url = new URL(`./${name}/SKILL.md`, import.meta.url);
      const source = await readFile(fileURLToPath(url), "utf8");
      const refs = /^references:\s*\[(.*)\]\s*$/m.exec(source)?.[1]?.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean) ?? [];
      const parts = [source];
      for (const ref of refs) {
        const refUrl = new URL(`./${name}/references/${ref}`, import.meta.url);
        parts.push(`\n<!-- reference:${ref} -->\n${await readFile(fileURLToPath(refUrl), "utf8")}`);
      }
      const includes = /^includes:\s*\[(.*)\]\s*$/m.exec(source)?.[1]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      for (const included of includes) {
        const other = await loadSkill(included);
        parts.push(`\n<!-- included-skill:${included}@${other.version} -->\n${other.content}`);
      }
      const content = parts.join("\n");
      return {
        name,
        version: frontmatterVersion(source),
        content,
        contentHash: createHash("sha256").update(content).digest("hex"),
      };
    })();
    cache.set(name, pending);
  }
  return pending;
}
