/**
 * The reader's camera is the root viewBox of the persisted page SVG (page
 * units, 1000 x 1500). A camera always has the stage's aspect ratio, so the
 * default preserveAspectRatio ("xMidYMid meet") maps it exactly and nothing is
 * ever stretched.
 */
import { useCallback, useRef } from "react";
import type { Box } from "@/lib/api";

export interface Cam {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}

export const PAGE: Box = { x: 0, y: 0, w: 1000, h: 1500 };

/** Scale (px per page unit) that fits `box` in the stage with `pad` px around it. */
export function fitScale(box: Pick<Box, "w" | "h">, stage: Size, pad: number): number {
  return Math.max(0.01, Math.min((stage.w - 2 * pad) / box.w, (stage.h - 2 * pad) / box.h));
}

/** Camera centred on (cx, cy) at `scale` px per unit. */
export function camAt(cx: number, cy: number, scale: number, stage: Size): Cam {
  const w = stage.w / scale;
  const h = stage.h / scale;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Whole page, fitted. */
export function pageCam(stage: Size, pad: number): Cam {
  return camAt(PAGE.w / 2, PAGE.h / 2, fitScale(PAGE, stage, pad), stage);
}

/**
 * Page zoomed by `zoom` (1 = fitted) around the requested centre, clamped so
 * the page cannot be dragged away from the stage.
 */
export function zoomCam(stage: Size, pad: number, zoom: number, cx: number, cy: number): { cam: Cam; cx: number; cy: number } {
  const scale = fitScale(PAGE, stage, pad) * zoom;
  const vw = stage.w / scale;
  const vh = stage.h / scale;
  const clamp = (c: number, view: number, size: number) => (view >= size ? size / 2 : Math.min(size - view / 2, Math.max(view / 2, c)));
  const x = clamp(cx, vw, PAGE.w);
  const y = clamp(cy, vh, PAGE.h);
  return { cam: camAt(x, y, scale, stage), cx: x, cy: y };
}

/** A panel's bounding box with breathing room, fitted; never more than `maxZoom` x the page fit. */
export function panelCam(bbox: Box, stage: Size, pad: number, maxZoom = 4): Cam {
  const margin = 18;
  const box = { x: bbox.x - margin, y: bbox.y - margin, w: bbox.w + 2 * margin, h: bbox.h + 2 * margin };
  const scale = Math.min(fitScale(box, stage, pad), fitScale(PAGE, stage, pad) * maxZoom);
  const cam = camAt(box.x + box.w / 2, box.y + box.h / 2, scale, stage);
  // Keep the camera on the page where it can: spare space shows neighbouring
  // (dimmed) panels instead of empty background above or below the page.
  const clampAxis = (start: number, view: number, size: number) => (view >= size ? (size - view) / 2 : Math.min(size - view, Math.max(0, start)));
  return { ...cam, x: clampAxis(cam.x, cam.w, PAGE.w), y: clampAxis(cam.y, cam.h, PAGE.h) };
}

/** Page point under a stage pixel for the given camera. */
export function toPage(cam: Cam, stage: Size, px: number, py: number) {
  return { x: cam.x + (px / stage.w) * cam.w, y: cam.y + (py / stage.h) * cam.h };
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Keeps every registered <svg> on one viewBox and animates between cameras
 * with requestAnimationFrame (instant when `animate` is false).
 */
export function useCameraRig() {
  const targets = useRef(new Set<SVGSVGElement>());
  const current = useRef<Cam | null>(null);
  const frame = useRef<number | null>(null);

  const apply = useCallback((cam: Cam) => {
    current.current = cam;
    const vb = `${cam.x.toFixed(2)} ${cam.y.toFixed(2)} ${cam.w.toFixed(2)} ${cam.h.toFixed(2)}`;
    targets.current.forEach((el) => {
      if (el.isConnected) el.setAttribute("viewBox", vb);
      else targets.current.delete(el);
    });
  }, []);

  const register = useCallback(
    (el: SVGSVGElement | null) => {
      if (!el) return;
      targets.current.add(el);
      if (current.current) apply(current.current);
    },
    [apply],
  );

  const setCam = useCallback(
    (to: Cam, animate: boolean, duration = 380) => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      const from = current.current;
      if (!animate || !from) {
        apply(to);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);
        apply({
          x: from.x + (to.x - from.x) * k,
          y: from.y + (to.y - from.y) * k,
          w: from.w + (to.w - from.w) * k,
          h: from.h + (to.h - from.h) * k,
        });
        frame.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      frame.current = requestAnimationFrame(step);
    },
    [apply],
  );

  return { register, setCam, current };
}
