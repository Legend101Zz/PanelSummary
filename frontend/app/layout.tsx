import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PanelSummary", template: "%s | PanelSummary" },
  description: "Turn a book's PDF into a manga adaptation grounded in the book's own text.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eceeef",
};

// Preloaded so neither the interface nor the first page's lettering waits on a font.
const PRELOAD = [
  { href: "/fonts/ui/ZenKakuGothicNew-400-latin.woff2", type: "font/woff2" },
  { href: "/fonts/ui/ShipporiMinchoB1-700-latin.woff2", type: "font/woff2" },
  { href: "/fonts/ComicNeue-Regular.ttf", type: "font/ttf" },
  { href: "/fonts/ComicNeue-Bold.ttf", type: "font/ttf" },
  { href: "/fonts/Bangers-Regular.ttf", type: "font/ttf" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {PRELOAD.map((f) => (
          <link key={f.href} rel="preload" href={f.href} as="font" type={f.type} crossOrigin="anonymous" />
        ))}
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
