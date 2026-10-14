/**
 * v0.3 D1a (#81): the stand-ins change nothing for a page that uses none of them. The pages of the
 * Happy Prince fixture and of run 8 (46 pages) render byte for byte as they did in manga-render 0.6.1
 * (release/v0.3 with the D2 camera push; the SHA-256 prefix of each SVG, taken from that renderer and stored in fixtures/gold-0.6.1.json),
 * except the deliberate changes of 0.7.0:
 *  - a rat or a mouse that sits, talks, points or waves now sits hunched (run 8 page 26: the Water-rat talks);
 *  - an animal of nominal height 45 or more (a horse, a bear) is no longer "small" for the camera;
 *  - an abstract place that lists features now draws them;
 *  - the word "blade" no longer makes a beat mention a sword.
 * A page that differs for another reason is a regression: fix the renderer, do not edit this list.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderPageDetailed } from "../src/index.js";
import { BOOK, PAGES } from "./fixtures/happy-prince.js";
import gold from "./fixtures/gold-0.6.1.json";
import r8book from "./fixtures/run8/book.json";
import r8pages from "./fixtures/run8/pages.json";

const hash = (svg: string) => createHash("sha256").update(svg).digest("hex").slice(0, 16);
const DELIBERATE: Record<string, string> = { "r8-26": "a rat that talks sits hunched (rodent sit)" };

describe("pages with no new value render as in 0.6.1, except the deliberate changes", () => {
  const rendered: Record<string, string> = {};
  PAGES.forEach((p, i) => {
    rendered[`hp-${i + 1}`] = hash(renderPageDetailed(p, BOOK).result.svg);
  });
  const pages = (Array.isArray(r8pages) ? r8pages : (r8pages as { pages: unknown[] }).pages) as { spec?: { page_number?: number } }[];
  pages.forEach((p, i) => {
    const spec = (p.spec ?? p) as { page_number?: number };
    rendered[`r8-${spec.page_number ?? i + 1}`] = hash(renderPageDetailed(spec, r8book as never).result.svg);
  });
  it("covers every stored page", () => {
    expect(Object.keys(rendered).sort()).toEqual(Object.keys(gold).sort());
  });
  for (const name of Object.keys(gold)) {
    if (DELIBERATE[name]) {
      it(`${name} changes on purpose: ${DELIBERATE[name]}`, () => {
        expect(rendered[name]).not.toBe((gold as Record<string, string>)[name]);
      });
    } else {
      it(`${name} is byte for byte the 0.6.1 page`, () => {
        expect(rendered[name]).toBe((gold as Record<string, string>)[name]);
      });
    }
  }
});
