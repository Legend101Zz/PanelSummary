"use client";

import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { Upload, BookOpen, Menu, X } from "lucide-react";

// ─── CHAPTER NAMES (shown in nav for each route) ──────────────
const CHAPTER_MAP: Record<string, string> = {
  "/":       "CH.00 — TITLE PAGE",
  "/upload": "CH.01 — THE UPLOAD",
};
function getChapter(path: string) {
  if (path.startsWith("/books") && path.includes("/manga")) return "CH.03 — MANGA READER";
  if (path.startsWith("/books")) return "CH.02 — BOOK DETAIL";
  return CHAPTER_MAP[path] ?? "PANELSUMMARY";
}

// ─── MOBILE DRAWER ────────────────────────────────────────────
function MobileDrawer({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.nav
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-64 flex flex-col border-l"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
              <span className="font-label text-xs" style={{ color: "var(--amber)", letterSpacing: "0.2em" }}>MENU</span>
              <button onClick={onClose} style={{ color: "var(--text-3)" }}><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-1 p-4">
              {[
                { href: "/", label: "Title Page", icon: BookOpen },
                { href: "/upload", label: "Upload", icon: Upload },
              ].map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={onClose}>
                  <div className={`flex items-center gap-3 px-3 py-3 border transition-all ${pathname === href ? "border-amber-500" : "border-transparent hover:border-[var(--border)]"}`}
                    style={{ background: pathname === href ? "rgba(245,166,35,0.06)" : "transparent" }}>
                    <Icon size={16} style={{ color: pathname === href ? "var(--amber)" : "var(--text-3)" }} />
                    <span className="font-label text-xs tracking-widest"
                      style={{ color: pathname === href ? "var(--amber)" : "var(--text-2)" }}>
                      {label.toUpperCase()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── MAIN LAYOUT ──────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <title>PanelSummary — Books as Manga</title>
        <meta name="description" content="Turn any PDF into swipeable manga panels and lesson reels" />
        <meta name="theme-color" content="#0F0E17" />
      </head>
      <body>
        {/* ── NAV ────────────────────────────────────────────── */}
        <header
            className="fixed top-0 left-0 right-0 z-40 transition-all duration-300"
            style={{
              background: scrolled ? "rgba(15,14,23,0.92)" : "transparent",
              borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
              backdropFilter: scrolled ? "blur(12px)" : "none",
            }}
          >
            <div className="max-w-6xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 group">
                <div
                  className="w-7 h-7 flex items-center justify-center font-display text-sm"
                  style={{
                    background: "var(--red)",
                    color: "#fff",
                    boxShadow: "2px 2px 0 var(--red-dim)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  P
                </div>
                <div>
                  <p className="font-display text-sm leading-none" style={{ color: "var(--text-1)" }}>
                    PANEL<span style={{ color: "var(--amber)" }}>SUMMARY</span>
                  </p>
                  {/* Animated chapter indicator */}
                  <motion.p
                    key={pathname}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-label leading-none mt-0.5"
                    style={{ fontSize: "8px" }}
                  >
                    {getChapter(pathname)}
                  </motion.p>
                </div>
              </Link>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-8">
                <Link href="/upload" className={`nav-link ${pathname === "/upload" ? "nav-link--active" : ""}`}>
                  Upload
                </Link>
                <Link href="/upload">
                  <motion.div
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    className="btn-primary py-2 px-5 text-sm"
                  >
                    ＋ Upload Book
                  </motion.div>
                </Link>
              </nav>

              {/* Mobile burger */}
              <button
                className="md:hidden"
                style={{ color: "var(--text-2)" }}
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={20} />
              </button>
            </div>

            {/* Progress line */}
            <motion.div
              className="absolute bottom-0 left-0 h-[1px]"
              style={{ background: "var(--amber)", originX: 0 }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </header>

        <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} pathname={pathname} />

        {/* Page content */}
        <main style={{ paddingTop: "3.5rem" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </body>
    </html>
  );
}
