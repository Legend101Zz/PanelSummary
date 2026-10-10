import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// frontend/app/tokens.css must stay a byte copy of docs/design/tokens.css.
describe("tokens.css", () => {
  it("is a byte copy of docs/design/tokens.css", () => {
    const app = readFileSync(resolve(__dirname, "../app/tokens.css"));
    const design = readFileSync(resolve(__dirname, "../../docs/design/tokens.css"));
    expect(app.equals(design)).toBe(true);
  });

  it("does not redefine a reader token", () => {
    const css = readFileSync(resolve(__dirname, "../app/tokens.css"), "utf8");
    // strip comments first: the file lists the reader tokens in a comment on purpose
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/--(graphite|on-graphite|pencil|redpen|sheet|ink|rule|board|font-title|font-ui|ease|page-ratio|gutter)\b/);
  });
});
