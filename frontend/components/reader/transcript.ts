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

/**
 * Names of the people who speak on a page. The backend names only the cast of the book
 * (understanding). A minor figure of the page goal (a child, a workman, a watchman) has the id
 * `m_<word>` and comes with an empty name, so the drawer showed "Someone". The word is in the
 * id: "m_old_woman" is "An old woman" (the same text the page goal gives the figure).
 */
export function minorSpeakerName(id: string): string | undefined {
  const word = /^m_([a-z]+(?:_[a-z]+)*)$/.exec(id)?.[1]?.replace(/_/g, " ");
  if (!word) return undefined;
  return `${/^[aeiou]/.test(word) ? "An" : "A"} ${word}`;
}

export function speakerNames(page: Pick<EditionPage, "speakers" | "texts"> | null): Record<string, string> {
  const names: Record<string, string> = { ...(page?.speakers ?? {}) };
  for (const t of page?.texts ?? []) {
    if (t.speaker && !names[t.speaker]) {
      const minor = minorSpeakerName(t.speaker);
      if (minor) names[t.speaker] = minor;
    }
  }
  return names;
}
