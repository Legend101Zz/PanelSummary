/**
 * sample-living-book.ts — Handcrafted Living Panel Demo
 * ======================================================
 * A full multi-page, multi-act sample based on "Atomic Habits".
 * Each panel uses the DSL v2.0 act system to tell a story
 * through spatial and temporal composition.
 *
 * This is NOT generated — it's hand-directed to showcase
 * what the system can do at its best.
 */

import type { LivingPanelDSL, Act } from "./living-panel-types";

// ============================================================
// PAGE 1: THE OPENING — "Why Small Things Matter"
// Starts as a dark void, text appears letter by letter,
// then the panel CRACKS into 4 sub-panels showing examples.
// ============================================================

export const PANEL_01_OPENING: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#000000", mood: "void" },
  acts: [
    // ACT 1: The void. A single sentence emerges.
    {
      id: "void",
      duration_ms: 4500,
      layout: { type: "full" },
      layers: [
        {
          id: "bg-void", type: "background", opacity: 0,
          props: { gradient: ["#000000", "#050510", "#000000"], gradientAngle: 0 },
        },
        {
          id: "single-line", type: "text",
          x: "50%", y: "50%", opacity: 0,
          props: {
            content: "What if the smallest thing you do today\nchanges everything tomorrow?",
            fontSize: "clamp(1.1rem, 3.5vw, 2rem)",
            fontFamily: "body",
            color: "#e0e0e0",
            textAlign: "center",
            maxWidth: 500,
            lineHeight: 1.7,
            typewriter: true,
            typewriterSpeed: 45,
          },
        },
        {
          id: "dot", type: "shape",
          x: "50%", y: "78%", opacity: 0,
          width: 6, height: 6,
          props: { shape: "circle", fill: "#3d7bff", radius: 3 },
        },
      ],
      cells: [],
      timeline: [
        { at: 300, target: "bg-void", animate: { opacity: [0, 1] }, duration: 800, easing: "ease-in" },
        { at: 800, target: "single-line", animate: { opacity: [0, 1], typewriter: true }, duration: 3000 },
        { at: 3800, target: "dot", animate: { opacity: [0, 1], scale: [0, 1] }, duration: 400, easing: "spring" },
      ],
    },

    // ACT 2: The panel CRACKS into 4 windows showing habit examples
    {
      id: "crack-open",
      duration_ms: 8000,
      transition_in: { type: "crack", duration_ms: 600, easing: "sharp" },
      layout: { type: "grid-2x2", gap: 3, stagger_ms: 300 },
      layers: [
        {
          id: "bg-deep", type: "background",
          props: { gradient: ["#0a0a1a", "#0f0a20"], gradientAngle: 160 },
        },
      ],
      cells: [
        // TOP-LEFT: The morning person
        {
          id: "cell-morning",
          position: "tl",
          style: { background: "linear-gradient(135deg, #1a1408 0%, #0f0a05 100%)", border: "1px solid #f5a62320" },
          layers: [
            {
              id: "icon-sun", type: "text",
              x: "50%", y: "25%", opacity: 0,
              props: { content: "☀️", fontSize: "2.5rem", textAlign: "center" },
            },
            {
              id: "txt-morning", type: "text",
              x: "50%", y: "55%", opacity: 0,
              props: {
                content: "5:30 AM\nOne pushup.",
                fontSize: "clamp(0.7rem, 2vw, 1rem)",
                fontFamily: "body", color: "#f5a623",
                textAlign: "center", lineHeight: 1.5,
              },
            },
            {
              id: "txt-morning-after", type: "text",
              x: "50%", y: "82%", opacity: 0,
              props: {
                content: "Then two. Then ten.",
                fontSize: "clamp(0.6rem, 1.5vw, 0.8rem)",
                fontFamily: "label", color: "#f5a62380",
                textAlign: "center",
              },
            },
          ],
          timeline: [
            { at: 0, target: "icon-sun", animate: { opacity: [0, 1], scale: [2, 1] }, duration: 500, easing: "spring" },
            { at: 400, target: "txt-morning", animate: { opacity: [0, 1], y: ["65%", "55%"] }, duration: 500 },
            { at: 2000, target: "txt-morning-after", animate: { opacity: [0, 0.5] }, duration: 800 },
          ],
        },
        // TOP-RIGHT: The reader
        {
          id: "cell-reader",
          position: "tr",
          style: { background: "linear-gradient(135deg, #08101a 0%, #050a12 100%)", border: "1px solid #3d7bff20" },
          layers: [
            {
              id: "icon-book", type: "text",
              x: "50%", y: "25%", opacity: 0,
              props: { content: "📖", fontSize: "2.5rem", textAlign: "center" },
            },
            {
              id: "txt-reader", type: "text",
              x: "50%", y: "55%", opacity: 0,
              props: {
                content: "One page\nbefore bed.",
                fontSize: "clamp(0.7rem, 2vw, 1rem)",
                fontFamily: "body", color: "#3d7bff",
                textAlign: "center", lineHeight: 1.5,
              },
            },
            {
              id: "txt-reader-after", type: "text",
              x: "50%", y: "82%", opacity: 0,
              props: {
                content: "50 books a year.",
                fontSize: "clamp(0.6rem, 1.5vw, 0.8rem)",
                fontFamily: "label", color: "#3d7bff80",
                textAlign: "center",
              },
            },
          ],
          timeline: [
            { at: 0, target: "icon-book", animate: { opacity: [0, 1], rotate: [-15, 0] }, duration: 500, easing: "spring" },
            { at: 400, target: "txt-reader", animate: { opacity: [0, 1], y: ["65%", "55%"] }, duration: 500 },
            { at: 2200, target: "txt-reader-after", animate: { opacity: [0, 0.5] }, duration: 800 },
          ],
        },
        // BOTTOM-LEFT: The writer
        {
          id: "cell-writer",
          position: "bl",
          style: { background: "linear-gradient(135deg, #0a1a10 0%, #050f08 100%)", border: "1px solid #4caf5020" },
          layers: [
            {
              id: "icon-pen", type: "text",
              x: "50%", y: "25%", opacity: 0,
              props: { content: "✏️", fontSize: "2.5rem", textAlign: "center" },
            },
            {
              id: "txt-writer", type: "text",
              x: "50%", y: "55%", opacity: 0,
              props: {
                content: "One sentence\neach morning.",
                fontSize: "clamp(0.7rem, 2vw, 1rem)",
                fontFamily: "body", color: "#4caf50",
                textAlign: "center", lineHeight: 1.5,
              },
            },
            {
              id: "txt-writer-after", type: "text",
              x: "50%", y: "82%", opacity: 0,
              props: {
                content: "A novel in 18 months.",
                fontSize: "clamp(0.6rem, 1.5vw, 0.8rem)",
                fontFamily: "label", color: "#4caf5080",
                textAlign: "center",
              },
            },
          ],
          timeline: [
            { at: 0, target: "icon-pen", animate: { opacity: [0, 1], y: ["40%", "25%"] }, duration: 500, easing: "ease-out" },
            { at: 400, target: "txt-writer", animate: { opacity: [0, 1], y: ["65%", "55%"] }, duration: 500 },
            { at: 2400, target: "txt-writer-after", animate: { opacity: [0, 0.5] }, duration: 800 },
          ],
        },
        // BOTTOM-RIGHT: The compound effect
        {
          id: "cell-compound",
          position: "br",
          style: { background: "linear-gradient(135deg, #1a0a20 0%, #0f0518 100%)", border: "1px solid #bb86fc20" },
          layers: [
            {
              id: "percent", type: "text",
              x: "50%", y: "30%", opacity: 0,
              props: {
                content: "1%",
                fontSize: "clamp(2rem, 6vw, 3.5rem)",
                fontFamily: "display", color: "#bb86fc",
                textAlign: "center",
                textShadow: "0 0 30px #bb86fc40",
              },
            },
            {
              id: "txt-compound", type: "text",
              x: "50%", y: "65%", opacity: 0,
              props: {
                content: "better every day\n= 37× in a year",
                fontSize: "clamp(0.7rem, 2vw, 1rem)",
                fontFamily: "body", color: "#bb86fc",
                textAlign: "center", lineHeight: 1.5,
              },
            },
          ],
          timeline: [
            { at: 0, target: "percent", animate: { opacity: [0, 1], scale: [3, 1] }, duration: 700, easing: "spring" },
            { at: 600, target: "txt-compound", animate: { opacity: [0, 1] }, duration: 600 },
            { at: 2000, target: "percent", animate: { pulse: { minScale: 0.95, maxScale: 1.08 } }, duration: 1500, repeat: -1, yoyo: true },
          ],
        },
      ],
      timeline: [],
    },
  ],
  meta: {
    panel_id: "opening-001",
    chapter_index: 0,
    content_type: "intro",
    narrative_beat: "The hook — small things compound into transformations",
    duration_ms: 12500,
  },
};

// ============================================================
// PAGE 2: THE HABIT LOOP — "The Four Laws"
// Starts with a character dialogue, then splits to show
// each step of the habit loop in sequence.
// ============================================================

export const PANEL_02_HABIT_LOOP: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#060610", mood: "revelation" },
  acts: [
    // ACT 1: Mentor introduces the concept
    {
      id: "mentor-intro",
      duration_ms: 5000,
      layout: { type: "full" },
      layers: [
        {
          id: "bg1", type: "background",
          props: { gradient: ["#060610", "#0c0a1a", "#060610"], gradientAngle: 180, pattern: "halftone", patternColor: "#ffffff", patternOpacity: 0.03 },
        },
        {
          id: "sage", type: "sprite",
          x: "65%", y: "40%", opacity: 0,
          props: { character: "Sensei Ryo", expression: "wise", size: 72, showName: true, glowColor: "#f5a62330" },
        },
        {
          id: "kai", type: "sprite",
          x: "25%", y: "50%", opacity: 0,
          props: { character: "Hana", expression: "curious", size: 56, showName: true },
        },
        {
          id: "bubble-hana", type: "speech_bubble",
          x: "8%", y: "28%", opacity: 0,
          props: {
            text: "But I always quit after two weeks...",
            character: "Hana", style: "speech",
            tailDirection: "bottom", maxWidth: 200,
            typewriter: true, typewriterSpeed: 35,
          },
        },
        {
          id: "bubble-ryo", type: "speech_bubble",
          x: "48%", y: "18%", opacity: 0,
          props: {
            text: "You’re not failing at habits. You’re missing the loop.",
            character: "Sensei Ryo", style: "speech",
            tailDirection: "bottom", maxWidth: 240,
            typewriter: true, typewriterSpeed: 30,
            emphasis: true,
          },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "kai", animate: { opacity: [0, 1], x: ["-5%", "25%"] }, duration: 500, easing: "ease-out" },
        { at: 400, target: "sage", animate: { opacity: [0, 1], x: ["100%", "65%"] }, duration: 600, easing: "ease-out" },
        { at: 1000, target: "bubble-hana", animate: { opacity: [0, 1], typewriter: true }, duration: 1200 },
        { at: 2800, target: "bubble-ryo", animate: { opacity: [0, 1], typewriter: true }, duration: 1800 },
      ],
    },

    // ACT 2: The Loop — panel splits into a vertical flow
    {
      id: "the-loop",
      duration_ms: 10000,
      transition_in: { type: "morph", duration_ms: 500, easing: "ease-in-out" },
      layout: { type: "split-v", gap: 2, stagger_ms: 500 },
      layers: [
        {
          id: "bg-loop", type: "background",
          props: { gradient: ["#0a0a1a", "#100a20"], gradientAngle: 180 },
        },
      ],
      cells: [
        // TOP: The loop diagram
        {
          id: "cell-diagram",
          position: "top",
          style: { background: "transparent" },
          layers: [
            {
              id: "loop-title", type: "text",
              x: "50%", y: "15%", opacity: 0,
              props: {
                content: "THE HABIT LOOP",
                fontSize: "clamp(0.8rem, 2.5vw, 1.3rem)",
                fontFamily: "display", color: "#ffffff",
                textAlign: "center", letterSpacing: "0.15em",
              },
            },
            // Four steps as a horizontal sequence
            { id: "step-cue", type: "text", x: "12%", y: "55%", opacity: 0,
              props: { content: "CUE", fontSize: "clamp(0.9rem, 2vw, 1.2rem)", fontFamily: "display", color: "#00f5ff", textAlign: "center" } },
            { id: "arrow-1", type: "text", x: "28%", y: "55%", opacity: 0,
              props: { content: "→", fontSize: "1.2rem", color: "#ffffff30", textAlign: "center" } },
            { id: "step-craving", type: "text", x: "38%", y: "55%", opacity: 0,
              props: { content: "CRAVING", fontSize: "clamp(0.9rem, 2vw, 1.2rem)", fontFamily: "display", color: "#f5a623", textAlign: "center" } },
            { id: "arrow-2", type: "text", x: "55%", y: "55%", opacity: 0,
              props: { content: "→", fontSize: "1.2rem", color: "#ffffff30", textAlign: "center" } },
            { id: "step-response", type: "text", x: "68%", y: "55%", opacity: 0,
              props: { content: "RESPONSE", fontSize: "clamp(0.9rem, 2vw, 1.2rem)", fontFamily: "display", color: "#4caf50", textAlign: "center" } },
            { id: "arrow-3", type: "text", x: "84%", y: "55%", opacity: 0,
              props: { content: "→", fontSize: "1.2rem", color: "#ffffff30", textAlign: "center" } },
            { id: "step-reward", type: "text", x: "93%", y: "55%", opacity: 0,
              props: { content: "REWARD", fontSize: "clamp(0.9rem, 2vw, 1.2rem)", fontFamily: "display", color: "#bb86fc", textAlign: "center" } },
          ],
          timeline: [
            { at: 0, target: "loop-title", animate: { opacity: [0, 1], y: ["25%", "15%"] }, duration: 500 },
            { at: 500, target: "step-cue", animate: { opacity: [0, 1], scale: [0.5, 1] }, duration: 400, easing: "spring" },
            { at: 900, target: "arrow-1", animate: { opacity: [0, 0.5] }, duration: 200 },
            { at: 1100, target: "step-craving", animate: { opacity: [0, 1], scale: [0.5, 1] }, duration: 400, easing: "spring" },
            { at: 1500, target: "arrow-2", animate: { opacity: [0, 0.5] }, duration: 200 },
            { at: 1700, target: "step-response", animate: { opacity: [0, 1], scale: [0.5, 1] }, duration: 400, easing: "spring" },
            { at: 2100, target: "arrow-3", animate: { opacity: [0, 0.5] }, duration: 200 },
            { at: 2300, target: "step-reward", animate: { opacity: [0, 1], scale: [0.5, 1] }, duration: 400, easing: "spring" },
          ],
        },
        // BOTTOM: Example application
        {
          id: "cell-example",
          position: "bottom",
          style: { background: "linear-gradient(180deg, #0a0a1a00 0%, #0a0a1a 20%)", border: "none" },
          layers: [
            {
              id: "example-title", type: "text",
              x: "50%", y: "10%", opacity: 0,
              props: {
                content: "Example: Building a reading habit",
                fontSize: "clamp(0.6rem, 1.5vw, 0.85rem)",
                fontFamily: "label", color: "#ffffff50",
                textAlign: "center", letterSpacing: "0.1em",
              },
            },
            {
              id: "ex-data", type: "data_block",
              x: "50%", y: "55%", opacity: 0,
              props: {
                items: [
                  { label: "CUE: Put a book on your pillow", icon: "📍", highlight: true },
                  { label: "CRAVING: Feel the pull of a good story", icon: "✨" },
                  { label: "RESPONSE: Read one page", icon: "📖" },
                  { label: "REWARD: Mark it on your habit tracker", icon: "✅" },
                ],
                layout: "stack", accentColor: "#00f5ff",
                showIndex: false, animateIn: "stagger", staggerDelay: 400,
              },
            },
          ],
          timeline: [
            { at: 500, target: "example-title", animate: { opacity: [0, 0.6] }, duration: 400 },
            { at: 800, target: "ex-data", animate: { opacity: [0, 1], y: ["65%", "55%"] }, duration: 600, easing: "ease-out" },
          ],
        },
      ],
      timeline: [],
    },
  ],
  meta: {
    panel_id: "habit-loop-002",
    chapter_index: 0,
    content_type: "concept",
    narrative_beat: "Introducing the four-step habit loop",
    duration_ms: 15000,
  },
};

// ============================================================
// PAGE 3: THE IDENTITY SHIFT — "Become, Don't Just Do"
// Three-act structure: bold statement → contrast → revelation
// ============================================================

export const PANEL_03_IDENTITY: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#050505", mood: "confrontation" },
  acts: [
    // ACT 1: The wrong way (crossed out)
    {
      id: "wrong-way",
      duration_ms: 3500,
      layout: { type: "full" },
      layers: [
        {
          id: "bg-wrong", type: "background",
          props: { gradient: ["#1a0505", "#100000"], gradientAngle: 180 },
        },
        {
          id: "wrong-label", type: "text",
          x: "50%", y: "20%", opacity: 0,
          props: {
            content: "OUTCOME-BASED",
            fontSize: "clamp(0.6rem, 1.5vw, 0.8rem)",
            fontFamily: "label", color: "#e8191a80",
            textAlign: "center", letterSpacing: "0.2em",
          },
        },
        {
          id: "wrong-text", type: "text",
          x: "50%", y: "45%", opacity: 0,
          props: {
            content: "\"I want to lose 20 pounds.\"",
            fontSize: "clamp(1.2rem, 4vw, 2.2rem)",
            fontFamily: "display", color: "#e8191a",
            textAlign: "center",
          },
        },
        {
          id: "strikethrough", type: "shape",
          x: "15%", y: "48%", opacity: 0,
          width: "70%", height: 3,
          props: { shape: "line", stroke: "#e8191a", strokeWidth: 3 },
        },
        {
          id: "vignette", type: "effect", opacity: 0,
          props: { effect: "vignette", color: "#000000", intensity: 0.8 },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "bg-wrong", animate: { opacity: [0, 1] }, duration: 500 },
        { at: 200, target: "vignette", animate: { opacity: [0, 1] }, duration: 500 },
        { at: 400, target: "wrong-label", animate: { opacity: [0, 0.6] }, duration: 400 },
        { at: 600, target: "wrong-text", animate: { opacity: [0, 1], scale: [1.1, 1] }, duration: 500 },
        { at: 2000, target: "strikethrough", animate: { opacity: [0, 1], width: ["0%", "70%"] }, duration: 300, easing: "sharp" },
      ],
    },

    // ACT 2: The right way (golden)
    {
      id: "right-way",
      duration_ms: 4000,
      transition_in: { type: "fade", duration_ms: 400, color: "#000000" },
      layout: { type: "full" },
      layers: [
        {
          id: "bg-right", type: "background",
          props: { gradient: ["#0a0a05", "#1a1408", "#0a0a05"], gradientAngle: 160 },
        },
        {
          id: "right-label", type: "text",
          x: "50%", y: "20%", opacity: 0,
          props: {
            content: "IDENTITY-BASED",
            fontSize: "clamp(0.6rem, 1.5vw, 0.8rem)",
            fontFamily: "label", color: "#f5a62380",
            textAlign: "center", letterSpacing: "0.2em",
          },
        },
        {
          id: "right-text", type: "text",
          x: "50%", y: "45%", opacity: 0,
          props: {
            content: "\"I am the type of person\nwho moves every day.\"",
            fontSize: "clamp(1.2rem, 4vw, 2.2rem)",
            fontFamily: "display", color: "#f5a623",
            textAlign: "center", lineHeight: 1.4,
            textShadow: "0 0 40px #f5a62330",
          },
        },
        {
          id: "sparkles", type: "effect", opacity: 0,
          props: { effect: "sparkle", color: "#f5a623", count: 8, intensity: 0.4 },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "right-label", animate: { opacity: [0, 0.6] }, duration: 400 },
        { at: 400, target: "right-text", animate: { opacity: [0, 1], scale: [0.9, 1] }, duration: 600, easing: "spring" },
        { at: 1200, target: "sparkles", animate: { opacity: [0, 1] }, duration: 500 },
      ],
    },

    // ACT 3: The split — contrast side by side
    {
      id: "contrast",
      duration_ms: 6000,
      transition_in: { type: "morph", duration_ms: 500, easing: "ease-in-out" },
      layout: { type: "split-h", gap: 2 },
      layers: [],
      cells: [
        {
          id: "cell-outcome",
          position: "left",
          style: { background: "linear-gradient(180deg, #1a0505 0%, #0a0000 100%)", border: "1px solid #e8191a15" },
          layers: [
            { id: "o-label", type: "text", x: "50%", y: "12%", opacity: 0,
              props: { content: "OUTCOME", fontSize: "0.6rem", fontFamily: "label", color: "#e8191a60", textAlign: "center", letterSpacing: "0.15em" } },
            { id: "o-q", type: "text", x: "50%", y: "35%", opacity: 0,
              props: { content: "\"What do I want?\"", fontSize: "clamp(0.9rem, 2.5vw, 1.3rem)", fontFamily: "body", color: "#e8191a", textAlign: "center" } },
            { id: "o-result", type: "text", x: "50%", y: "70%", opacity: 0,
              props: { content: "Willpower-dependent\nQuits when hard\nExternal motivation", fontSize: "clamp(0.55rem, 1.3vw, 0.75rem)",
                fontFamily: "body", color: "#e8191a60", textAlign: "center", lineHeight: 1.8 } },
          ],
          timeline: [
            { at: 300, target: "o-label", animate: { opacity: [0, 0.6] }, duration: 300 },
            { at: 500, target: "o-q", animate: { opacity: [0, 1] }, duration: 400 },
            { at: 1500, target: "o-result", animate: { opacity: [0, 0.6], y: ["78%", "70%"] }, duration: 500 },
          ],
        },
        {
          id: "cell-identity",
          position: "right",
          style: { background: "linear-gradient(180deg, #14120a 0%, #0a0905 100%)", border: "1px solid #f5a62320" },
          layers: [
            { id: "i-label", type: "text", x: "50%", y: "12%", opacity: 0,
              props: { content: "IDENTITY", fontSize: "0.6rem", fontFamily: "label", color: "#f5a62360", textAlign: "center", letterSpacing: "0.15em" } },
            { id: "i-q", type: "text", x: "50%", y: "35%", opacity: 0,
              props: { content: "\"Who do I want to become?\"", fontSize: "clamp(0.9rem, 2.5vw, 1.3rem)", fontFamily: "body", color: "#f5a623", textAlign: "center" } },
            { id: "i-result", type: "text", x: "50%", y: "70%", opacity: 0,
              props: { content: "Self-reinforcing\nProof of identity\nIntrinsic motivation", fontSize: "clamp(0.55rem, 1.3vw, 0.75rem)",
                fontFamily: "body", color: "#f5a62380", textAlign: "center", lineHeight: 1.8 } },
          ],
          timeline: [
            { at: 300, target: "i-label", animate: { opacity: [0, 0.6] }, duration: 300 },
            { at: 500, target: "i-q", animate: { opacity: [0, 1] }, duration: 400 },
            { at: 1500, target: "i-result", animate: { opacity: [0, 0.8], y: ["78%", "70%"] }, duration: 500 },
          ],
        },
      ],
      timeline: [],
    },
  ],
  meta: {
    panel_id: "identity-003",
    chapter_index: 1,
    content_type: "concept",
    narrative_beat: "The identity shift — become, don't just do",
    duration_ms: 13500,
  },
};

// ============================================================
// PAGE 4: THE ENVIRONMENT — "Design Your World"
// A single dramatic reveal with speed lines and impact
// ============================================================

export const PANEL_04_ENVIRONMENT: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#050a10", mood: "revelation" },
  acts: [
    {
      id: "environment-reveal",
      duration_ms: 8000,
      layout: { type: "full" },
      layers: [
        {
          id: "bg-env", type: "background", opacity: 0,
          props: { gradient: ["#050a10", "#0a1520", "#051015"], gradientAngle: 160, pattern: "manga_screen", patternColor: "#00bfa5", patternOpacity: 0.04 },
        },
        {
          id: "speed", type: "effect", opacity: 0,
          props: { effect: "speed_lines", color: "#00bfa5", count: 32, intensity: 0.7 },
        },
        {
          id: "impact", type: "effect", opacity: 0,
          props: { effect: "impact_burst", color: "#00bfa5" },
        },
        {
          id: "title-env", type: "text",
          x: "50%", y: "30%", opacity: 0, scale: 2,
          props: {
            content: "YOU DON\u2019T RISE\nTO YOUR GOALS",
            fontSize: "clamp(1.5rem, 5vw, 3rem)",
            fontFamily: "display", color: "#ffffff",
            textAlign: "center", lineHeight: 1.2,
            textShadow: "4px 4px 0 #00bfa540, 0 0 60px rgba(0,0,0,0.9)",
            letterSpacing: "0.03em",
          },
        },
        {
          id: "subtitle-env", type: "text",
          x: "50%", y: "65%", opacity: 0,
          props: {
            content: "You fall to the level of your systems.",
            fontSize: "clamp(0.9rem, 2.5vw, 1.4rem)",
            fontFamily: "body", color: "#00bfa5",
            textAlign: "center",
            typewriter: true, typewriterSpeed: 40,
          },
        },
        {
          id: "attribution", type: "text",
          x: "50%", y: "85%", opacity: 0,
          props: {
            content: "— James Clear",
            fontSize: "clamp(0.6rem, 1.5vw, 0.8rem)",
            fontFamily: "label", color: "#ffffff30",
            textAlign: "center", letterSpacing: "0.1em",
          },
        },
      ],
      cells: [],
      timeline: [
        { at: 0, target: "bg-env", animate: { opacity: [0, 1] }, duration: 500 },
        { at: 300, target: "speed", animate: { opacity: [0, 0.5] }, duration: 300 },
        { at: 400, target: "impact", animate: { opacity: [0, 1] }, duration: 200 },
        { at: 400, target: "title-env", animate: { opacity: [0, 1], scale: [1.8, 1] }, duration: 600, easing: "spring" },
        { at: 2500, target: "subtitle-env", animate: { opacity: [0, 1], typewriter: true }, duration: 2000 },
        { at: 5500, target: "attribution", animate: { opacity: [0, 0.4] }, duration: 600 },
        { at: 1500, target: "speed", animate: { opacity: [0.5, 0.15] }, duration: 2000 },
      ],
    },
  ],
  meta: {
    panel_id: "environment-004",
    chapter_index: 2,
    content_type: "splash",
    narrative_beat: "The most powerful quote — systems over goals",
    duration_ms: 8000,
  },
};

// ============================================================
// PAGE 5: THE DIALOGUE — "Two-Minute Rule"
// Pure character interaction with progressive reveal
// ============================================================

export const PANEL_05_TWO_MINUTE: LivingPanelDSL = {
  version: "2.0",
  canvas: { width: 800, height: 600, background: "#08080f", mood: "intimate" },
  acts: [
    {
      id: "two-min-dialogue",
      duration_ms: 12000,
      layout: { type: "full" },
      layers: [
        {
          id: "bg-intimate", type: "background",
          props: { gradient: ["#08080f", "#0f0a18"], gradientAngle: 180, pattern: "dots", patternColor: "#bb86fc", patternOpacity: 0.02 },
        },
        // Characters
        {
          id: "hana-sprite", type: "sprite",
          x: "18%", y: "35%", opacity: 0,
          props: { character: "Hana", expression: "shocked", size: 52, showName: true },
        },
        {
          id: "ryo-sprite", type: "sprite",
          x: "78%", y: "35%", opacity: 0,
          props: { character: "Sensei Ryo", expression: "smirk", size: 64, showName: true, glowColor: "#f5a62320" },
        },
        // Dialogue sequence
        {
          id: "b1", type: "speech_bubble",
          x: "30%", y: "18%", opacity: 0,
          props: { text: "How do I start meditating for 30 minutes?", character: "Hana", style: "speech", tailDirection: "left", maxWidth: 220, typewriter: true, typewriterSpeed: 30 },
        },
        {
          id: "b2", type: "speech_bubble",
          x: "42%", y: "15%", opacity: 0,
          props: { text: "You don’t.", character: "Sensei Ryo", style: "speech", tailDirection: "right", maxWidth: 160, typewriter: true, typewriterSpeed: 50 },
        },
        {
          id: "b3", type: "speech_bubble",
          x: "30%", y: "58%", opacity: 0,
          props: { text: "...what?", character: "Hana", style: "speech", tailDirection: "left", maxWidth: 100, typewriter: true, typewriterSpeed: 60 },
        },
        {
          id: "b4", type: "speech_bubble",
          x: "42%", y: "55%", opacity: 0,
          props: { text: "You meditate for two minutes.\nEvery habit must be small enough\nthat you can’t say no.", character: "Sensei Ryo", style: "speech", tailDirection: "right", maxWidth: 260, typewriter: true, typewriterSpeed: 28 },
        },
        // The punchline — big text at the bottom
        {
          id: "punchline", type: "text",
          x: "50%", y: "88%", opacity: 0,
          props: {
            content: "THE TWO-MINUTE RULE",
            fontSize: "clamp(0.7rem, 2vw, 1rem)",
            fontFamily: "display", color: "#bb86fc",
            textAlign: "center", letterSpacing: "0.2em",
            textShadow: "0 0 20px #bb86fc30",
          },
        },
      ],
      cells: [],
      timeline: [
        { at: 200, target: "hana-sprite", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 300, target: "ryo-sprite", animate: { opacity: [0, 1] }, duration: 400 },
        { at: 800, target: "b1", animate: { opacity: [0, 1], typewriter: true }, duration: 1500 },
        { at: 3000, target: "b2", animate: { opacity: [0, 1], typewriter: true }, duration: 500 },
        { at: 4500, target: "b3", animate: { opacity: [0, 1], typewriter: true }, duration: 400 },
        { at: 5800, target: "b4", animate: { opacity: [0, 1], typewriter: true }, duration: 3000 },
        { at: 10000, target: "punchline", animate: { opacity: [0, 1], scale: [0.8, 1] }, duration: 500, easing: "spring" },
      ],
    },
  ],
  meta: {
    panel_id: "two-minute-005",
    chapter_index: 3,
    content_type: "dialogue",
    narrative_beat: "The two-minute rule — make it so easy you can't say no",
    duration_ms: 12000,
  },
};

// ============================================================
// ALL SAMPLE PANELS (exported as a collection)
// ============================================================

export const SAMPLE_LIVING_PANELS: LivingPanelDSL[] = [
  PANEL_01_OPENING,
  PANEL_02_HABIT_LOOP,
  PANEL_03_IDENTITY,
  PANEL_04_ENVIRONMENT,
  PANEL_05_TWO_MINUTE,
];

/** Helper to get a sample panel by index */
export function getSamplePanel(index: number): LivingPanelDSL {
  return SAMPLE_LIVING_PANELS[index % SAMPLE_LIVING_PANELS.length];
}
