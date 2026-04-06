/**
 * /video-reels — Full-screen Video Reel Player page
 * ====================================================
 * Fetches video reels from all books and renders the
 * dual-swipe player (vertical = new book, horizontal = same book).
 */

"use client";

import React, { useEffect, useState } from "react";
import { ReelVideoPlayer } from "@/components/ReelVideoPlayer";
import { getVideoReels } from "@/lib/api";
import type { VideoReel } from "@/lib/types";

export default function VideoReelsPage() {
  const [reels, setReels] = useState<VideoReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getVideoReels(0, 50);
        setReels(data.reels);
      } catch (err: any) {
        setError(err.message || "Failed to load reels");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          height: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F0E17",
          color: "#5E5C78",
          fontFamily: "var(--font-label, 'DotGothic16')",
          fontSize: 12,
        }}
      >
        LOADING REELS...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          height: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F0E17",
          color: "#E8191A",
          fontFamily: "var(--font-label, 'DotGothic16')",
          fontSize: 12,
        }}
      >
        {error}
      </div>
    );
  }

  return <ReelVideoPlayer reels={reels} backPath="/" />;
}
