/**
 * ReelComposition.tsx — Main Remotion Composition
 *
 * Reads a Video DSL (passed as input props), calculates scene
 * timing, and renders each scene sequentially with transitions.
 *
 * This is the single generic interpreter — it doesn't know about
 * "templates". It just reads the DSL and renders whatever the LLM designed.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { VideoDSL, Scene } from "./types";
import { SceneRenderer } from "./SceneRenderer";
import { msToFrame } from "./utils/timing";
import { loadFonts } from "./utils/fonts";

interface Props {
  /** The full Video DSL JSON — passed as Remotion input props */
  [key: string]: any;
}

export const ReelComposition: React.FC<Props> = (inputProps) => {
  const dsl = inputProps as unknown as VideoDSL;
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Load fonts
  useMemo(() => {
    if (dsl.fonts?.length) {
      loadFonts(dsl.fonts);
    }
  }, [dsl.fonts]);

  // Pre-calculate scene start frames
  const sceneTimings = useMemo(() => {
    const timings: Array<{
      scene: Scene;
      startFrame: number;
      endFrame: number;
      transitionFrames: number;
    }> = [];

    let currentFrame = 0;
    for (const scene of dsl.scenes || []) {
      const durationFrames = msToFrame(scene.duration_ms, fps);
      const transitionFrames = msToFrame(
        scene.transition?.duration_ms || 0,
        fps,
      );

      timings.push({
        scene,
        startFrame: currentFrame,
        endFrame: currentFrame + durationFrames,
        transitionFrames,
      });

      currentFrame += durationFrames;
    }

    return timings;
  }, [dsl.scenes, fps]);

  // Background color from canvas
  const bgColor = dsl.canvas?.background || dsl.palette?.bg || "#0F0E17";

  return (
    <div
      style={{
        width,
        height,
        background: bgColor,
        position: "relative",
        overflow: "hidden",
        fontFamily: dsl.fonts?.[0]
          ? `"${dsl.fonts[0]}", sans-serif`
          : "Outfit, sans-serif",
      }}
    >
      {sceneTimings.map(({ scene, startFrame, endFrame, transitionFrames }, i) => {
        // Determine if this scene should be visible
        const isActive = frame >= startFrame && frame < endFrame;
        const isTransitioning =
          frame >= startFrame && frame < startFrame + transitionFrames;

        if (!isActive && !isTransitioningOut(frame, i, sceneTimings)) {
          return null;
        }

        // Scene transition opacity
        let sceneOpacity = 1;
        const transType = scene.transition?.type || "cut";

        if (transType === "fade" && transitionFrames > 0) {
          if (isTransitioning) {
            sceneOpacity = interpolate(
              frame,
              [startFrame, startFrame + transitionFrames],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
          }
        }

        // Scene transition transform
        let sceneTransform = "";
        if (isTransitioning && transitionFrames > 0) {
          const progress = interpolate(
            frame,
            [startFrame, startFrame + transitionFrames],
            [0, 1],
            {
              easing: Easing.out(Easing.ease),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );

          switch (transType) {
            case "wipe": {
              const dir = scene.transition?.direction || "up";
              if (dir === "up")
                sceneTransform = `translateY(${(1 - progress) * 100}%)`;
              else if (dir === "down")
                sceneTransform = `translateY(${-(1 - progress) * 100}%)`;
              else if (dir === "left")
                sceneTransform = `translateX(${(1 - progress) * 100}%)`;
              else
                sceneTransform = `translateX(${-(1 - progress) * 100}%)`;
              sceneOpacity = 1;
              break;
            }
            case "slide": {
              const dir = scene.transition?.direction || "left";
              if (dir === "left")
                sceneTransform = `translateX(${(1 - progress) * 100}%)`;
              else
                sceneTransform = `translateX(${-(1 - progress) * 100}%)`;
              sceneOpacity = 1;
              break;
            }
            case "zoom":
              sceneTransform = `scale(${0.8 + progress * 0.2})`;
              sceneOpacity = progress;
              break;
            case "iris": {
              // Circular clip path
              const radius = progress * 150;
              sceneTransform = "";
              sceneOpacity = 1;
              // Applied via clipPath below
              break;
            }
            case "glitch":
              sceneTransform =
                progress < 0.5
                  ? `translateX(${Math.sin(progress * 40) * 10}px) skewX(${Math.sin(progress * 30) * 3}deg)`
                  : "";
              sceneOpacity = progress < 0.3 ? progress * 3 : 1;
              break;
            case "ink_wash":
              sceneOpacity = progress;
              break;
            case "cut":
            default:
              sceneOpacity = 1;
              break;
          }
        }

        // Iris clip path
        const clipPath =
          transType === "iris" && isTransitioning && transitionFrames > 0
            ? `circle(${interpolate(
                frame,
                [startFrame, startFrame + transitionFrames],
                [0, 150],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              )}% at 50% 50%)`
            : undefined;

        return (
          <div
            key={scene.id}
            style={{
              position: "absolute",
              inset: 0,
              opacity: sceneOpacity,
              transform: sceneTransform || undefined,
              clipPath,
              zIndex: i,
            }}
          >
            <SceneRenderer scene={scene} sceneStartFrame={startFrame} />
          </div>
        );
      })}
    </div>
  );
};

/** Check if a previous scene is still showing during transition overlap */
function isTransitioningOut(
  frame: number,
  currentIndex: number,
  timings: Array<{ startFrame: number; endFrame: number; transitionFrames: number }>,
): boolean {
  if (currentIndex <= 0) return false;
  const next = timings[currentIndex];
  if (!next) return false;
  const prev = timings[currentIndex - 1];
  return frame >= prev.endFrame - next.transitionFrames && frame < prev.endFrame;
}
