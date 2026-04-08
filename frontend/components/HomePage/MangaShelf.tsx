"use client";

/**
 * MangaShelf — Book library displayed as a manga shelf
 * =====================================================
 * Books sit on a physical shelf with spine shadows,
 * tilt-on-hover, chapter count badges, and bracket decorations.
 */

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { BookOpen } from "lucide-react";
import { getImageUrl } from "@/lib/api";
import type { BookListItem } from "@/lib/types";

function Reveal({ children, className = "" }: {
  children: React.ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} className={className}>
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

interface MangaShelfProps {
  books: BookListItem[];
}

export function MangaShelf({ books }: MangaShelfProps) {
  if (books.length === 0) return null;

  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <div className="flex items-center gap-4 mb-10">
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, var(--amber), transparent)" }} />
            <span className="chapter-badge" style={{ color: "var(--amber)" }}>YOUR MANGA SHELF</span>
            <div className="h-px flex-1" style={{ background: "linear-gradient(270deg, var(--amber), transparent)" }} />
          </div>

          {/* Shelf container */}
          <div className="relative">
            {/* Books row */}
            <div className="flex gap-5 flex-wrap justify-center pb-4">
              {books.map((book, i) => (
                <Link key={book.id} href={`/books/${book.id}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    whileHover={{ y: -8, rotate: -1 }}
                    className="relative cursor-pointer group"
                    style={{ width: 100 }}
                  >
                    {/* Book cover */}
                    <div
                      className="overflow-hidden transition-shadow"
                      style={{
                        border: "2px solid var(--border)",
                        background: "var(--surface)",
                        boxShadow: "4px 6px 0 rgba(0,0,0,0.5)",
                      }}
                    >
                      {book.cover_image_id
                        ? <img src={getImageUrl(book.cover_image_id) ?? undefined} alt={book.title} className="w-full h-36 object-cover" />
                        : <div className="w-full h-36 flex flex-col items-center justify-center gap-2" style={{ background: "var(--surface-2)" }}>
                            <BookOpen size={22} style={{ color: "var(--text-3)" }} />
                            <span style={{
                              fontFamily: "var(--font-display)",
                              fontSize: 10,
                              color: "var(--text-3)",
                              textAlign: "center",
                              padding: "0 6px",
                              lineHeight: 1.2,
                            }}>
                              {book.title.slice(0, 20)}
                            </span>
                          </div>
                      }
                    </div>

                    {/* Book spine shadow (left edge) */}
                    <div style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: 4,
                      background: "linear-gradient(90deg, rgba(0,0,0,0.3), transparent)",
                      pointerEvents: "none",
                    }} />

                    {/* Title plate */}
                    <div className="mt-2 px-1">
                      <p style={{
                        fontFamily: "var(--font-label)",
                        fontSize: 8,
                        color: "var(--text-2)",
                        lineHeight: 1.3,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}>
                        {book.title}
                      </p>
                      {book.total_chapters > 0 && (
                        <p style={{
                          fontFamily: "var(--font-label)",
                          fontSize: 7,
                          color: "var(--amber)",
                          marginTop: 2,
                          letterSpacing: "0.1em",
                        }}>
                          {book.total_chapters} CH
                        </p>
                      )}
                    </div>
                  </motion.div>
                </Link>
              ))}

              {/* Add new book card */}
              <Link href="/upload">
                <motion.div
                  whileHover={{ y: -8 }}
                  className="flex flex-col items-center justify-center cursor-pointer"
                  style={{
                    width: 100,
                    height: 180,
                    border: "2px dashed var(--border-2)",
                    background: "transparent",
                  }}
                >
                  <span style={{ fontSize: "2rem", color: "var(--text-3)" }}>＋</span>
                  <span style={{ fontFamily: "var(--font-label)", fontSize: 8, color: "var(--text-3)", letterSpacing: "0.15em", marginTop: 4 }}>ADD BOOK</span>
                </motion.div>
              </Link>
            </div>

            {/* Shelf edge — wooden shelf line */}
            <div style={{
              height: 6,
              background: "linear-gradient(180deg, #3D3B54, #2E2C3F)",
              borderRadius: "0 0 2px 2px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              marginTop: -2,
            }} />
            {/* Shelf bracket decorations */}
            <div className="flex justify-between px-4 mt-1">
              <div style={{ width: 20, height: 8, background: "#2E2C3F", borderRadius: "0 0 4px 4px" }} />
              <div style={{ width: 20, height: 8, background: "#2E2C3F", borderRadius: "0 0 4px 4px" }} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default MangaShelf;
