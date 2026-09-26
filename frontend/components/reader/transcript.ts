import type { EditionPage, PagePanel, PageText, SourceRef } from "@/lib/api";

export interface PanelTranscript {
  panel: PagePanel;
  /** 1-based position in reading order. */
  number: number;
  texts: PageText[];
  sources: SourceRef[];
}

/** Panels in reading order with their lettering (in index order) and source refs. */
export function transcript(page: EditionPage): PanelTranscript[] {
  const sourcesByPanel = new Map(page.sources.map((s) => [s.panel, s.source]));
  return [...page.panels]
    .sort((a, b) => a.order - b.order)
    .map((panel, i) => ({
      panel,
      number: i + 1,
      texts: page.texts.filter((t) => t.panel === panel.id).sort((a, b) => a.index - b.index),
      sources: sourcesByPanel.get(panel.id) ?? [],
    }));
}

export function uniquePages(refs: SourceRef[]): number[] {
  return [...new Set(refs.map((r) => r.page).filter((p) => Number.isInteger(p) && p > 0))].sort((a, b) => a - b);
}
