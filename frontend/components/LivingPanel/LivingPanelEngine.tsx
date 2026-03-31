"use client";

/**
 * LivingPanelEngine.tsx — The Core Rendering Engine
 * ==================================================
 * Takes a LivingPanelDSL JSON → renders an animated, interactive panel.
 *
 * ARCHITECTURE:
 * 1. Parse DSL → build layer tree
 * 2. Schedule timeline animations
 * 3. Render layers in z-order
 * 4. Handle events (click, visibility, hover)
 *
 * Uses Motion (Framer Motion) for animation interpolation
 * and pure CSS for effects/particles.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type {
  LivingPanelDSL,
  Layer,
  TimelineStep,
} from "@/lib/living-panel-types";
import {
  scheduleTimeline,
  getFromValues,
  getToValues,
  getTransitionConfig,
} from "./AnimationSystem";
import {
  BackgroundRenderer,
  SpriteRenderer,
  TextRenderer,
  SpeechBubbleRenderer,
  EffectRenderer,
  ShapeRenderer,
  DataBlockRenderer,
  SceneTransitionRenderer,
} from "./LayerRenderers";

// ============================================================
// TYPES
// ============================================================

interface LayerAnimState {
  x?: number | string;
  y?: number | string;
  opacity?: number;
  scale?: number;
  rotate?: number;
  isAnimating?: boolean;  // for typewriter triggers
}

interface LivingPanelEngineProps {
  dsl: LivingPanelDSL;
  className?: string;
  autoplay?: boolean;
  onComplete?: () => void;
  debug?: boolean;
}

// ============================================================
// MAIN ENGINE COMPONENT
// ============================================================

export function LivingPanelEngine({
  dsl,
  className = "",
  autoplay = true,
  onComplete,
  debug = false,
}: LivingPanelEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Layer animation states (mutated by timeline scheduler)
  const [layerStates, setLayerStates] = useState<Record<string, LayerAnimState>>(() =>
    buildInitialStates(dsl)
  );

  // Track which layers have active typewriter animations
  const [activeTypewriters, setActiveTypewriters] = useState<Set<string>>(new Set());

  // Is the panel playing?
  const [isPlaying, setIsPlaying] = useState(autoplay);

  // Memoize sorted layers (by zIndex or array order)
  const sortedLayers = useMemo(
    () => [...dsl.layers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [dsl.layers]
  );

  // ============================================================
  // TIMELINE SCHEDULING
  // ============================================================

  useEffect(() => {
    if (!isPlaying) return;

    const cleanup = scheduleTimeline(dsl.timeline, (step: TimelineStep) => {
      setLayerStates(prev => {
        const next = { ...prev };
        const toValues = getToValues(step.animate);
        next[step.target] = {
          ...next[step.target],
          ...toValues,
          isAnimating: true,
        };
        return next;
      });

      // Track typewriter activations
      if (step.animate.typewriter) {
        setActiveTypewriters(prev => new Set(prev).add(step.target));
      }
    });

    return cleanup;
  }, [dsl.timeline, isPlaying]);

  // ============================================================
  // EVENT HANDLING
  // ============================================================

  const handleLayerClick = useCallback(
    (layerId: string) => {
      const binding = dsl.events?.find(
        e => e.trigger === "onClick" && e.target === layerId
      );
      if (!binding) return;

      for (const action of binding.actions) {
        const targetId = action.target || layerId;

        switch (action.type) {
          case "animate":
            if (action.animate) {
              const toValues = getToValues(action.animate);
              setLayerStates(prev => ({
                ...prev,
                [targetId]: { ...prev[targetId], ...toValues },
              }));

              // If it's a shake, reset after duration
              if (action.animate.shake) {
                setTimeout(() => {
                  setLayerStates(prev => ({
                    ...prev,
                    [targetId]: { ...prev[targetId], x: prev[targetId]?.x },
                  }));
                }, action.duration || 400);
              }
            }
            break;
          case "show":
            setLayerStates(prev => ({
              ...prev,
              [targetId]: { ...prev[targetId], opacity: 1 },
            }));
            break;
          case "hide":
            setLayerStates(prev => ({
              ...prev,
              [targetId]: { ...prev[targetId], opacity: 0 },
            }));
            break;
          case "toggle":
            setLayerStates(prev => ({
              ...prev,
              [targetId]: {
                ...prev[targetId],
                opacity: (prev[targetId]?.opacity ?? 1) > 0.5 ? 0 : 1,
              },
            }));
            break;
        }
      }
    },
    [dsl.events]
  );

  // ============================================================
  // RENDER
  // ============================================================

  const { canvas } = dsl;
  const aspectRatio = canvas.width / canvas.height;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{
        width: "100%",
        aspectRatio: `${canvas.width} / ${canvas.height}`,
        maxHeight: "100%",
        background: canvas.background,
        borderRadius: 4,
      }}
    >
      {/* Render layers in z-order */}
      {sortedLayers.map((layer, index) => {
        const state = layerStates[layer.id] || {};
        const isVisible = layer.visible !== false;

        if (!isVisible) return null;

        return (
          <LayerWrapper
            key={layer.id}
            layer={layer}
            state={state}
            index={index}
            onClick={() => handleLayerClick(layer.id)}
            hasClickEvent={dsl.events?.some(
              e => e.trigger === "onClick" && e.target === layer.id
            )}
          >
            <LayerContent
              layer={layer}
              isAnimating={activeTypewriters.has(layer.id) || state.isAnimating}
            />
          </LayerWrapper>
        );
      })}

      {/* Debug overlay */}
      {debug && (
        <div
          className="absolute top-0 left-0 z-50 p-2"
          style={{
            background: "rgba(0,0,0,0.8)",
            color: "#0f0",
            fontSize: 9,
            fontFamily: "monospace",
            maxWidth: 200,
            maxHeight: 150,
            overflow: "auto",
          }}
        >
          <div>Layers: {dsl.layers.length}</div>
          <div>Timeline: {dsl.timeline.length} steps</div>
          <div>Events: {dsl.events?.length || 0}</div>
          <div>Playing: {isPlaying ? "▶" : "⏸"}</div>
        </div>
      )}

      {/* Play/pause control */}
      {!autoplay && (
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="absolute bottom-2 right-2 z-40 px-3 py-1 rounded"
          style={{
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 12,
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
      )}
    </div>
  );
}

// ============================================================
// LAYER WRAPPER (positioning + animation)
// ============================================================

function LayerWrapper({
  layer,
  state,
  index,
  children,
  onClick,
  hasClickEvent,
}: {
  layer: Layer;
  state: LayerAnimState;
  index: number;
  children: React.ReactNode;
  onClick: () => void;
  hasClickEvent?: boolean;
}) {
  // Background layers are absolute-positioned full-size
  if (layer.type === "background" || layer.type === "effect" || layer.type === "scene_transition") {
    return (
      <motion.div
        className="absolute inset-0"
        style={{ zIndex: layer.zIndex ?? index }}
        animate={{
          opacity: state.opacity ?? layer.opacity ?? 1,
          scale: state.scale ?? layer.scale ?? 1,
        }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    );
  }

  // Positioned layers
  return (
    <motion.div
      className="absolute"
      style={{
        zIndex: layer.zIndex ?? (10 + index),
        cursor: hasClickEvent ? "pointer" : "default",
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
      onClick={hasClickEvent ? onClick : undefined}
      whileHover={hasClickEvent ? { scale: 1.05 } : undefined}
      whileTap={hasClickEvent ? { scale: 0.95 } : undefined}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// LAYER CONTENT DISPATCHER
// ============================================================

function LayerContent({
  layer,
  isAnimating,
}: {
  layer: Layer;
  isAnimating?: boolean;
}) {
  switch (layer.type) {
    case "background":
      return <BackgroundRenderer layer={layer} />;
    case "sprite":
      return <SpriteRenderer layer={layer} />;
    case "text":
      return <TextRenderer layer={layer} isAnimating={isAnimating} />;
    case "speech_bubble":
      return <SpeechBubbleRenderer layer={layer} isAnimating={isAnimating} />;
    case "effect":
      return <EffectRenderer layer={layer} />;
    case "shape":
      return <ShapeRenderer layer={layer} />;
    case "data_block":
      return <DataBlockRenderer layer={layer} isAnimating={isAnimating} />;
    case "scene_transition":
      return <SceneTransitionRenderer layer={layer} />;
    default:
      return null;
  }
}

// ============================================================
// INITIAL STATE BUILDER
// ============================================================

function buildInitialStates(dsl: LivingPanelDSL): Record<string, LayerAnimState> {
  const states: Record<string, LayerAnimState> = {};

  for (const layer of dsl.layers) {
    // Start with the layer's declared initial values
    states[layer.id] = {
      x: layer.x,
      y: layer.y,
      opacity: layer.opacity ?? 1,
      scale: layer.scale ?? 1,
      rotate: layer.rotate ?? 0,
      isAnimating: false,
    };

    // Check if any timeline step animates this layer FROM a different value
    const firstStep = dsl.timeline.find(s => s.target === layer.id);
    if (firstStep) {
      const fromValues = getFromValues(firstStep.animate);
      states[layer.id] = { ...states[layer.id], ...fromValues };
    }
  }

  return states;
}

// ============================================================
// CSS KEYFRAMES (injected once)
// ============================================================

export function LivingPanelStyles() {
  return (
    <style jsx global>{`
      @keyframes particle-up {
        0% { transform: translateY(0) scale(1); opacity: 0.6; }
        100% { transform: translateY(-600px) scale(0); opacity: 0; }
      }
      @keyframes particle-down {
        0% { transform: translateY(0) scale(1); opacity: 0.6; }
        100% { transform: translateY(600px) scale(0); opacity: 0; }
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
