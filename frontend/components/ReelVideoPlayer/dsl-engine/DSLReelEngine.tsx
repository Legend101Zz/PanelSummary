/**
 * DSLReelEngine.tsx — Browser-side Video DSL Player
 * ====================================================
 * Interprets a Video DSL in real-time using React + CSS.
 * No Remotion needed — pure requestAnimationFrame playback.
 *
 * Renders scenes sequentially, with transition effects,
 * camera movements, and per-layer timeline animations.
 *
 * Usage:
 *   <DSLReelEngine dsl={videoDSL} autoplay onEnd={callback} />
 */

"use client";

import React, { useEffect, useMemo, useCallback } from "react";
import type { VideoDSL } from "./types";
import { usePlayback } from "./usePlayback";
import { SceneRenderer } from "./SceneRenderer";
import { clamp01 } from "./easing";

interface DSLReelEngineProps {
  dsl: VideoDSL;
  autoplay?: boolean;
  /** Called when playback reaches the end (before loop) */
  onEnd?: () => void;
  /** External play/pause control */
  isActive?: boolean;
  /** Render at this aspect ratio container */
  className?: string;
}

export const DSLReelEngine: React.FC<DSLReelEngineProps> = ({
  dsl,
  autoplay = true,
  onEnd,
  isActive = true,
  className = "",
}) => {
  const playback = usePlayback(dsl);

  // Auto-play on mount or when isActive changes
  useEffect(() => {
    if (isActive && autoplay && !playback.playing) {
      playback.play();
    } else if (!isActive && playback.playing) {
      playback.pause();
    }
  }, [isActive, autoplay]); // eslint-disable-line react-hooks/exhaustive-deps

  const scenes = dsl.scenes || [];
  const currentScene = scenes[playback.currentSceneIdx];

  if (!currentScene) return null;

  // Calculate transition progress for current scene
  const transitionDurationMs =
    currentScene.transition?.duration_ms || 0;
  const isTransitioning =
    transitionDurationMs > 0 &&
    playback.sceneLocalMs < transitionDurationMs;
  const transitionProgress = isTransitioning
    ? clamp01(playback.sceneLocalMs / transitionDurationMs)
    : 1;

  // Also render previous scene during transition (for crossfade etc)
  const prevScene =
    isTransitioning && playback.currentSceneIdx > 0
      ? scenes[playback.currentSceneIdx - 1]
      : null;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: dsl.canvas?.background || dsl.palette?.bg || "#0F0E17",
        fontFamily: dsl.fonts?.[0]
          ? `"${dsl.fonts[0]}", sans-serif`
          : '"Outfit", sans-serif',
      }}
    >
      {/* Previous scene (visible during transition) */}
      {prevScene && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 1 - transitionProgress,
            zIndex: 0,
          }}
        >
          <SceneRenderer
            scene={prevScene}
            sceneLocalMs={prevScene.duration_ms}
            transitionProgress={1}
            isTransitioning={false}
          />
        </div>
      )}

      {/* Current scene */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <SceneRenderer
          scene={currentScene}
          sceneLocalMs={playback.sceneLocalMs}
          transitionProgress={transitionProgress}
          isTransitioning={isTransitioning}
        />
      </div>

      {/* Global CSS for animations */}
      <style jsx global>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes float-particle {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
};

/** Expose playback controls hook for external control */
export { usePlayback } from "./usePlayback";
export type { VideoDSL, Scene, Layer } from "./types";
