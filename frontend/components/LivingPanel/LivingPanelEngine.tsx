"use client";

/**
 * LivingPanelEngine.tsx — Manga Reading Engine v2.1
 * ===================================================
 * User-controlled act progression. NO auto-advance.
 * Tap/click the panel to advance to the next act.
 * Timeline animations play within each act, but the reader
 * decides when to move forward.
 *
 * Aesthetic: Ink on paper. Screentone. Hand-drawn borders.
 * Not a tech demo. A reading experience.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type {
  LivingPanelDSL, Act, SubPanel, Layer, TimelineStep, TransitionEffect,
} from "@/lib/living-panel-types";
import {
  scheduleTimeline,
  getFromValues,
  getToValues,
} from "./AnimationSystem";
import { LayerContent } from "./LayerRenderers";
import { PaperTexture, InkBorder } from "./MangaInk";

// ============================================================
// TYPES
// ============================================================

interface LayerAnimState {
  x?: number | string;
  y?: number | string;
  opacity?: number;
  scale?: number;
  rotate?: number;
  isAnimating?: boolean;
}

interface LivingPanelEngineProps {
  dsl: LivingPanelDSL;
  className?: string;
  debug?: boolean;
  onActChange?: (actIndex: number, totalActs: number) => void;
}

// ============================================================
// ACT LAYOUT → CSS GRID
// ============================================================

const LAYOUT_GRIDS: Record<string, React.CSSProperties> = {
  "full":      { gridTemplate: `"main" 1fr / 1fr` },
  "split-h":   { gridTemplate: `"left right" 1fr / 1fr 1fr` },
  "split-v":   { gridTemplate: `"top" 1fr "bottom" 1fr / 1fr` },
  "grid-2x2":  { gridTemplate: `"tl tr" 1fr "bl br" 1fr / 1fr 1fr` },
  "grid-3":    { gridTemplate: `"left top-right" 1fr "left bottom-right" 1fr / 2fr 1fr` },
  "l-shape":   { gridTemplate: `"main side-top" 1fr "main side-bottom" 1fr / 2fr 1fr` },
  "t-shape":   { gridTemplate: `"top top" 1fr "bottom-left bottom-right" 1fr / 1fr 1fr` },
  "diagonal":  { gridTemplate: `"top-left ." 1fr ". bottom-right" 1fr / 1fr 1fr` },
  "overlap":   { gridTemplate: `"back" 1fr / 1fr` },
};

// ============================================================
// TRANSITION VARIANTS (subtle, manga-appropriate)
// ============================================================

function getTransitionVariants(effect?: TransitionEffect) {
  const dur = (effect?.duration_ms || 350) / 1000;

  switch (effect?.type) {
    case "crack":
      return {
        initial: { opacity: 0, filter: "brightness(1.8)" },
        animate: { opacity: 1, filter: "brightness(1)" },
        exit: { opacity: 0 },
        transition: { duration: dur, ease: [0.4, 0, 0.2, 1] },
      };
    case "morph":
      return {
        initial: { opacity: 0, scale: 0.97 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.02 },
        transition: { duration: dur, ease: [0.16, 1, 0.3, 1] },
      };
    case "iris":
      return {
        initial: { opacity: 0, clipPath: "circle(0% at 50% 50%)" },
        animate: { opacity: 1, clipPath: "circle(75% at 50% 50%)" },
        exit: { opacity: 0, clipPath: "circle(0% at 50% 50%)" },
        transition: { duration: dur, ease: "easeInOut" },
      };
    case "slide_left":
      return {
        initial: { opacity: 0, x: 40 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -40 },
        transition: { duration: dur, ease: [0.16, 1, 0.3, 1] },
      };
    case "cut":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.05 },
      };
    default: // fade
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: Math.max(dur, 0.25) },
      };
  }
}

// ============================================================
// MAIN ENGINE
// ============================================================

export function LivingPanelEngine({
  dsl, className = "", debug = false, onActChange,
}: LivingPanelEngineProps) {
  const [actIndex, setActIndex] = useState(0);
  const [actReady, setActReady] = useState(false);
  const { canvas, acts } = dsl;
  const currentAct = acts[actIndex];
  const isLastAct = actIndex >= acts.length - 1;

  // Notify parent of act changes
  useEffect(() => {
    onActChange?.(actIndex, acts.length);
  }, [actIndex, acts.length, onActChange]);

  // Mark act as "ready" after its timeline has had time to play
  useEffect(() => {
    setActReady(false);
    if (!currentAct) return;
    // Give the timeline some time, then show "tap to continue"
    const readyTimer = setTimeout(
      () => setActReady(true),
      Math.min(currentAct.duration_ms * 0.7, 6000),
    );
    return () => clearTimeout(readyTimer);
  }, [actIndex, currentAct]);

  // TAP TO ADVANCE (the core interaction)
  const advanceAct = useCallback(() => {
    if (!isLastAct) {
      setActIndex(i => i + 1);
    }
  }, [isLastAct]);

  if (!currentAct) return null;

  const transVariants = getTransitionVariants(currentAct.transition_in);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        width: "100%",
        aspectRatio: `${canvas.width} / ${canvas.height}`,
        maxHeight: "100%",
        cursor: isLastAct ? "default" : "pointer",
      }}
      onClick={advanceAct}
    >
      {/* Paper base */}
      <PaperTexture tone={canvas.mood === "dark" ? "dark" : "cream"} />

      {/* Ink border */}
      <InkBorder thickness={3} roughness={0.6} />

      {/* Act content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentAct.id}
          className="absolute inset-0"
          initial={transVariants.initial}
          animate={transVariants.animate}
          exit={transVariants.exit}
          transition={transVariants.transition}
        >
          <ActRenderer act={currentAct} />
        </motion.div>
      </AnimatePresence>

      {/* "Tap to continue" hint */}
      {actReady && !isLastAct && (
        <motion.div
          className="absolute bottom-3 right-3 z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <span
            style={{
              fontFamily: "var(--font-label)",
              fontSize: 9,
              color: canvas.mood === "dark" ? "#ffffff40" : "#1A182540",
              letterSpacing: "0.1em",
              textTransform: "uppercase" as const,
            }}
          >
            tap ▶
          </span>
        </motion.div>
      )}

      {/* Act dots (only if multiple acts) */}
      {acts.length > 1 && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-30 flex gap-1">
          {acts.map((_, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: i === actIndex ? 12 : 4,
                height: 3,
                background: canvas.mood === "dark"
                  ? (i === actIndex ? "#ffffff80" : "#ffffff20")
                  : (i === actIndex ? "#1A182560" : "#1A182515"),
                transition: "width 0.3s, background 0.3s",
              }}
            />
          ))}
        </div>
      )}

      {/* Debug */}
      {debug && (
        <div className="absolute top-1 left-1 z-50 px-2 py-0.5"
          style={{ background: "#000c", color: "#0f0", fontSize: 8, fontFamily: "monospace" }}>
          Act {actIndex + 1}/{acts.length} · "{currentAct.id}" · {currentAct.layout.type}
          {actReady ? " ✓" : " ◷"}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ACT RENDERER
// ============================================================

function ActRenderer({ act }: { act: Act }) {
  const gridStyle = LAYOUT_GRIDS[act.layout.type] || LAYOUT_GRIDS["full"];
  const hasCells = act.cells && act.cells.length > 0;

  return (
    <div className="absolute inset-0">
      {/* Act-level layers */}
      <ActLayerStack layers={act.layers} timeline={act.timeline} events={act.events} />

      {/* Sub-panel grid */}
      {hasCells && (
        <div
          className="absolute inset-0 z-10"
          style={{
            display: "grid",
            gap: act.layout.gap ?? 3,
            padding: act.layout.gap ?? 3,
            ...gridStyle,
          }}
        >
          {act.cells!.map((cell, i) => (
            <SubPanelRenderer
              key={cell.id}
              cell={cell}
              staggerDelay={(act.layout.stagger_ms || 0) * i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SUB-PANEL RENDERER
// ============================================================

function SubPanelRenderer({ cell, staggerDelay }: { cell: SubPanel; staggerDelay: number }) {
  return (
    <motion.div
      className="relative overflow-hidden"
      style={{
        gridArea: cell.position,
        background: cell.style?.background || "transparent",
        border: cell.style?.border || "2px solid #1A182520",
        borderRadius: cell.style?.borderRadius || 1,
        clipPath: cell.style?.clipPath,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: staggerDelay / 1000, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <ActLayerStack layers={cell.layers} timeline={cell.timeline} />
    </motion.div>
  );
}

// ============================================================
// LAYER STACK (reused for act-level and cell-level)
// ============================================================

function ActLayerStack({
  layers, timeline, events,
}: {
  layers: Layer[];
  timeline: TimelineStep[];
  events?: any[];
}) {
  const [layerStates, setLayerStates] = useState<Record<string, LayerAnimState>>(() =>
    buildInitialStates(layers, timeline)
  );
  const [activeTypewriters, setActiveTypewriters] = useState<Set<string>>(new Set());

  useEffect(() => {
    const cleanup = scheduleTimeline(timeline, (step: TimelineStep) => {
      setLayerStates(prev => ({
        ...prev,
        [step.target]: {
          ...prev[step.target],
          ...getToValues(step.animate),
          isAnimating: true,
        },
      }));
      if (step.animate.typewriter) {
        setActiveTypewriters(prev => new Set(prev).add(step.target));
      }
    });
    return cleanup;
  }, [timeline]);

  const handleClick = useCallback(
    (layerId: string) => {
      const binding = events?.find(e => e.trigger === "onClick" && e.target === layerId);
      if (!binding) return;
      for (const action of binding.actions) {
        const tid = action.target || layerId;
        if (action.type === "animate" && action.animate) {
          setLayerStates(prev => ({ ...prev, [tid]: { ...prev[tid], ...getToValues(action.animate!) } }));
        } else if (action.type === "show") {
          setLayerStates(prev => ({ ...prev, [tid]: { ...prev[tid], opacity: 1 } }));
        } else if (action.type === "hide") {
          setLayerStates(prev => ({ ...prev, [tid]: { ...prev[tid], opacity: 0 } }));
        }
      }
    },
    [events]
  );

  const sorted = useMemo(
    () => [...layers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [layers]
  );

  return (
    <>
      {sorted.map((layer, idx) => {
        if (layer.visible === false) return null;
        const state = layerStates[layer.id] || {};
        const clickable = events?.some(e => e.trigger === "onClick" && e.target === layer.id);

        return (
          <LayerWrapper
            key={layer.id}
            layer={layer}
            state={state}
            index={idx}
            onClick={() => handleClick(layer.id)}
            clickable={clickable}
          >
            <LayerContent
              layer={layer}
              isAnimating={activeTypewriters.has(layer.id) || state.isAnimating}
            />
          </LayerWrapper>
        );
      })}
    </>
  );
}

// ============================================================
// LAYER WRAPPER
// ============================================================

function LayerWrapper({
  layer, state, index, children, onClick, clickable,
}: {
  layer: Layer; state: LayerAnimState; index: number;
  children: React.ReactNode; onClick: () => void; clickable?: boolean;
}) {
  const isFullSize = layer.type === "background" || layer.type === "effect" || layer.type === "scene_transition";

  if (isFullSize) {
    return (
      <motion.div
        className="absolute inset-0"
        style={{ zIndex: layer.zIndex ?? index }}
        animate={{ opacity: state.opacity ?? layer.opacity ?? 1, scale: state.scale ?? layer.scale ?? 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="absolute"
      style={{
        zIndex: layer.zIndex ?? (10 + index),
        cursor: clickable ? "pointer" : "inherit",
        transformOrigin: layer.origin || "center center",
      }}
      animate={{
        left: state.x ?? layer.x ?? 0,
        top: state.y ?? layer.y ?? 0,
        opacity: state.opacity ?? layer.opacity ?? 1,
        scale: state.scale ?? layer.scale ?? 1,
        rotate: state.rotate ?? layer.rotate ?? 0,
      }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      onClick={clickable ? (e) => { e.stopPropagation(); onClick(); } : undefined}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// INITIAL STATE BUILDER
// ============================================================

function buildInitialStates(
  layers: Layer[], timeline: TimelineStep[],
): Record<string, LayerAnimState> {
  const states: Record<string, LayerAnimState> = {};
  for (const layer of layers) {
    states[layer.id] = {
      x: layer.x, y: layer.y,
      opacity: layer.opacity ?? 1,
      scale: layer.scale ?? 1,
      rotate: layer.rotate ?? 0,
      isAnimating: false,
    };
    const firstStep = timeline.find(s => s.target === layer.id);
    if (firstStep) {
      states[layer.id] = { ...states[layer.id], ...getFromValues(firstStep.animate) };
    }
  }
  return states;
}

// ============================================================
// CSS KEYFRAMES
// ============================================================

export function LivingPanelStyles() {
  return (
    <style jsx global>{`
      @keyframes stagger-in {
        0% { transform: translateX(-12px); opacity: 0; }
        100% { transform: translateX(0); opacity: 1; }
      }
      @keyframes float-gentle {
        0%, 100% { transform: translateY(-3px); }
        50% { transform: translateY(3px); }
      }
      @keyframes pulse-glow {
        0%, 100% { transform: scale(0.97); }
        50% { transform: scale(1.03); }
      }
    `}</style>
  );
}

export default LivingPanelEngine;
