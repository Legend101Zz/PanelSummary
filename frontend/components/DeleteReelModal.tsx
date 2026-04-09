/**
 * DeleteReelModal.tsx — Confirmation modal for reel deletion
 * =============================================================
 * Nice "Ink & Light" themed destructive action modal.
 * Animated entry, backdrop blur, red accent stripe.
 */

"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trash2, Loader2, X } from "lucide-react";
import type { VideoReel } from "@/lib/types";

interface Props {
  reel: VideoReel | null;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteReelModal: React.FC<Props> = ({
  reel,
  deleting,
  onConfirm,
  onCancel,
}) => {
  return (
    <AnimatePresence>
      {reel && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => !deleting && onCancel()}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(15,14,23,0.75)",
              backdropFilter: "blur(6px)",
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="relative w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-2)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            {/* Header stripe */}
            <div className="h-1" style={{ background: "var(--red, #ea1100)" }} />

            <div className="p-6">
              {/* Close */}
              <button
                onClick={() => !deleting && onCancel()}
                className="absolute top-3 right-3"
                style={{ color: "var(--text-3)" }}
                disabled={deleting}
              >
                <X size={16} />
              </button>

              {/* Icon */}
              <div
                className="w-14 h-14 mx-auto mb-4 flex items-center justify-center"
                style={{
                  borderRadius: "50%",
                  background: "rgba(234,17,0,0.08)",
                  border: "2px solid rgba(234,17,0,0.15)",
                }}
              >
                <Trash2 size={24} style={{ color: "var(--red, #ea1100)" }} />
              </div>

              <h2
                className="text-center mb-1"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.1rem",
                  color: "var(--text-1)",
                }}
              >
                DELETE REEL?
              </h2>

              <p
                className="text-center mb-1 font-label"
                style={{ color: "var(--amber)", fontSize: "11px" }}
              >
                {reel.title || `Reel ${(reel.reel_index ?? 0) + 1}`}
              </p>

              <p
                className="text-center mb-6"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.85rem",
                  color: "var(--text-3)",
                  lineHeight: 1.5,
                }}
              >
                This will permanently delete the reel
                {reel.render_status === "complete"
                  ? " and its rendered video"
                  : ""}
                . The source content will be freed up for future reels.
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onCancel}
                  disabled={deleting}
                  className="flex-1 py-2.5 font-label border transition-colors"
                  style={{
                    fontSize: "11px",
                    borderColor: "var(--border)",
                    background: "var(--surface-2)",
                    color: "var(--text-2)",
                    cursor: deleting ? "not-allowed" : "pointer",
                  }}
                >
                  CANCEL
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onConfirm}
                  disabled={deleting}
                  className="flex-1 py-2.5 font-label flex items-center justify-center gap-2 transition-colors"
                  style={{
                    fontSize: "11px",
                    background: "var(--red, #ea1100)",
                    color: "#fff",
                    border: "1px solid var(--red, #ea1100)",
                    cursor: deleting ? "wait" : "pointer",
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {deleting ? "DELETING…" : "DELETE"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
