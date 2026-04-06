/**
 * SceneRenderer.tsx — Renders a single scene from Video DSL
 *
 * Reads the scene's layers, applies timeline animations per-frame,
 * wraps everything in a camera transform, and renders each layer
 * through the appropriate component.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { Scene, Layer } from "./types";
import { getAnimatedProps } from "./utils/interpolation";
import { msToFrame } from "./utils/timing";

import { BackgroundLayer } from "./layers/BackgroundLayer";
import { TextLayer } from "./layers/TextLayer";
import { CounterLayer } from "./layers/CounterLayer";
import { SpeechBubbleLayer } from "./layers/SpeechBubbleLayer";
import { EffectLayer } from "./layers/EffectLayer";
import { SpriteLayer } from "./layers/SpriteLayer";
import { DataBlockLayer } from "./layers/DataBlockLayer";
import { ShapeLayer } from "./layers/ShapeLayer";

interface Props {
  scene: Scene;
  /** The global frame where this scene starts */
  sceneStartFrame: number;
}

export const SceneRenderer: React.FC<Props> = ({ scene, sceneStartFrame }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Scene-local frame (0-based within this scene)
  const localFrame = frame - sceneStartFrame;
  const sceneDurationFrames = msToFrame(scene.duration_ms, fps);

  // Don't render if we're outside this scene's bounds
  if (localFrame < 0 || localFrame >= sceneDurationFrames) {
    return null;
  }

  // Camera transform
  const camera = scene.camera;
  let cameraTransform = "";
  if (camera) {
    const easing = Easing.out(Easing.ease);

    if (camera.zoom) {
      const zoom = interpolate(
        localFrame,
        [0, sceneDurationFrames],
        camera.zoom,
        { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      cameraTransform += `scale(${zoom}) `;
    }

    if (camera.pan) {
      const panX = camera.pan.x
        ? interpolate(localFrame, [0, sceneDurationFrames], camera.pan.x, {
            easing,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        : 0;
      const panY = camera.pan.y
        ? interpolate(localFrame, [0, sceneDurationFrames], camera.pan.y, {
            easing,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        : 0;
      cameraTransform += `translate(${panX}px, ${panY}px) `;
    }

    if (camera.rotate) {
      const rot = interpolate(
        localFrame,
        [0, sceneDurationFrames],
        camera.rotate,
        { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
      cameraTransform += `rotate(${rot}deg) `;
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        overflow: "hidden",
        transform: cameraTransform || undefined,
        transformOrigin: "center center",
      }}
    >
      {scene.layers.map((layer) => {
        const animated = getAnimatedProps(
          layer,
          scene.timeline || [],
          localFrame,
          fps,
        );

        return (
          <LayerSwitch
            key={layer.id}
            layer={layer}
            animated={animated}
            width={width}
            height={height}
            sceneStartFrame={sceneStartFrame}
          />
        );
      })}
    </div>
  );
};

/** Route layer to the correct component */
function LayerSwitch({
  layer,
  animated,
  width,
  height,
  sceneStartFrame,
}: {
  layer: Layer;
  animated: ReturnType<typeof getAnimatedProps>;
  width: number;
  height: number;
  sceneStartFrame: number;
}) {
  const { opacity, x, y, scale, rotate, typewriterChars, counterValue } =
    animated;

  switch (layer.type) {
    case "background":
      return (
        <BackgroundLayer
          layer={layer}
          width={width}
          height={height}
          opacity={opacity}
        />
      );

    case "text":
      return (
        <TextLayer
          layer={layer}
          width={width}
          height={height}
          opacity={opacity}
          x={x}
          y={y}
          scale={scale}
          rotate={rotate}
          typewriterChars={typewriterChars}
        />
      );

    case "counter":
      return (
        <CounterLayer
          layer={layer}
          width={width}
          height={height}
          opacity={opacity}
          x={x}
          y={y}
          scale={scale}
          rotate={rotate}
          counterValue={counterValue}
        />
      );

    case "speech_bubble":
      return (
        <SpeechBubbleLayer
          layer={layer}
          width={width}
          height={height}
          opacity={opacity}
          x={x}
          y={y}
          scale={scale}
          typewriterChars={typewriterChars}
        />
      );

    case "effect":
      return (
        <EffectLayer
          layer={layer}
          width={width}
          height={height}
          opacity={opacity}
        />
      );

    case "sprite":
      return (
        <SpriteLayer
          layer={layer}
          width={width}
          height={height}
          opacity={opacity}
          x={x}
          y={y}
          scale={scale}
        />
      );

    case "data_block":
      return (
        <DataBlockLayer
          layer={layer}
          width={width}
          height={height}
          opacity={opacity}
          x={x}
          y={y}
          scale={scale}
          sceneStartFrame={sceneStartFrame}
        />
      );

    case "shape":
      return (
        <ShapeLayer
          layer={layer}
          width={width}
          height={height}
          opacity={opacity}
          x={x}
          y={y}
          scale={scale}
          rotate={rotate}
        />
      );

    case "illustration":
      // Illustration renders as a tinted background
      return (
        <BackgroundLayer
          layer={layer}
          width={width}
          height={height}
          opacity={opacity}
        />
      );

    default:
      return null;
  }
}
