/** A replay package is a saved run export (scripts/acceptance/export_run.py): see docs/v0.2/F1-replay-worker.md. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { MangaPageSpec } from "@panelsummary/manga-render";

export interface SavedUnit {
  id: string;
  section_id: string;
  page_start?: number;
  page_end?: number;
  text?: string;
}

export interface SavedCall {
  goal_type: string;
  run_id: string;
  state: string;
  skill?: { name: string; version: string; hash: string };
  tokens?: { input: number; output: number; cache_read: number; cache_write: number; total?: number };
  cost_usd?: number;
  turns?: number;
}

export interface ReplayPackage {
  dir: string;
  title: string;
  understanding: { sections: { id: string; units?: string[] }[]; [key: string]: unknown };
  plan: { schema?: string; pages: { page_number: number; section_id: string }[]; omitted?: unknown[]; page_budget?: unknown };
  units: SavedUnit[];
  /** Saved page specs by page number. A page that failed in the saved run has none. */
  specs: Map<number, MangaPageSpec>;
  calls: SavedCall[];
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function loadPackage(dir: string): ReplayPackage {
  for (const name of ["understanding.json", "plan.json", "units.json"]) {
    if (!existsSync(path.join(dir, name))) throw new Error(`replay package ${dir}: ${name} is missing`);
  }
  const understanding = readJson<ReplayPackage["understanding"]>(path.join(dir, "understanding.json"));
  const plan = readJson<ReplayPackage["plan"]>(path.join(dir, "plan.json"));
  const units = readJson<SavedUnit[]>(path.join(dir, "units.json"));
  if (!Array.isArray(plan.pages) || plan.pages.length === 0) throw new Error(`replay package ${dir}: plan.json has no pages`);
  const specs = new Map<number, MangaPageSpec>();
  const judge = path.join(dir, "judge");
  if (existsSync(judge)) {
    for (const name of readdirSync(judge).sort()) {
      const match = /^page-(\d+)\.json$/.exec(name);
      if (!match) continue;
      const saved = readJson<{ page_number?: number; spec?: MangaPageSpec | null }>(path.join(judge, name));
      if (saved.spec) specs.set(Number(saved.page_number ?? match[1]), saved.spec);
    }
  }
  const receiptsFile = path.join(dir, "receipts.json");
  const calls = existsSync(receiptsFile) ? (readJson<{ calls?: SavedCall[] }>(receiptsFile).calls ?? []) : [];
  return { dir, title: String((understanding as { title?: unknown }).title ?? ""), understanding, plan, units, specs, calls };
}

export interface IdDifference {
  missing: string[];
  unexpected: string[];
}

function diff(saved: string[], given: string[]): IdDifference {
  const have = new Set(given);
  const want = new Set(saved);
  return { missing: saved.filter((id) => !have.has(id)), unexpected: given.filter((id) => !want.has(id)) };
}

export interface BookMatch {
  ok: boolean;
  sections: IdDifference;
  units: IdDifference;
  /** Units whose text differs from the saved text (a different parser version). A warning, not a failure. */
  changedText: string[];
}

/** Compare the book of a request (sections and units as the backend sends them) with the saved run. */
export function matchBook(pkg: ReplayPackage, book: { sections?: { id: string }[]; units?: { id: string; text?: string }[] }): BookMatch {
  const sections = diff(pkg.understanding.sections.map((s) => s.id), (book.sections ?? []).map((s) => s.id));
  const units = diff(pkg.units.map((u) => u.id), (book.units ?? []).map((u) => u.id));
  const saved = new Map(pkg.units.map((u) => [u.id, u.text]));
  const changedText = (book.units ?? []).filter((u) => saved.has(u.id) && saved.get(u.id) !== undefined && u.text !== saved.get(u.id)).map((u) => u.id);
  return { ok: sections.missing.length + sections.unexpected.length + units.missing.length + units.unexpected.length === 0, sections, units, changedText };
}

export function describeMismatch(pkg: ReplayPackage, match: BookMatch): string {
  const part = (label: string, d: IdDifference) =>
    [d.missing.length ? `${label} the saved run has and the upload lacks: ${d.missing.slice(0, 8).join(", ")}${d.missing.length > 8 ? ", ..." : ""}` : "", d.unexpected.length ? `${label} the upload has and the saved run lacks: ${d.unexpected.slice(0, 8).join(", ")}${d.unexpected.length > 8 ? ", ..." : ""}` : ""]
      .filter(Boolean)
      .join("; ");
  return `The uploaded PDF is not the book of the replay package (${pkg.title || pkg.dir}). ${[part("Sections", match.sections), part("Units", match.units)].filter(Boolean).join("; ")}. Upload the PDF the package was made from.`;
}

/** The saved receipt that stands for one call: for a page, the last accepted call of that page. */
export function savedCallFor(pkg: ReplayPackage, goal: string, page?: number): SavedCall | undefined {
  const matching = pkg.calls.filter((call) => {
    if (call.goal_type !== goal || call.state !== "SUCCEEDED") return false;
    if (goal !== "MANGA_PAGE") return true;
    const found = /-page(\d+)-a\d+/.exec(call.run_id);
    return found !== null && Number(found[1]) === page;
  });
  return matching[matching.length - 1];
}
