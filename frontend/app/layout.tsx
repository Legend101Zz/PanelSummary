import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./tokens.css";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "PanelSummary", template: "%s | PanelSummary" },
  description: "Turn a book's PDF into a manga adaptation grounded in the book's own text.",
};

// themeColor follows the system setting. The theme script below sets data-theme before first paint;
// a viewer who chose a theme that differs from the system keeps the system tint of the browser bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F5F0" },
    { media: "(prefers-color-scheme: dark)", color: "#26272A" },
  ],
};

// Preloaded so neither the interface nor the first page's lettering waits on a font.
// The Bricolage Grotesque file is the app frame's one typeface (self-hosted, no font CDN).
// The Zen Kaku / Shippori faces belong to the reader, and the lettering faces to the page SVG
// (covers and thumbnails show page SVG too).
const PRELOAD = [
  { href: "/fonts/BricolageGrotesque-VF.woff2", type: "font/woff2" },
  { href: "/fonts/ui/ZenKakuGothicNew-400-latin.woff2", type: "font/woff2" },
  { href: "/fonts/ui/ShipporiMinchoB1-700-latin.woff2", type: "font/woff2" },
  { href: "/fonts/ComicNeue-Regular.ttf", type: "font/ttf" },
  { href: "/fonts/ComicNeue-Bold.ttf", type: "font/ttf" },
  { href: "/fonts/Bangers-Regular.ttf", type: "font/ttf" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script adds data-theme to <html> before React runs.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {PRELOAD.map((f) => (
          <link key={f.href} rel="preload" href={f.href} as="font" type={f.type} crossOrigin="anonymous" />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
