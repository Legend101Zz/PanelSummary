/**
 * ReelActions.tsx — Right-rail action buttons
 * ==============================================
 * TikTok-style floating action buttons on the right side.
 * - ❤️ Save/favorite
 * - 📖 Open manga reader
 * - ⬇️ Download MP4
 * - ↗️ Share
 */

"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { Heart, BookOpen, Download, Share2 } from "lucide-react";
import Link from "next/link";
import type { VideoReel } from "@/lib/types";
import { getVideoReelUrl } from "@/lib/api";

interface Props {
  reel: VideoReel;
  summaryId?: string;
}

export const ReelActions: React.FC<Props> = ({ reel, summaryId }) => {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved((s) => !s);
    // Future: persist to localStorage or API
  };

  const handleDownload = async () => {
    if (!reel.book?.id || !reel.id) return;
    const url = getVideoReelUrl(reel.book.id, reel.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reel.title || "reel"}.mp4`;
    a.click();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: reel.title,
          text: `Check out this reel from "${reel.book?.title}"`,
          url: window.location.href,
        });
      } catch {
        /* user cancelled */
      }
    }
  };

  const actions = [
    {
      icon: Heart,
      label: "Save",
      onClick: handleSave,
      active: saved,
      activeColor: "#E8191A",
    },
    {
      icon: BookOpen,
      label: "Read",
      href: summaryId
        ? `/books/${reel.book?.id}/manga/living?summary=${summaryId}`
        : undefined,
    },
    {
      icon: Download,
      label: "Save",
      onClick: handleDownload,
    },
    {
      icon: Share2,
      label: "Share",
      onClick: handleShare,
    },
  ];

  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        bottom: 160,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        zIndex: 15,
      }}
    >
      {actions.map((action, i) => {
        const Icon = action.icon;
        const content = (
          <motion.div
            key={i}
            whileTap={{ scale: 0.85 }}
            onClick={action.onClick}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(15,14,23,0.5)",
                backdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(240,238,232,0.1)",
              }}
            >
              <Icon
                size={20}
                color={
                  action.active
                    ? action.activeColor
                    : "#F0EEE8"
                }
                fill={action.active ? action.activeColor : "none"}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-label, 'DotGothic16')",
                fontSize: 9,
                color: "#A8A6C0",
                letterSpacing: "0.05em",
              }}
            >
              {action.label}
            </span>
          </motion.div>
        );

        if (action.href) {
          return (
            <Link key={i} href={action.href}>
              {content}
            </Link>
          );
        }
        return <React.Fragment key={i}>{content}</React.Fragment>;
      })}
    </div>
  );
};
