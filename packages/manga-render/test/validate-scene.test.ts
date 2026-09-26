import { describe, expect, it } from "vitest";
import { validatePage } from "../src/index.js";
import type { MangaPageSpec } from "../src/contracts.js";
import { BOOK, PAGES, PLAN } from "./fixtures/happy-prince.js";

const clone = (n: number) => JSON.parse(JSON.stringify(PAGES[n - 1])) as MangaPageSpec;
const planned = (n: number) => PLAN.pages.find((p) => p.page_number === n)!;
const codes = (spec: MangaPageSpec, n: number) => validatePage(spec, BOOK, planned(n)).map((i) => `${i.severity}:${i.code}`);

describe("story is drawn, not narrated", () => {
  it("accepts the fixture pages as they are", () => {
    for (const page of PAGES) {
      const found = codes(JSON.parse(JSON.stringify(page)), page.page_number);
      expect(found).not.toContain("error:SCENE_NOT_DRAWN");
      expect(found).not.toContain("error:PLANNED_CAST_MISSING");
    }
  });

  it("rejects a page whose panels are mostly empty narration (SCENE_NOT_DRAWN)", () => {
    const spec = clone(1);
    for (const panel of spec.panels) {
      panel.figures = [];
      panel.props = [];
      panel.text = [{ kind: "narration", text: "Something happened here, told rather than shown.", fidelity: "paraphrase", source: panel.source[0] }];
      panel.shot = panel.shot === "insert" ? "wide" : panel.shot;
    }
    const found = codes(spec, 1);
    expect(found).toContain("error:SCENE_NOT_DRAWN");
    expect(found).toContain("error:PLANNED_CAST_MISSING");
  });

  it("warns when narration carries most of the words (PROSE_WALL)", () => {
    const spec = clone(1);
    spec.panels[0].text = [
      { kind: "narration", text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.", fidelity: "paraphrase", source: spec.panels[0].source[0] },
      { kind: "narration", text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.", fidelity: "paraphrase", source: spec.panels[0].source[0] },
      { kind: "narration", text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.", fidelity: "paraphrase", source: spec.panels[0].source[0] },
    ];
    expect(codes(spec, 1)).toContain("warning:PROSE_WALL");
  });
});
