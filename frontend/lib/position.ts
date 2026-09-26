/** The last page a viewer read in an edition (this browser only; may be unavailable). */
const key = (editionId: string) => `ps:last-page:${editionId}`;

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
