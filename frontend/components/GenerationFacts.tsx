"use client";
/**
 * GenerationFacts.tsx
 * Shows rotating interesting facts while the AI generation runs.
 * Keeps the user engaged during the 2-5 min wait.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lightbulb } from "lucide-react";

const FACTS = [
  "The average human reads 300 words/min. GPT processes ~1M tokens/min.",
  "Manga outsells American comics globally by 4:1 — over $6B/year in Japan alone.",
  "Reading for 6 minutes reduces cortisol (stress hormone) by 68%.",
  "The word 'manga' (漫画) means 'whimsical pictures' in Japanese.",
  "Rereading a book engages different neural pathways than the first read.",
  "The Library of Alexandria held ~500,000 scrolls. GPT-4 trained on ~45TB of text.",
  "A human brain processes images 60,000× faster than text.",
  "The first manga magazine launched in 1947 — Osamu Tezuka's New Treasure Island sold 400K copies.",
  "Short-form video (reels) increases knowledge retention by ~20% vs long-form lectures.",
  "Your brain can read 800 wpm with comprehension using speed-reading techniques.",
  "TikTok's average session is 52 minutes. The same time you'd use to read 15K words.",
  "Spaced repetition (reels-style revisiting) improves memory retention by 200%.",
  "The average non-fiction book takes 12-15 hours to read but holds ~15 core ideas.",
  "One manga chapter generates 6-10 panels. Each panel = ~1000 words of story.",
  "AI can summarize faster than you can read. But you still need to *think* about it.",
  "Qwen3 — the model summarising your book — has 235B parameters across 22B active.",
  "Your book's chapters are being processed in parallel with manga and reels.",
  "Each chapter summary is cached. Changing styles = instant, no re-processing.",
  "The canonical summary is the single source of truth. Manga & reels both derive from it.",
  "On average, only 25% of non-fiction book buyers actually finish the book.",
  "Podcasts have 40% retention. Text has 10%. Visual stories have 65%.",
  "Bill Gates reads 50 books/year. With this app, that's 50 summaries in hours.",
  "The human brain evolved to process narrative, not bullet points.",
  "A 300-page book ≈ 90,000 words ≈ ~120,000 tokens for an LLM to read.",
  "Feynman Technique: teach it simply. That's what your reels will do.",
];

export function GenerationFacts({ visible }: { visible: boolean }) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * FACTS.length));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => {
      setTick(n => n + 1);
      setIdx(i => (i + 1) % FACTS.length);
    }, 7000);
    return () => clearInterval(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="border p-4 relative overflow-hidden"
      style={{ borderColor: "rgba(245,166,35,0.2)", background: "rgba(245,166,35,0.03)" }}>
      {/* Subtle animated border */}
      <motion.div className="absolute top-0 left-0 h-0.5"
        style={{ background: "linear-gradient(90deg, var(--amber), transparent)" }}
        animate={{ width: ["0%", "100%"] }}
        transition={{ duration: 7, repeat: Infinity, ease: "linear" }} />

      <div className="flex items-start gap-3">
        <Lightbulb size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--amber)" }} />
        <div className="flex-1 min-w-0">
          <p className="font-label mb-1" style={{ color: "var(--amber)", fontSize: "8px", letterSpacing: "0.2em" }}>
            DID YOU KNOW
          </p>
          <AnimatePresence mode="wait">
            <motion.p key={tick}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4 }}
              style={{ fontFamily: "var(--font-body)", color: "var(--text-2)", fontSize: "0.82rem", lineHeight: 1.55 }}>
              {FACTS[idx]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
