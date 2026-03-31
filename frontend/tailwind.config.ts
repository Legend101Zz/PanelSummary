import type { Config } from "tailwindcss";

// VIBE: This is where all our manga color palette lives
// Every color choice is intentional — shonen manga meets modern webtoon
const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // ============================================================
      // MANGA COLOR SYSTEM
      // Deep blacks + neon accents = living manga page
      // ============================================================
      colors: {
        // Core backgrounds
        ink: {
          DEFAULT: "#0a0a0f",  // Pure manga black
          50: "#f0f0f8",
          100: "#e8e8f4",
          200: "#d0d0e8",
          300: "#a8a8cc",
          400: "#7070a8",
          500: "#484870",
          600: "#303058",
          700: "#1e1e3c",
          800: "#131328",
          900: "#0a0a1a",
          950: "#050509",
        },
        // Neon cyan accent (primary energy)
        plasma: {
          DEFAULT: "#00f5ff",
          dim: "#00c4cc",
          bright: "#80faff",
          glow: "rgba(0, 245, 255, 0.3)",
        },
        // Neon magenta accent (secondary energy)
        sakura: {
          DEFAULT: "#ff007f",
          dim: "#cc0066",
          bright: "#ff80bf",
          glow: "rgba(255, 0, 127, 0.3)",
        },
        // Gold for highlights and achievements
        manga_gold: {
          DEFAULT: "#ffd700",
          dim: "#cc9900",
          bright: "#ffe880",
        },
        // Panel backgrounds
        panel: {
          DEFAULT: "#12121f",
          light: "#1a1a2e",
          border: "#2a2a4a",
          highlight: "#1e1e3a",
        },
      },

      // ============================================================
      // TYPOGRAPHY
      // Bricolage Grotesque for headings — bold and distinctive
      // JetBrains Mono for code/labels — technical feel
      // ============================================================
      fontFamily: {
        display: ["Bricolage Grotesque", "sans-serif"],
        body: ["Satoshi", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        manga: ["Bangers", "cursive"],   // For speech bubbles
      },

      // ============================================================
      // ANIMATIONS
      // ============================================================
      keyframes: {
        // Speed lines burst on transition
        speedlines: {
          "0%": { transform: "scaleX(0)", opacity: "0" },
          "50%": { opacity: "1" },
          "100%": { transform: "scaleX(1)", opacity: "0" },
        },
        // Neon glow pulse
        neon_pulse: {
          "0%, 100%": {
            boxShadow: "0 0 5px var(--plasma), 0 0 20px var(--plasma-dim)",
          },
          "50%": {
            boxShadow: "0 0 20px var(--plasma), 0 0 60px var(--plasma-dim)",
          },
        },
        // Panel shake on reveal
        panel_shake: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(-2px, 2px)" },
          "75%": { transform: "translate(2px, -2px)" },
        },
        // Manga panel slide-in from right
        slide_in_right: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        // Floating animation for UI elements
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        speedlines: "speedlines 0.6s ease-out",
        neon_pulse: "neon_pulse 2s ease-in-out infinite",
        panel_shake: "panel_shake 0.3s ease-in-out",
        slide_in: "slide_in_right 0.4s ease-out",
        float: "float 3s ease-in-out infinite",
      },

      // ============================================================
      // BORDERS & RADIUS
      // Sharp manga-style edges
      // ============================================================
      borderRadius: {
        panel: "2px",        // Manga panels are nearly square-cornered
        bubble: "20px",      // Speech bubbles are round
        card: "8px",
      },

      // ============================================================
      // GRADIENTS (defined as background-image)
      // ============================================================
      backgroundImage: {
        "manga-gradient": "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a2e 100%)",
        "panel-gradient": "linear-gradient(180deg, #12121f 0%, #1a1a2e 100%)",
        "reel-gradient": "linear-gradient(180deg, transparent 0%, rgba(10,10,25,0.8) 60%, #0a0a1a 100%)",
        "speed-lines": "repeating-conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(0,245,255,0.03) 1deg, transparent 2deg)",
      },

      // ============================================================
      // SPACING EXTRAS
      // ============================================================
      height: {
        reel: "100dvh",    // Dynamic viewport height for reels
        panel: "calc(100dvh - 4rem)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
