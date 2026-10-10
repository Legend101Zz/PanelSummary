// Theme: Light, Dark or "Use the system setting" (the default).
// The choice is stored per viewer in localStorage ('ps-theme') and applied as data-theme on <html>.
// "system" means no attribute: tokens.css follows prefers-color-scheme then.
// The reader and the PDF viewer ignore the theme (they are always the graphite room).

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "ps-theme";
export const THEME_EVENT = "ps-theme-change";
export const THEME_PREFS: readonly ThemePref[] = ["light", "dark", "system"];

/** Anything that is not "light" or "dark" means "system". */
export function parseTheme(value: unknown): ThemePref {
  return value === "light" || value === "dark" ? value : "system";
}

/** What the viewer sees: an explicit choice wins, otherwise the system setting. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}

/** The header button switches between Light and Dark. It always stores an explicit choice. */
export function toggleTheme(pref: ThemePref, systemDark: boolean): ThemePref {
  return resolveTheme(pref, systemDark) === "dark" ? "light" : "dark";
}

/** The attribute value for <html>, or null (remove the attribute) for "system". */
export function themeAttribute(pref: ThemePref): "light" | "dark" | null {
  return pref === "system" ? null : pref;
}

export function readTheme(storage?: Pick<Storage, "getItem"> | null): ThemePref {
  try {
    const s = storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : storage;
    return parseTheme(s ? s.getItem(THEME_KEY) : null);
  } catch {
    return "system";
  }
}

export function writeTheme(pref: ThemePref, storage?: Pick<Storage, "setItem" | "removeItem"> | null): void {
  try {
    const s = storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : storage;
    if (!s) return;
    if (pref === "system") s.removeItem(THEME_KEY);
    else s.setItem(THEME_KEY, pref);
  } catch {
    /* storage can be blocked: the choice then lasts until the page closes */
  }
}

export function applyTheme(pref: ThemePref, root?: Pick<HTMLElement, "setAttribute" | "removeAttribute">): void {
  const el = root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!el) return;
  const attr = themeAttribute(pref);
  if (attr) el.setAttribute("data-theme", attr);
  else el.removeAttribute("data-theme");
}

/**
 * The blocking script for <head> of the root layout. It runs before the first paint, so the
 * page never flashes the wrong theme. Keep it tiny and keep the try/catch: storage can throw.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
