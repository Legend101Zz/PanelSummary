/**
 * StyleSelector.tsx — "Choose Your Style" Component
 * =====================================================
 * Lets users pick the tone/aesthetic for their summary.
 * Each style changes both the LLM prompts AND the visual rendering.
 *
 * Styles:
 * ⚡ Manga    — Shonen energy, dramatic reveals
 * 🌃 Noir     — Dark, atmospheric, hard-boiled
 * ◻️ Minimalist — Clean, whitespace, scholarly
 * 😂 Comedy   — Witty, relatable, meme energy
 * 📚 Academic — Rigorous, structured, citation-style
 */

"use client";

import { motion } from "motion/react";
import { STYLE_OPTIONS } from "@/lib/utils";
import type { SummaryStyle } from "@/lib/types";

interface StyleSelectorProps {
  selected: SummaryStyle;
  onChange: (style: SummaryStyle) => void;
  compact?: boolean;
}

export function StyleSelector({ selected, onChange, compact = false }: StyleSelectorProps) {
  if (compact) {
    return (
      <div className="flex gap-2">
        {STYLE_OPTIONS.map((opt) => (
          <motion.button
            key={opt.value}
            whileTap={{ scale: 0.9 }}
            onClick={() => onChange(opt.value)}
            className={`p-2 rounded-sm border transition-all text-xl ${
              selected === opt.value
                ? "border-plasma bg-plasma/10"
                : "border-panel-border hover:border-plasma/40"
            }`}
            title={opt.label}
          >
            {opt.emoji}
          </motion.button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      {STYLE_OPTIONS.map((opt, i) => {
        const isSelected = selected === opt.value;
        return (
          <motion.button
            key={opt.value}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(opt.value)}
            className={`relative p-4 rounded-sm border text-left transition-all overflow-hidden ${
              isSelected
                ? "border-plasma"
                : "border-panel-border hover:border-plasma/40"
            }`}
            style={{
              background: isSelected
                ? `linear-gradient(135deg, ${opt.colors.bg}dd, ${opt.colors.bg}99)`
                : "var(--panel-bg)",
              boxShadow: isSelected
                ? `0 0 20px ${opt.colors.primary}30`
                : undefined,
            }}
          >
            {/* Selected indicator */}
            {isSelected && (
              <motion.div
                layoutId="style-indicator"
                className="absolute top-0 left-0 right-0 h-0.5"
                style={{ background: opt.colors.primary }}
              />
            )}

            <span className="text-2xl mb-2 block">{opt.emoji}</span>
            <p
              className="font-display font-bold text-sm mb-1"
              style={{ color: isSelected ? opt.colors.primary : "var(--text-primary)" }}
            >
              {opt.label}
            </p>
            <p className="text-text-muted text-xs leading-relaxed">{opt.description}</p>
          </motion.button>
        );
      })}
    </div>
  );
}
