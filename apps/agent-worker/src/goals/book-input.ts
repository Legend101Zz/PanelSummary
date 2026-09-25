/** The parsed book as the backend sends it to every goal. */
import { InputError, requireObject } from "./types.js";

export interface BookUnitInput {
  id: string;
  section_id: string;
  page_start: number;
  page_end: number;
  text: string;
}

export interface BookSectionInput {
  id: string;
  title: string;
  page_start: number;
  page_end: number;
  unit_ids: string[];
}

export interface BookInput {
  title: string;
  author: string;
  page_count: number;
  sections: BookSectionInput[];
  units: BookUnitInput[];
}

export function parseBook(value: unknown): BookInput {
  const book = requireObject(value, "book");
  const sections = book.sections;
  const units = book.units;
  if (!Array.isArray(sections) || sections.length === 0) throw new InputError("book.sections must be a non-empty array");
  if (!Array.isArray(units) || units.length === 0) throw new InputError("book.units must be a non-empty array");
  for (const unit of units) {
    const u = requireObject(unit, "book.units[]");
    if (typeof u.id !== "string" || typeof u.text !== "string" || typeof u.page_start !== "number") {
      throw new InputError("each unit needs id, section_id, page_start, page_end, text");
    }
  }
  return {
    title: String(book.title ?? ""),
    author: String(book.author ?? ""),
    page_count: Number(book.page_count ?? 0),
    sections: sections as BookSectionInput[],
    units: units as BookUnitInput[],
  };
}

export function unitIndex(book: BookInput): string {
  return book.sections
    .map((section) => {
      const units = section.unit_ids
        .map((id) => book.units.find((u) => u.id === id))
        .filter((u): u is BookUnitInput => Boolean(u))
        .map((u) => `${u.id} (pdf pp. ${u.page_start}-${u.page_end}, ${u.text.split(/\s+/).length} words)`);
      return `${section.id} "${section.title}" pdf pp. ${section.page_start}-${section.page_end}: ${units.join(", ")}`;
    })
    .join("\n");
}

export function totalWords(book: BookInput): number {
  return book.units.reduce((sum, unit) => sum + unit.text.split(/\s+/).length, 0);
}
