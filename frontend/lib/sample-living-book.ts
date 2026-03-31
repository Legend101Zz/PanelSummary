/**
 * sample-living-book.ts — "Atomic Habits" as Living Manga
 * =========================================================
 * INK ON PAPER. Screentone shading. Character silhouettes.
 * This reads like a manga, not a tech demo.
 *
 * Every panel tells a piece of the story through:
 * - Typography that breathes (appearing naturally, not flashily)
 * - Character silhouettes in dialogue
 * - Ink-based effects (speed lines, screentone, crosshatch)
 * - Cream paper backgrounds with pen-drawn borders
 * - Restrained, intentional motion
 */

import type { LivingPanelDSL } from "./living-panel-types";

// ============================================================
// PAGE 1: THE QUESTION
// A quiet opening. Paper. Ink. One question.
// ============================================================

export const PANEL_01_OPENING: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#F2E8D5", mood: "light" },
  acts: [
    {
      id: "the-question",
      duration_ms: 5000,
      layout: { type: "full" },
      layers: [
        {
          id: "bg", type: "background", opacity: 1,
          props: { gradient: ["#F2E8D5", "#EDE0CC"], gradientAngle: 180, pattern: "manga_screen", patternOpacity: 0.04 },
        },
        {
          id: "question", type: "text",
          x: "15%", y: "30%", opacity: 0,
          props: {
            content: "What if the smallest thing\nyou do today...",
            fontSize: "clamp(1.3rem, 4vw, 2.2rem)",
            fontFamily: "display",
            color: "#1A1825",
            textAlign: "left",
            maxWidth: "70%",
            lineHeight: 1.5,
            typewriter: true,
            typewriterSpeed: 55,
          },
        },
        {
          id: "answer", type: "text",
          x: "20%", y: "58%", opacity: 0,
          props: {
            content: "...changes everything tomorrow?",
            fontSize: "clamp(1rem, 3vw, 1.6rem)",
            fontFamily: "body",
            color: "#1A182580",
            textAlign: "left",
            maxWidth: "60%",
            lineHeight: 1.5,
          },
        },
        {
          id: "ink-mark", type: "shape",
          x: "12%", y: "30%", opacity: 0,
          width: 3, height: 80,
          props: { shape: "rect", fill: "#1A1825", stroke: "none", strokeWidth: 0 },
        },
        {
          id: "attribution", type: "text",
          x: "15%", y: "80%", opacity: 0,
          props: {
            content: "\u2014 ATOMIC HABITS",
            fontSize: "0.65rem",
            fontFamily: "label",
            color: "#1A182540",
            letterSpacing: "0.2em",
          },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "ink-mark", animate: { opacity: [0, 0.7] }, duration: 300 },
        { at: 400, target: "question", animate: { opacity: [0, 1], typewriter: true }, duration: 3000 },
        { at: 3800, target: "answer", animate: { opacity: [0, 0.5] }, duration: 600 },
        { at: 4200, target: "attribution", animate: { opacity: [0, 1] }, duration: 400 },
      ],
    },
  ],
  meta: {
    panel_id: "opening-001",
    chapter_index: 0,
    content_type: "narration",
    narrative_beat: "The fundamental question of Atomic Habits",
    duration_ms: 5000,
  },
};

// ============================================================
// PAGE 2: THE MENTOR SCENE
// Two characters. Dialogue. A lesson about habits.
// ============================================================

export const PANEL_02_HABIT_LOOP: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#F2E8D5", mood: "light" },
  acts: [
    {
      id: "scene-setup",
      duration_ms: 6000,
      layout: { type: "full" },
      layers: [
        {
          id: "bg", type: "background", opacity: 1,
          props: { gradient: ["#F2E8D5", "#E8D8BF"], gradientAngle: 160, pattern: "dots", patternOpacity: 0.05 },
        },
        {
          id: "hana", type: "sprite",
          x: "18%", y: "55%", opacity: 0,
          props: { character: "Hana", expression: "curious", facing: "right", size: 56 },
        },
        {
          id: "ryo", type: "sprite",
          x: "70%", y: "52%", opacity: 0,
          props: { character: "Ryo", expression: "wise", facing: "left", size: 60 },
        },
        {
          id: "b-hana", type: "speech_bubble",
          x: "8%", y: "15%", opacity: 0,
          props: {
            text: "I keep trying to build good habits but they never stick...",
            character: "Hana",
            style: "speech",
            tailDirection: "bottom",
            typewriter: true,
            typewriterSpeed: 35,
            maxWidth: 220,
          },
        },
        {
          id: "b-ryo", type: "speech_bubble",
          x: "52%", y: "10%", opacity: 0,
          props: {
            text: "That's because you're thinking about the habit. Think about the system.",
            character: "Ryo",
            style: "speech",
            tailDirection: "bottom",
            typewriter: true,
            typewriterSpeed: 30,
            maxWidth: 230,
          },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "hana", animate: { opacity: [0, 1], x: ["12%", "18%"] }, duration: 500 },
        { at: 400, target: "ryo", animate: { opacity: [0, 1], x: ["76%", "70%"] }, duration: 500 },
        { at: 800, target: "b-hana", animate: { opacity: [0, 1], typewriter: true }, duration: 2000 },
        { at: 3500, target: "b-ryo", animate: { opacity: [0, 1], typewriter: true }, duration: 2200 },
      ],
    },

    // ACT 2: The insight panel
    {
      id: "the-loop",
      duration_ms: 5000,
      transition_in: { type: "fade", duration_ms: 400 },
      layout: { type: "full" },
      layers: [
        {
          id: "bg2", type: "background", opacity: 1,
          props: { gradient: ["#EDE0CC", "#F2E8D5"], gradientAngle: 0, pattern: "crosshatch", patternOpacity: 0.06 },
        },
        {
          id: "narrator", type: "speech_bubble",
          x: "10%", y: "8%", opacity: 0,
          props: {
            text: "THE HABIT LOOP",
            style: "narrator",
            tailDirection: "none",
            maxWidth: 200,
          },
        },
        {
          id: "step1", type: "text",
          x: "15%", y: "30%", opacity: 0,
          props: {
            content: "1. CUE",
            fontSize: "1.2rem",
            fontFamily: "display",
            color: "#1A1825",
          },
        },
        {
          id: "step1-desc", type: "text",
          x: "15%", y: "38%", opacity: 0,
          props: {
            content: "Make it obvious",
            fontSize: "0.85rem",
            fontFamily: "body",
            color: "#1A182570",
          },
        },
        {
          id: "step2", type: "text",
          x: "55%", y: "30%", opacity: 0,
          props: {
            content: "2. CRAVING",
            fontSize: "1.2rem",
            fontFamily: "display",
            color: "#1A1825",
          },
        },
        {
          id: "step2-desc", type: "text",
          x: "55%", y: "38%", opacity: 0,
          props: {
            content: "Make it attractive",
            fontSize: "0.85rem",
            fontFamily: "body",
            color: "#1A182570",
          },
        },
        {
          id: "step3", type: "text",
          x: "15%", y: "58%", opacity: 0,
          props: {
            content: "3. RESPONSE",
            fontSize: "1.2rem",
            fontFamily: "display",
            color: "#1A1825",
          },
        },
        {
          id: "step3-desc", type: "text",
          x: "15%", y: "66%", opacity: 0,
          props: {
            content: "Make it easy",
            fontSize: "0.85rem",
            fontFamily: "body",
            color: "#1A182570",
          },
        },
        {
          id: "step4", type: "text",
          x: "55%", y: "58%", opacity: 0,
          props: {
            content: "4. REWARD",
            fontSize: "1.2rem",
            fontFamily: "display",
            color: "#1A1825",
          },
        },
        {
          id: "step4-desc", type: "text",
          x: "55%", y: "66%", opacity: 0,
          props: {
            content: "Make it satisfying",
            fontSize: "0.85rem",
            fontFamily: "body",
            color: "#1A182570",
          },
        },
        {
          id: "divider-h", type: "shape",
          x: "10%", y: "50%", opacity: 0,
          width: 640, height: 1,
          props: { shape: "line", stroke: "#1A182520", strokeWidth: 1 },
        },
        {
          id: "divider-v", type: "shape",
          x: "50%", y: "25%", opacity: 0,
          width: 1, height: 280,
          props: { shape: "rect", fill: "#1A182515", stroke: "none", strokeWidth: 0 },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "narrator", animate: { opacity: [0, 1] }, duration: 300 },
        { at: 300, target: "divider-h", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 300, target: "divider-v", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 500, target: "step1", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 700, target: "step1-desc", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 1200, target: "step2", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 1400, target: "step2-desc", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 1900, target: "step3", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 2100, target: "step3-desc", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 2600, target: "step4", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 2800, target: "step4-desc", animate: { opacity: [0, 1] }, duration: 400 },
      ],
    },
  ],
  meta: {
    panel_id: "habit-loop-002",
    chapter_index: 1,
    content_type: "dialogue",
    narrative_beat: "The four laws of behavior change",
    duration_ms: 11000,
  },
};

// ============================================================
// PAGE 3: IDENTITY SHIFT
// The core thesis — you don't rise to your goals,
// you fall to the level of your systems.
// ============================================================

export const PANEL_03_IDENTITY: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#1A1825", mood: "dark" },
  acts: [
    {
      id: "the-wrong-way",
      duration_ms: 4000,
      layout: { type: "full" },
      layers: [
        {
          id: "bg-dark", type: "background", opacity: 1,
          props: { gradient: ["#1A1825", "#0F0E17"], gradientAngle: 180, pattern: "halftone", patternOpacity: 0.04 },
        },
        {
          id: "wrong-label", type: "text",
          x: "10%", y: "12%", opacity: 0,
          props: {
            content: "THE WRONG WAY",
            fontSize: "0.65rem",
            fontFamily: "label",
            color: "#E8191A60",
            letterSpacing: "0.15em",
          },
        },
        {
          id: "wrong-text", type: "text",
          x: "10%", y: "35%", opacity: 0,
          props: {
            content: "\"I want to lose 20 pounds.\"",
            fontSize: "clamp(1.1rem, 3vw, 1.8rem)",
            fontFamily: "display",
            color: "#E8191A",
            typewriter: true,
            typewriterSpeed: 40,
          },
        },
        {
          id: "strikethrough", type: "shape",
          x: "10%", y: "42%", opacity: 0,
          width: 340, height: 3,
          props: { shape: "rect", fill: "#E8191A60", stroke: "none", strokeWidth: 0 },
        },
        {
          id: "wrong-sub", type: "text",
          x: "10%", y: "55%", opacity: 0,
          props: {
            content: "Goals focus on outcomes.\nOutcomes are temporary.",
            fontSize: "0.85rem",
            fontFamily: "body",
            color: "#A8A6C080",
            lineHeight: 1.6,
          },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "wrong-label", animate: { opacity: [0, 1] }, duration: 300 },
        { at: 500, target: "wrong-text", animate: { opacity: [0, 1], typewriter: true }, duration: 1500 },
        { at: 2200, target: "strikethrough", animate: { opacity: [0, 0.6] }, duration: 200 },
        { at: 2600, target: "wrong-sub", animate: { opacity: [0, 1] }, duration: 500 },
      ],
    },

    // ACT 2: The right way
    {
      id: "the-right-way",
      duration_ms: 5000,
      transition_in: { type: "fade", duration_ms: 500 },
      layout: { type: "full" },
      layers: [
        {
          id: "bg-paper", type: "background", opacity: 1,
          props: { gradient: ["#F2E8D5", "#EDE0CC"], gradientAngle: 180, pattern: "manga_screen", patternOpacity: 0.05 },
        },
        {
          id: "right-label", type: "text",
          x: "10%", y: "12%", opacity: 0,
          props: {
            content: "THE RIGHT WAY",
            fontSize: "0.65rem",
            fontFamily: "label",
            color: "#1A182560",
            letterSpacing: "0.15em",
          },
        },
        {
          id: "right-text", type: "text",
          x: "10%", y: "30%", opacity: 0,
          props: {
            content: "\"I am the type of person\nwho takes care of their body.\"",
            fontSize: "clamp(1.2rem, 3.5vw, 2rem)",
            fontFamily: "display",
            color: "#1A1825",
            lineHeight: 1.4,
            typewriter: true,
            typewriterSpeed: 40,
          },
        },
        {
          id: "right-sub", type: "text",
          x: "10%", y: "60%", opacity: 0,
          props: {
            content: "Identity drives behavior.\nBehavior reinforces identity.\nThis is how real change happens.",
            fontSize: "0.85rem",
            fontFamily: "body",
            color: "#1A182570",
            lineHeight: 1.7,
          },
        },
        {
          id: "ink-accent", type: "shape",
          x: "8%", y: "28%", opacity: 0,
          width: 3, height: 100,
          props: { shape: "rect", fill: "#1A1825", stroke: "none", strokeWidth: 0 },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "right-label", animate: { opacity: [0, 1] }, duration: 300 },
        { at: 200, target: "ink-accent", animate: { opacity: [0, 0.6] }, duration: 300 },
        { at: 400, target: "right-text", animate: { opacity: [0, 1], typewriter: true }, duration: 2500 },
        { at: 3200, target: "right-sub", animate: { opacity: [0, 1] }, duration: 600 },
      ],
    },
  ],
  meta: {
    panel_id: "identity-003",
    chapter_index: 2,
    content_type: "concept",
    narrative_beat: "Identity-based habits are the foundation",
    duration_ms: 9000,
  },
};

// ============================================================
// PAGE 4: THE BIG QUOTE
// Full-bleed dramatic typography. Speed lines.
// Like the splash page of a shonen manga.
// ============================================================

export const PANEL_04_ENVIRONMENT: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#F2E8D5", mood: "light" },
  acts: [
    {
      id: "big-quote",
      duration_ms: 5000,
      layout: { type: "full" },
      layers: [
        {
          id: "bg", type: "background", opacity: 1,
          props: { gradient: ["#F2E8D5", "#E8D8BF"], gradientAngle: 170, pattern: "halftone", patternOpacity: 0.06 },
        },
        {
          id: "speed", type: "effect",
          props: { effect: "speed_lines", direction: "radial", intensity: 0.3, color: "#1A1825" },
        },
        {
          id: "big-text", type: "text",
          x: "10%", y: "25%", opacity: 0,
          props: {
            content: "You do not rise\nto the level of\nyour goals.",
            fontSize: "clamp(1.4rem, 5vw, 2.8rem)",
            fontFamily: "display",
            color: "#1A1825",
            lineHeight: 1.2,
            typewriter: true,
            typewriterSpeed: 50,
          },
        },
        {
          id: "big-text-2", type: "text",
          x: "10%", y: "65%", opacity: 0,
          props: {
            content: "You fall to the level\nof your systems.",
            fontSize: "clamp(1.2rem, 4vw, 2.2rem)",
            fontFamily: "display",
            color: "#1A182580",
            lineHeight: 1.2,
          },
        },
        {
          id: "dash", type: "shape",
          x: "10%", y: "60%", opacity: 0,
          width: 50, height: 3,
          props: { shape: "rect", fill: "#1A182540", stroke: "none", strokeWidth: 0 },
        },
        {
          id: "author", type: "text",
          x: "10%", y: "85%", opacity: 0,
          props: {
            content: "JAMES CLEAR",
            fontSize: "0.6rem",
            fontFamily: "label",
            color: "#1A182540",
            letterSpacing: "0.2em",
          },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "speed", animate: { opacity: [0, 1] }, duration: 600 },
        { at: 300, target: "big-text", animate: { opacity: [0, 1], typewriter: true }, duration: 2500 },
        { at: 3000, target: "dash", animate: { opacity: [0, 1] }, duration: 200 },
        { at: 3200, target: "big-text-2", animate: { opacity: [0, 0.55] }, duration: 500 },
        { at: 4000, target: "author", animate: { opacity: [0, 1] }, duration: 300 },
      ],
    },
  ],
  meta: {
    panel_id: "systems-004",
    chapter_index: 2,
    content_type: "splash",
    narrative_beat: "The central thesis — systems over goals",
    duration_ms: 5000,
  },
};

// ============================================================
// PAGE 5: THE TWO-MINUTE RULE
// Dialogue scene with a punchline.
// ============================================================

export const PANEL_05_TWO_MINUTE: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#F2E8D5", mood: "light" },
  acts: [
    {
      id: "dialogue",
      duration_ms: 7000,
      layout: { type: "full" },
      layers: [
        {
          id: "bg", type: "background", opacity: 1,
          props: { gradient: ["#F2E8D5", "#E8D8BF"], gradientAngle: 160, pattern: "dots", patternOpacity: 0.04 },
        },
        {
          id: "hana", type: "sprite",
          x: "18%", y: "58%", opacity: 0,
          props: { character: "Hana", expression: "curious", facing: "right", size: 52 },
        },
        {
          id: "ryo", type: "sprite",
          x: "72%", y: "55%", opacity: 0,
          props: { character: "Ryo", expression: "wise", facing: "left", size: 56 },
        },
        {
          id: "b1", type: "speech_bubble",
          x: "6%", y: "10%", opacity: 0,
          props: {
            text: "How do I start reading more?",
            character: "Hana",
            style: "speech",
            tailDirection: "bottom",
            typewriter: true,
            typewriterSpeed: 35,
            maxWidth: 200,
          },
        },
        {
          id: "b2", type: "speech_bubble",
          x: "50%", y: "12%", opacity: 0,
          props: {
            text: "Read one page.",
            character: "Ryo",
            style: "speech",
            tailDirection: "bottom",
            typewriter: true,
            typewriterSpeed: 40,
            maxWidth: 200,
          },
        },
        {
          id: "b3", type: "speech_bubble",
          x: "6%", y: "35%", opacity: 0,
          props: {
            text: "Just... one?",
            character: "Hana",
            style: "speech",
            tailDirection: "bottom",
            typewriter: true,
            typewriterSpeed: 45,
            maxWidth: 160,
          },
        },
        {
          id: "b4", type: "speech_bubble",
          x: "48%", y: "32%", opacity: 0,
          props: {
            text: "A habit must be established before it can be improved. Two minutes. That's all.",
            character: "Ryo",
            style: "speech",
            tailDirection: "bottom",
            typewriter: true,
            typewriterSpeed: 30,
            maxWidth: 240,
          },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "hana", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 300, target: "ryo", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 600, target: "b1", animate: { opacity: [0, 1], typewriter: true }, duration: 1200 },
        { at: 2200, target: "b2", animate: { opacity: [0, 1], typewriter: true }, duration: 800 },
        { at: 3500, target: "b3", animate: { opacity: [0, 1], typewriter: true }, duration: 600 },
        { at: 4600, target: "b4", animate: { opacity: [0, 1], typewriter: true }, duration: 2200 },
      ],
    },

    // ACT 2: The rule
    {
      id: "the-rule",
      duration_ms: 3000,
      transition_in: { type: "fade", duration_ms: 400 },
      layout: { type: "full" },
      layers: [
        {
          id: "bg2", type: "background", opacity: 1,
          props: { gradient: ["#EDE0CC", "#F2E8D5"], gradientAngle: 0, pattern: "crosshatch", patternOpacity: 0.05 },
        },
        {
          id: "rule-label", type: "speech_bubble",
          x: "25%", y: "10%", opacity: 0,
          props: {
            text: "THE TWO-MINUTE RULE",
            style: "narrator",
            tailDirection: "none",
            maxWidth: 280,
          },
        },
        {
          id: "rule-text", type: "text",
          x: "15%", y: "35%", opacity: 0,
          props: {
            content: "When you start a new habit,\nit should take less than\ntwo minutes to do.",
            fontSize: "clamp(1.1rem, 3.5vw, 1.8rem)",
            fontFamily: "display",
            color: "#1A1825",
            lineHeight: 1.4,
          },
        },
        {
          id: "rule-sub", type: "text",
          x: "15%", y: "70%", opacity: 0,
          props: {
            content: "Master the art of showing up.",
            fontSize: "0.9rem",
            fontFamily: "body",
            color: "#1A182560",
          },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "rule-label", animate: { opacity: [0, 1] }, duration: 300 },
        { at: 500, target: "rule-text", animate: { opacity: [0, 1] }, duration: 500 },
        { at: 1500, target: "rule-sub", animate: { opacity: [0, 1] }, duration: 400 },
      ],
    },
  ],
  meta: {
    panel_id: "two-minute-005",
    chapter_index: 3,
    content_type: "dialogue",
    narrative_beat: "The two-minute rule — make it so easy you can't say no",
    duration_ms: 10000,
  },
};

// ============================================================
// ALL SAMPLE PANELS
// ============================================================

export const SAMPLE_LIVING_PANELS: LivingPanelDSL[] = [
  PANEL_01_OPENING,
  PANEL_02_HABIT_LOOP,
  PANEL_03_IDENTITY,
  PANEL_04_ENVIRONMENT,
  PANEL_05_TWO_MINUTE,
];

export function getSamplePanel(index: number): LivingPanelDSL {
  return SAMPLE_LIVING_PANELS[index % SAMPLE_LIVING_PANELS.length];
}
