"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Info, Zap } from "lucide-react";

const WORDS_PER_PAGE = 500;
const TOKEN_LIMIT = 65_000;
export const PAGE_LIMIT = Math.floor(TOKEN_LIMIT / WORDS_PER_PAGE);

export interface PageChoiceProps {
  totalPages: number;
  totalChapters: number;
  chapters: {
    index: number;
    title: string;
    page_start: number;
    page_end: number;
    word_count: number;
  }[];
  onChoice: (range: [number, number] | null) => void;
}

export function LargePdfWarning({ totalPages, totalChapters, chapters, onChoice }: PageChoiceProps) {
  const [mode, setMode] = useState<"full" | "first" | "custom">("first");
  const [customEnd, setCustomEnd] = useState(Math.min(totalChapters - 1, 9));

  const estWords = (range: [number, number] | null) => {
    const chs = range
      ? chapters.filter(c => c.index >= range[0] && c.index <= range[1])
      : chapters;
    return chs.reduce((s, c) => s + c.word_count, 0);
  };
  const estCost = (words: number) => ((words / 750) * 0.0002).toFixed(3);

  const selected: [number, number] | null =
    mode === "full"  ? null :
    mode === "first" ? [0, Math.min(totalChapters - 1, 9)] :
                       [0, customEnd];

  const selWords = estWords(selected);

  return (
    <div
      className="panel p-4 border-amber"
      style={{ borderColor: "rgba(245,166,35,0.5)", background: "rgba(245,166,35,0.04)" }}
    >
      <div className="flex items-start gap-2 mb-4">
        <Info size={14} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="font-label" style={{ color: "var(--amber)", fontSize: "10px" }}>
            LARGE DOCUMENT DETECTED
          </p>
          <p
            className="text-sm mt-0.5"
            style={{ fontFamily: "var(--font-body)", color: "var(--text-2)" }}
          >
            This book has {totalPages} pages (~{Math.round((totalPages * WORDS_PER_PAGE) / 1000)}K
            words). Processing all chapters in one job may exceed the {PAGE_LIMIT}-page token budget.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {(
          [
            { key: "full",  label: "Full Book",         sub: `${totalChapters} chapters · may be slow/costly` },
            { key: "first", label: "First 10 Chapters",  sub: "Chapters 1–10 · recommended for big books" },
            { key: "custom",label: "Custom Range",       sub: "Choose end chapter" },
          ] as const
        ).map(opt => (
          <label key={opt.key} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="range-mode"
              value={opt.key}
              checked={mode === opt.key}
              onChange={() => setMode(opt.key)}
              style={{ marginTop: 3, accentColor: "var(--amber)" }}
            />
            <div>
              <p className="font-label" style={{ fontSize: "10px", color: "var(--text-1)" }}>
                {opt.label}
              </p>
              <p className="font-label" style={{ fontSize: "9px", color: "var(--text-3)" }}>
                {opt.sub}
              </p>
              {opt.key === "custom" && mode === "custom" && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="font-label" style={{ fontSize: "9px", color: "var(--text-3)" }}>
                    Chapters 1 –
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={totalChapters - 1}
                    value={customEnd}
                    onChange={e => setCustomEnd(+e.target.value)}
                    style={{ accentColor: "var(--amber)", width: "100px" }}
                  />
                  <span className="font-label" style={{ fontSize: "9px", color: "var(--amber)" }}>
                    {customEnd + 1}
                  </span>
                </div>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="font-label" style={{ fontSize: "9px", color: "var(--text-3)" }}>
          Est. ~{Math.round(selWords / 1000)}K words · ~${estCost(selWords)} at $0.20/1M tokens
        </p>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onChoice(selected)}
          className="btn-primary py-1.5 px-4 text-xs gap-1.5"
          style={{ fontFamily: "var(--font-label)", fontSize: "10px" }}
        >
          <Zap size={12} /> Use This Range
        </motion.button>
      </div>
    </div>
  );
}
