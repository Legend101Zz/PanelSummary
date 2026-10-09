"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Run `task` now and then every `ms` while `active`. Waits for each run to
 * finish before scheduling the next, pauses while the tab is hidden, and
 * never overlaps runs.
 */
export function usePoll(task: () => Promise<unknown> | unknown, ms: number, active: boolean) {
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          await taskRef.current();
        } catch {
          // the caller shows its own error state; keep polling
        }
      }
      if (!stopped) timer = setTimeout(tick, ms);
    };
    timer = setTimeout(tick, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms, active]);
}

/** matchMedia as state; `initial` is used for the first (server) render. */
export function useMedia(query: string, initial = false): boolean {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const on = () => setMatches(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");

/** Becomes true once the element has come near the viewport. */
export function useNearViewport<T extends Element>(margin = "300px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin, near]);
  return [ref, near] as const;
}

/** Date.now() as state, refreshed every `ms` while `active`. */
export function useNow(ms: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}
