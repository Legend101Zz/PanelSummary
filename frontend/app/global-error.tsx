"use client";

// Replaces the root layout when the layout itself fails. It needs its own <html> and <body>,
// and it has no router: plain links and a plain reload.
import "./globals.css";
import "./tokens.css";
import { THEME_SCRIPT } from "@/lib/theme";
import { GITHUB_URL } from "@/lib/words";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  if (typeof console !== "undefined") console.error(error);
  const button = { display: "inline-flex", alignItems: "center", minHeight: 52, padding: "0 22px", borderRadius: 14, border: "2px solid var(--app-line-strong)", fontSize: 18, fontWeight: 700, textDecoration: "none", cursor: "pointer", fontFamily: "inherit" } as const;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Error | PanelSummary</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="app-root" style={{ minHeight: "100dvh", padding: "56px 16px" }}>
          <main id="main" style={{ maxWidth: 640, margin: "0 auto" }}>
            <p style={{ fontWeight: 800, color: "var(--app-text-2)", margin: "0 0 8px" }}>PanelSummary · Error</p>
            <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: "0 0 12px", letterSpacing: "var(--app-tracking-heading)" }}>This page stopped with an error.</h1>
            <p style={{ fontSize: 18, margin: "0 0 20px" }}>Your books and drawn pages are safe on your computer. Reload the page to try again.</p>
            <p style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "0 0 28px" }}>
              <button type="button" onClick={() => window.location.reload()} style={{ ...button, background: "var(--app-action)", color: "var(--app-on-action)" }}>
                Reload the page
              </button>
              <a href="/" style={{ ...button, background: "var(--app-surface)", color: "var(--app-text)" }}>
                Go to your shelf
              </a>
            </p>
            <p style={{ fontSize: 15, color: "var(--app-text-2)" }}>
              If this happens again, report it. Give the address of the page and what you did.{" "}
              <a href={`${GITHUB_URL}/issues/new`} rel="noopener noreferrer" style={{ color: "inherit", fontWeight: 700 }}>
                Report it on GitHub
              </a>
            </p>
          </main>
        </div>
      </body>
    </html>
  );
}
