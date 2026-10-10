"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Pointer gestures on the reader stage, with no dependencies:
 * - tap the left / right third to go back / forward, the middle to show or hide the bars
 * - double tap (page mode) to zoom in or back out
 * - horizontal swipe to turn (when not zoomed)
 * - drag to move the page and pinch to zoom (page mode)
 * - ctrl + wheel (trackpad pinch) to zoom, wheel to pan while zoomed
 */
export interface GestureHandlers {
  mode: "page" | "panel";
  zoomed: boolean;
  /** The page is bigger than the stage: drag and wheel move it. */
  panable: boolean;
  enabled: boolean;
  onTapZone: (zone: "left" | "middle" | "right") => void;
  onDoubleTap: (x: number, y: number) => void;
  onSwipe: (dir: "next" | "prev") => void;
  onPan: (dx: number, dy: number) => void;
  onZoom: (factor: number, x: number, y: number) => void;
}

const DOUBLE_TAP_MS = 280;

export function useStageGestures(ref: RefObject<HTMLElement | null>, handlers: GestureHandlers) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let pinchDist: number | null = null;
    let lastTap: { x: number; y: number; t: number } | null = null;
    let tapTimer: ReturnType<typeof setTimeout> | undefined;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
    };
    const pair = () => {
      const [a, b] = [...pointers.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };

    const down = (e: PointerEvent) => {
      if (!h.current.enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ((e.target as Element | null)?.closest?.("button, a, input")) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // synthetic or already-released pointer: keep tracking without capture
      }
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        start = { x: p.x, y: p.y, t: performance.now() };
        moved = false;
      } else if (pointers.size === 2) {
        start = null;
        pinchDist = h.current.mode === "page" ? pair().d : null;
      }
    };

    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pinchDist !== null && pointers.size >= 2) {
        const { d, x, y } = pair();
        if (d > 0 && pinchDist > 0) h.current.onZoom(d / pinchDist, x, y);
        pinchDist = d;
        return;
      }
      if (!start) return;
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > 8) moved = true;
      if (moved && h.current.panable) h.current.onPan(p.x - prev.x, p.y - prev.y);
    };

    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pinchDist !== null || pointers.size > 0) {
        if (pointers.size < 2) pinchDist = null;
        start = null;
        return;
      }
      if (!start) return;
      const p = local(e);
      const s = start;
      start = null;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (moved) {
        if (!h.current.zoomed && Math.abs(dx) > 48 && Math.abs(dx) > 1.4 * Math.abs(dy) && performance.now() - s.t < 900) {
          h.current.onSwipe(dx < 0 ? "next" : "prev");
        }
        return;
      }
      const zone = p.x < p.w / 3 ? "left" : p.x > (2 * p.w) / 3 ? "right" : "middle";
      if (h.current.mode === "panel") {
        h.current.onTapZone(zone);
        return;
      }
      const now = performance.now();
      if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 40) {
        clearTimeout(tapTimer);
        lastTap = null;
        h.current.onDoubleTap(p.x, p.y);
        return;
      }
      lastTap = { x: p.x, y: p.y, t: now };
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        lastTap = null;
        if (!h.current.zoomed) h.current.onTapZone(zone);
      }, DOUBLE_TAP_MS);
    };

    const cancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = null;
      start = null;
    };

    const wheel = (e: WheelEvent) => {
      if (!h.current.enabled) return;
      if (e.ctrlKey) {
        e.preventDefault();
        if (h.current.mode !== "page") return;
        const p = local(e);
        const delta = Math.max(-50, Math.min(50, e.deltaY));
        h.current.onZoom(Math.exp(-delta * 0.012), p.x, p.y);
      } else if (h.current.panable) {
        e.preventDefault();
        h.current.onPan(-e.deltaX, -e.deltaY);
      }
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      clearTimeout(tapTimer);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("wheel", wheel);
    };
  }, [ref]);
}
