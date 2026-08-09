import { describe, expect, it } from "vitest";

import { frontmatterVersion, loadProductionSkills } from "../src/skills/load.js";

describe("skill loading (Session 8: honest served versions)", () => {
  it("parses the version out of SKILL.md frontmatter", () => {
    expect(frontmatterVersion("---\nname: x\nversion: 1.6.0\n---\nbody")).toBe("1.6.0");
    expect(frontmatterVersion("---\nversion: 2.0.1-rc\n---\n")).toBe("2.0.1-rc");
  });

  it("falls back to 0.0.0 when no frontmatter version exists", () => {
    expect(frontmatterVersion("no frontmatter at all")).toBe("0.0.0");
    expect(frontmatterVersion("---\nname: x\n---\nversion: 9.9.9 in body")).toBe("0.0.0");
  });

  it("serves the on-disk frontmatter version, not a hardcoded constant", async () => {
    // Traces used to report "1.0.0" forever while SKILL.md advanced —
    // receipts could not prove which skill wording a paid attempt ran
    // under. The served version must now track the primary SKILL.md.
    const skills = await loadProductionSkills();
    expect(skills.MANGA_THUMBNAIL.version).toBe("1.6.0");
    for (const skill of Object.values(skills)) {
      expect(skill.version).not.toBe("0.0.0");
      expect(skill.content_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
