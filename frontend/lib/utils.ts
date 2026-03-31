import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export { STYLE_OPTIONS } from "./types";

/** Merge Tailwind classes safely (shadcn/ui utility) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as a compact string (e.g. 1500 → "1.5K") */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/** Format a cost in USD */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(3)}`;
}

/** Get a CSS gradient string for a visual theme description */
export function getReelGradient(visualTheme: string): string {
  const lower = visualTheme.toLowerCase();

  if (lower.includes("cyan") || lower.includes("plasma")) {
    return "linear-gradient(135deg, #0a0a2e 0%, #0a2a3e 100%)";
  }
  if (lower.includes("magenta") || lower.includes("pink") || lower.includes("sakura")) {
    return "linear-gradient(135deg, #1a0a2e 0%, #2e0a1a 100%)";
  }
  if (lower.includes("gold") || lower.includes("yellow")) {
    return "linear-gradient(135deg, #1a1200 0%, #2e2000 100%)";
  }
  if (lower.includes("green") || lower.includes("emerald")) {
    return "linear-gradient(135deg, #001a0a 0%, #002e1a 100%)";
  }
  if (lower.includes("noir") || lower.includes("dark")) {
    return "linear-gradient(135deg, #080810 0%, #0f0f18 100%)";
  }
  // Default: deep space manga
  return "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 100%)";
}

/** Get accent color for a style */
export function getStyleAccent(style: string): string {
  const map: Record<string, string> = {
    manga: "#00f5ff",
    noir: "#c8b891",
    minimalist: "#ffffff",
    comedy: "#ffdd00",
    academic: "#4fc3f7",
  };
  return map[style] || "#00f5ff";
}

/** Truncate text to a max length with ellipsis */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/** Format reading time estimate */
export function readingTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 200); // avg reading speed
  if (minutes < 60) return `${minutes} min read`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m read`;
}
