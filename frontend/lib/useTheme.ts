"use client";

// The React hook for the theme. The pure parts (and the blocking script) are in ./theme.ts,
// which server components can import.
import { useCallback, useSyncExternalStore } from "react";
import { THEME_EVENT, applyTheme, parseTheme, readTheme, resolveTheme, toggleTheme, writeTheme } from "./theme";
import type { ResolvedTheme, ThemePref } from "./theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  const mq = window.matchMedia ? window.matchMedia(DARK_QUERY) : null;
  mq?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
    mq?.removeEventListener("change", onChange);
  };
}

// One string snapshot: "<pref>|<systemDark 0 or 1>". A string keeps useSyncExternalStore stable.
function snapshot(): string {
  const dark = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DARK_QUERY).matches : false;
  return `${readTheme()}|${dark ? 1 : 0}`;
}
const serverSnapshot = () => "system|0";

export interface ThemeState {
  /** What the viewer chose: light, dark or system. */
  pref: ThemePref;
  /** What is on screen now. */
  resolved: ResolvedTheme;
  setPref: (pref: ThemePref) => void;
  /** Switch between Light and Dark (the header button). */
  toggle: () => void;
}

export function useTheme(): ThemeState {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [rawPref, rawDark] = snap.split("|");
  const pref = parseTheme(rawPref);
  const systemDark = rawDark === "1";
  const setPref = useCallback((next: ThemePref) => {
    writeTheme(next);
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);
  const toggle = useCallback(() => setPref(toggleTheme(pref, systemDark)), [pref, systemDark, setPref]);
  return { pref, resolved: resolveTheme(pref, systemDark), setPref, toggle };
}
