/** Pure logic for the page picker (#49): grouping, labels, keyboard moves, tick mode. */

export type PickerStatus = "accepted" | "failed" | "pending" | "drawing" | string;

export interface PickerPage {
  page_number: number;
  section_id: string;
  status: PickerStatus;
}

export interface PickerGroup {
  id: string;
  title: string | null;
  from: number;
  to: number;
  pages: { n: number; status: PickerStatus }[];
}

/** Smallest touch target (px) for every picker control. */
export const TARGET = 44;

/** Accessible name of one page: "Page 12", "Page 13, could not be drawn". */
export function pageLabel(n: number, status: PickerStatus): string {
  return `Page ${n}${status === "failed" ? ", could not be drawn" : status === "accepted" ? "" : ", not drawn yet"}`;
}

/**
 * Pages 1..total in groups of consecutive pages that share a section. With one
 * group (or no section names) the group has no title. Pages the edition does
 * not list yet count as pending.
 */
export function groupPages(pages: readonly PickerPage[], total: number, sections: readonly { id: string; title: string }[] = []): PickerGroup[] {
  const byNumber = new Map(pages.map((p) => [p.page_number, p]));
  const titles = new Map(sections.map((s) => [s.id, s.title]));
  const groups: PickerGroup[] = [];
  for (let n = 1; n <= total; n++) {
    const p = byNumber.get(n);
    const id = p?.section_id ?? "";
    const last = groups[groups.length - 1];
    if (last && last.id === id) {
      last.pages.push({ n, status: p?.status ?? "pending" });
      last.to = n;
    } else {
      groups.push({ id, title: titles.get(id) ?? null, from: n, to: n, pages: [{ n, status: p?.status ?? "pending" }] });
    }
  }
  if (groups.length > 1 && groups.every((g) => g.title)) return groups;
  return groups.length ? [{ id: "all", title: null, from: 1, to: total, pages: groups.flatMap((g) => g.pages) }] : [];
}

/** Grid size: how many 44 px cells (with `gap`) fit in `width`. At least 1. */
export function columns(width: number, gap = 6): number {
  return Math.max(1, Math.floor((width + gap) / (TARGET + gap)));
}

/** Next focused index for a key in a grid of `count` cells, or null when the key is not a move. */
export function moveIndex(index: number, key: string, cols: number, count: number): number | null {
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  switch (key) {
    case "ArrowRight":
      return clamp(index + 1);
    case "ArrowLeft":
      return clamp(index - 1);
    case "ArrowDown":
      return clamp(index + cols);
    case "ArrowUp":
      return clamp(index - cols);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** The page ticks in the bottom bar are buttons only when each one can be 44 px wide. */
export function ticksAreButtons(width: number, total: number): boolean {
  return total > 0 && width / total >= TARGET;
}
