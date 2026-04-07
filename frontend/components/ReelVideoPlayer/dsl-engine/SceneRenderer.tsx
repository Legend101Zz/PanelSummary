/**
 * SceneRenderer.tsx — Renders a single DSL scene
 * ==================================================
 * Handles camera movement, layer stacking, and
 * transition effects between scenes.
 */

"use client";

import React, { useMemo } from "react";
import type { Scene, TransitionType } from "./types";
import { LayerRenderer } from "./LayerRenderer";
import { clamp01, lerp } from "./easing";

interface SceneProps {
  scene: Scene;
  sceneLocalMs: number;
  transitionProgress: number; // 0→1 during transition-in
  isTransitioning: boolean;
}

/** Compute camera transform for the entire scene */
function getCameraTransform(scene: Scene, sceneLocalMs: number): string {
  const cam = scene.camera;
  if (!cam) return "";

  const t = clamp01(sceneLocalMs / scene.duration_ms);
  const parts: string[] = [];

  if (cam.zoom) {
    const z = lerp(cam.zoom[0], cam.zoom[1], t);
    parts.push(`scale(${z})`);
  }
  if (cam.pan) {
    const px = lerp(cam.pan.x[0], cam.pan.x[1], t);
    const py = lerp(cam.pan.y[0], cam.pan.y[1], t);
    parts.push(`translate(${px}px, ${py}px)`);
  }
  if (cam.rotate) {
    const r = lerp(cam.rotate[0], cam.rotate[1], t);
    parts.push(`rotate(${r}deg)`);
  }

  return parts.join(" ");
}

/** Compute transition styles */
function getTransitionStyle(
  type: TransitionType,
  progress: number,
  direction?: string,
): React.CSSProperties {
  switch (type) {
    case "fade":
      return { opacity: progress };
    case "wipe": {
      const dir = direction || "up";
      if (dir === "up")
        return { transform: `translateY(${(1 - progress) * 100}%)` };
      if (dir === "down")
        return { transform: `translateY(${-(1 - progress) * 100}%)` };
      if (dir === "left")
        return { transform: `translateX(${(1 - progress) * 100}%)` };
      return { transform: `translateX(${-(1 - progress) * 100}%)` };
    }
    case "slide": {
      const dir = direction || "left";
      return {
        transform:
          dir === "left"
            ? `translateX(${(1 - progress) * 100}%)`
            : `translateX(${-(1 - progress) * 100}%)`,
      };
    }
    case "zoom":
      return {
        opacity: progress,
        transform: `scale(${0.8 + progress * 0.2})`,
      };
    case "iris":
      return {
        clipPath: `circle(${progress * 150}% at 50% 50%)`,
      };
    case "glitch":
      return progress < 0.5
        ? {
            transform: `translateX(${Math.sin(progress * 40) * 10}px) skewX(${Math.sin(progress * 30) * 3}deg)`,
            opacity: progress * 3,
          }
        : {};
    case "ink_wash":
      return { opacity: progress };
    case "cut":
    default:
      return {};
  }
}

export const SceneRenderer: React.FC<SceneProps> = ({
  scene,
  sceneLocalMs,
  transitionProgress,
  isTransitioning,
}) => {
  const cameraTransform = useMemo(
    () => getCameraTransform(scene, sceneLocalMs),
    [scene, sceneLocalMs],
  );

  const transitionStyle = useMemo(
    () =>
      isTransitioning
        ? getTransitionStyle(
            scene.transition.type,
            transitionProgress,
            scene.transition.direction,
          )
        : {},
    [scene.transition, transitionProgress, isTransitioning],
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        ...transitionStyle,
      }}
    >
      {/* Camera wrapper */}
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transform: cameraTransform || undefined,
          transformOrigin: "center center",
          willChange: cameraTransform ? "transform" : undefined,
        }}
      >
        {scene.layers.map((layer) => (
          <LayerRenderer
            key={layer.id}
            layer={layer}
            sceneLocalMs={sceneLocalMs}
            timeline={scene.timeline || []}
          />
        ))}
      </div>
    </div>
  );
};
