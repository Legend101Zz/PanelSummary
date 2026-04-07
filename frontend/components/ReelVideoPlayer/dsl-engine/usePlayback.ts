/**
 * usePlayback.ts — Playback clock + scene tracking
 * ====================================================
 * Drives the DSL interpreter with requestAnimationFrame.
 * Tracks current scene, elapsed time, and progress.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { VideoDSL, Scene } from "./types";

export interface PlaybackState {
  playing: boolean;
  currentTimeMs: number;
  totalDurationMs: number;
  progress: number; // 0-1
  currentSceneIdx: number;
  sceneLocalMs: number; // ms into current scene
}

interface SceneTiming {
  scene: Scene;
  startMs: number;
  endMs: number;
}

function buildTimings(dsl: VideoDSL): SceneTiming[] {
  let cursor = 0;
  return (dsl.scenes || []).map((scene) => {
    const t = { scene, startMs: cursor, endMs: cursor + scene.duration_ms };
    cursor += scene.duration_ms;
    return t;
  });
}

export function usePlayback(dsl: VideoDSL | null) {
  const [state, setState] = useState<PlaybackState>({
    playing: false,
    currentTimeMs: 0,
    totalDurationMs: 0,
    progress: 0,
    currentSceneIdx: 0,
    sceneLocalMs: 0,
  });

  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const timeRef = useRef(0);
  const timingsRef = useRef<SceneTiming[]>([]);

  // Rebuild timings when DSL changes
  useEffect(() => {
    if (!dsl) return;
    const t = buildTimings(dsl);
    timingsRef.current = t;
    const total = t.length > 0 ? t[t.length - 1].endMs : 0;
    setState((s) => ({ ...s, totalDurationMs: total }));
  }, [dsl]);

  const findScene = useCallback((ms: number) => {
    const timings = timingsRef.current;
    for (let i = 0; i < timings.length; i++) {
      if (ms < timings[i].endMs) {
        return { idx: i, localMs: ms - timings[i].startMs };
      }
    }
    const last = timings.length - 1;
    return {
      idx: last,
      localMs: ms - (timings[last]?.startMs || 0),
    };
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    const delta = now - lastTickRef.current;
    lastTickRef.current = now;

    timeRef.current += delta;
    const total =
      timingsRef.current.length > 0
        ? timingsRef.current[timingsRef.current.length - 1].endMs
        : 1;

    // Loop
    if (timeRef.current >= total) {
      timeRef.current = 0;
    }

    const { idx, localMs } = findScene(timeRef.current);

    setState({
      playing: true,
      currentTimeMs: timeRef.current,
      totalDurationMs: total,
      progress: total > 0 ? timeRef.current / total : 0,
      currentSceneIdx: idx,
      sceneLocalMs: localMs,
    });

    rafRef.current = requestAnimationFrame(tick);
  }, [findScene]);

  const play = useCallback(() => {
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    setState((s) => ({ ...s, playing: true }));
  }, [tick]);

  const pause = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setState((s) => ({ ...s, playing: false }));
  }, []);

  const toggle = useCallback(() => {
    setState((s) => {
      if (s.playing) {
        cancelAnimationFrame(rafRef.current);
        return { ...s, playing: false };
      }
      lastTickRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
      return { ...s, playing: true };
    });
  }, [tick]);

  const seek = useCallback(
    (ms: number) => {
      timeRef.current = Math.max(0, Math.min(ms, state.totalDurationMs));
      const { idx, localMs } = findScene(timeRef.current);
      setState((s) => ({
        ...s,
        currentTimeMs: timeRef.current,
        progress:
          s.totalDurationMs > 0 ? timeRef.current / s.totalDurationMs : 0,
        currentSceneIdx: idx,
        sceneLocalMs: localMs,
      }));
    },
    [state.totalDurationMs, findScene],
  );

  const restart = useCallback(() => {
    timeRef.current = 0;
    const { idx, localMs } = findScene(0);
    setState((s) => ({
      ...s,
      currentTimeMs: 0,
      progress: 0,
      currentSceneIdx: idx,
      sceneLocalMs: localMs,
    }));
  }, [findScene]);

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return {
    ...state,
    timings: timingsRef.current,
    play,
    pause,
    toggle,
    seek,
    restart,
  };
}
