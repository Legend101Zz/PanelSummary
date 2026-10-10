import { describe, expect, it } from "vitest";
import { THEME_KEY, THEME_SCRIPT, applyTheme, parseTheme, readTheme, resolveTheme, themeAttribute, toggleTheme, writeTheme } from "./theme";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

describe("theme", () => {
  it("parses only light and dark; everything else is system", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("blue")).toBe("system");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
  });

  it("resolves system by the system setting and an explicit choice by itself", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("toggles between light and dark from what is on screen", () => {
    expect(toggleTheme("system", true)).toBe("light");
    expect(toggleTheme("system", false)).toBe("dark");
    expect(toggleTheme("light", false)).toBe("dark");
    expect(toggleTheme("dark", true)).toBe("light");
  });

  it("maps a choice to the html attribute", () => {
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("system")).toBeNull();
  });

  it("reads and writes the choice in storage", () => {
    const s = memoryStorage();
    expect(readTheme(s)).toBe("system");
    writeTheme("dark", s);
    expect(s.data[THEME_KEY]).toBe("dark");
    expect(readTheme(s)).toBe("dark");
    writeTheme("system", s);
    expect(THEME_KEY in s.data).toBe(false);
  });

  it("survives storage that throws", () => {
    const bad = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTheme(bad)).toBe("system");
    expect(() => writeTheme("dark", bad)).not.toThrow();
  });

  it("sets and removes the attribute", () => {
    const attrs: Record<string, string> = {};
    const el = { setAttribute: (k: string, v: string) => void (attrs[k] = v), removeAttribute: (k: string) => void delete attrs[k] };
    applyTheme("dark", el);
    expect(attrs["data-theme"]).toBe("dark");
    applyTheme("system", el);
    expect("data-theme" in attrs).toBe(false);
  });

  it("the inline script sets the attribute for a stored choice and ignores bad values", () => {
    const run = (stored: string | null, throws = false) => {
      const attrs: Record<string, string> = {};
      const localStorage = {
        getItem: () => {
          if (throws) throw new Error("blocked");
          return stored;
        },
      };
      const document = { documentElement: { setAttribute: (k: string, v: string) => void (attrs[k] = v) } };
      new Function("localStorage", "document", THEME_SCRIPT)(localStorage, document);
      return attrs["data-theme"];
    };
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run("system")).toBeUndefined();
    expect(run(null)).toBeUndefined();
    expect(run("dark", true)).toBeUndefined();
  });
});
