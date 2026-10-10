/** The last page a viewer read in an edition (this browser only; may be unavailable). */
const key = (editionId: string) => `ps:last-page:${editionId}`;

/** The page counts as reached when the reader shows it as the current page: a real page of the book, drawn or marked "could not be drawn". */
export function isReachedPage(page: number, total: number, status: string | null | undefined): boolean {
  if (!Number.isInteger(page) || page < 1) return false;
  if (total > 0 && page > total) return false;
  return status === "accepted" || status === "failed";
}

/**
 * The page "Continue from page N" may offer: the saved page, but only when it is a page of this book that is drawn
 * (or marked "could not be drawn"). A value that is out of range, or a page the edition has not drawn, gives null
 * and the book page says "Start reading".
 */
export function continuePage(saved: number | null, total: number, reachable: Iterable<number>): number | null {
  if (saved === null || !Number.isInteger(saved) || saved < 2) return null;
  if (total > 0 && saved > total) return null;
  for (const n of reachable) if (n === saved) return saved;
  return null;
}

export function readPosition(editionId: string): number | null {
  try {
    const n = Number(window.localStorage.getItem(key(editionId)));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function savePosition(editionId: string, page: number) {
  try {
    window.localStorage.setItem(key(editionId), String(page));
  } catch {
    // private mode or blocked storage: nothing to remember
  }
}

export function readPreference(name: string): string | null {
  try {
    return window.localStorage.getItem(`ps:pref:${name}`);
  } catch {
    return null;
  }
}

export function savePreference(name: string, value: string) {
  try {
    window.localStorage.setItem(`ps:pref:${name}`, value);
  } catch {
    // ignore
  }
}
