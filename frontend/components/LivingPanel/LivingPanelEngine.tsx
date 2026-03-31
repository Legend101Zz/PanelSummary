/**
 * LivingPanelEngine.tsx — Act-Based Rendering Engine v2.0
 * ========================================================
 * Interprets DSL v2.0 with Acts, sub-panels, and transitions.
 *
 * ARCHITECTURE:
 * 1. Parse DSL → extract ordered Acts
 * 2. Auto-advance through acts (or manual control)
 * 3. Each act renders its layout (full, split, grid) with sub-panels
 * 4. Each sub-panel has its own layer tree + timeline
 * 5. Transitions between acts use cinematic effects
 *
 * This is not After Effects. This is manga that breathes.
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
  autoplay?: boolean;
  debug?: boolean;
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
// TRANSITION VARIANTS
// ============================================================

function getTransitionVariants(effect?: TransitionEffect) {
  const type = effect?.type || "fade";
  const dur = (effect?.duration_ms || 400) / 1000;

  switch (type) {
    case "crack":
      return {
        initial: { opacity: 0, scale: 1.05, filter: "brightness(2)" },
        animate: { opacity: 1, scale: 1, filter: "brightness(1)" },
        exit: { opacity: 0, scale: 0.95, filter: "brightness(0)" },
        transition: { duration: dur, ease: [0.4, 0, 0.2, 1] },
      };
    case "morph":
      return {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.05 },
        transition: { duration: dur, ease: [0.16, 1, 0.3, 1] },
      };
    case "zoom_through":
      return {
        initial: { opacity: 0, scale: 0.3 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 3 },
        transition: { duration: dur, ease: "easeInOut" },
      };
    case "slide_left":
      return {
        initial: { opacity: 0, x: "100%" },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: "-100%" },
        transition: { duration: dur, ease: [0.16, 1, 0.3, 1] },
      };
    case "slide_up":
      return {
        initial: { opacity: 0, y: "100%" },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: "-100%" },
        transition: { duration: dur, ease: [0.16, 1, 0.3, 1] },
      };
    case "iris":
      return {
        initial: { opacity: 0, clipPath: "circle(0% at 50% 50%)" },
        animate: { opacity: 1, clipPath: "circle(75% at 50% 50%)" },
        exit: { opacity: 0, clipPath: "circle(0% at 50% 50%)" },
        transition: { duration: dur, ease: "easeInOut" },
      };
    case "cut":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.05 },
      };
    case "whip_pan":
      return {
        initial: { opacity: 0, x: "120%", filter: "blur(8px)" },
        animate: { opacity: 1, x: 0, filter: "blur(0px)" },
        exit: { opacity: 0, x: "-120%", filter: "blur(8px)" },
        transition: { duration: dur * 0.6, ease: [0.4, 0, 0.2, 1] },
      };
    default: // fade
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: dur },
      };
  }
}

// ============================================================
// MAIN ENGINE
// ============================================================

export function LivingPanelEngine({
  dsl, className = "", autoplay = true, debug = false,
}: LivingPanelEngineProps) {
  const [actIndex, setActIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(!autoplay);
  const { canvas, acts } = dsl;
  const currentAct = acts[actIndex];

  // Auto-advance acts
  useEffect(() => {
    if (isPaused || !currentAct || actIndex >= acts.length - 1) return;
    const timer = setTimeout(() => setActIndex(i => i + 1), currentAct.duration_ms);
    return () => clearTimeout(timer);
  }, [actIndex, isPaused, currentAct, acts.length]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); setIsPaused(p => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!currentAct) return null;

  const transVariants = getTransitionVariants(currentAct.transition_in);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        width: "100%",
        aspectRatio: `${canvas.width} / ${canvas.height}`,
        maxHeight: "100%",
        background: canvas.background,
        borderRadius: 4,
      }}
    >
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

      {/* Act progress indicator */}
      {acts.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-40 flex gap-1.5">
          {acts.map((_, i) => (
            <motion.div
              key={i}
              className="rounded-full cursor-pointer"
              style={{ width: i === actIndex ? 16 : 5, height: 4, background: i === actIndex ? "#ffffff" : "#ffffff30" }}
              animate={{ width: i === actIndex ? 16 : 5 }}
              transition={{ duration: 0.3 }}
              onClick={() => setActIndex(i)}
            />
          ))}
        </div>
      )}

      {/* Debug */}
      {debug && (
        <div className="absolute top-1 left-1 z-50 px-2 py-1" style={{ background: "#000c", color: "#0f0", fontSize: 9, fontFamily: "monospace" }}>
          Act {actIndex + 1}/{acts.length} · "{currentAct.id}" · {currentAct.layout.type}
          {currentAct.cells?.length ? ` · ${currentAct.cells.length} cells` : ""}
          {isPaused ? " ⏸" : " ▶"}
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
      {/* Act-level layers (backgrounds, effects) */}
      <ActLayerStack layers={act.layers} timeline={act.timeline} events={act.events} />

      {/* Sub-panel grid */}
      {hasCells && (
        <div
          className="absolute inset-0 z-10"
          style={{ display: "grid", gap: act.layout.gap ?? 2, ...gridStyle }}
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
        border: cell.style?.border || "none",
        borderRadius: cell.style?.borderRadius || 0,
        clipPath: cell.style?.clipPath,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: staggerDelay / 1000, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
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

  // Schedule timeline
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

  // Click handler
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
        cursor: clickable ? "pointer" : "default",
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
      onClick={clickable ? onClick : undefined}
      whileHover={clickable ? { scale: 1.05 } : undefined}
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
      @keyframes particle-up {
        0% { transform: translateY(0) scale(1); opacity: 0.6; }
        100% { transform: translateY(-600px) scale(0); opacity: 0; }
      }
      @keyframes sparkle-twinkle {
        0%, 100% { opacity: 0; transform: scale(0.5); }
        50% { opacity: 1; transform: scale(1); }
      }
      @keyframes impact-burst {
        0% { transform: scale(0); opacity: 1; }
        100% { transform: scale(3); opacity: 0; }
      }
      @keyframes stagger-in {
        0% { transform: translateX(-20px); opacity: 0; }
        100% { transform: translateX(0); opacity: 1; }
      }
      @keyframes float-gentle {
        0%, 100% { transform: translateY(-5px); }
        50% { transform: translateY(5px); }
      }
      @keyframes pulse-glow {
        0%, 100% { transform: scale(0.95); filter: brightness(1); }
        50% { transform: scale(1.05); filter: brightness(1.2); }
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }
    `}</style>
  );
}

export default LivingPanelEngine;
