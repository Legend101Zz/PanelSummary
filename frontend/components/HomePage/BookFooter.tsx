"use client";

/**
 * BookFooter — Open book closing illustration
 * =============================================
 * A CSS-only open book with epilogue text, mini manga panel,
 * fanned page edges, and a spine shadow. Pure vibes.
 */

export function BookFooter() {
  return (
    <footer className="relative overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* The open book illustration */}
      <div className="relative max-w-3xl mx-auto px-4 pt-8 pb-2">
        {/* Book spread — two pages */}
        <div className="relative flex" style={{ minHeight: 160 }}>
          {/* Left page */}
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              background: "#F2E8D5",
              borderRadius: "4px 0 0 4px",
              transformOrigin: "right center",
              transform: "perspective(800px) rotateY(5deg)",
              boxShadow: "inset -8px 0 20px rgba(0,0,0,0.08)",
            }}
          >
            {/* Page texture lines */}
            <div className="absolute inset-0 opacity-[0.04]" style={{
              backgroundImage: "repeating-linear-gradient(0deg, #1A1825 0px, transparent 1px, transparent 24px)",
            }} />
            <div className="relative z-10 p-5 flex flex-col justify-between h-full">
              <div>
                <p style={{ fontFamily: "var(--font-label)", fontSize: 7, letterSpacing: "0.2em", color: "rgba(26,24,37,0.25)", marginBottom: 8 }}>
                  EPILOGUE
                </p>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(26,24,37,0.5)", lineHeight: 1.8, fontStyle: "italic" }}>
                  Every book you didn&apos;t finish has a story that wanted to be told.
                  We just changed how it speaks.
                </p>
              </div>
              <p style={{ fontFamily: "var(--font-label)", fontSize: 7, color: "rgba(26,24,37,0.2)", textAlign: "right" }}>
                pg. ∞
              </p>
            </div>
          </div>

          {/* Spine */}
          <div style={{
            width: 6,
            background: "linear-gradient(180deg, #8B7355, #6B5740, #8B7355)",
            boxShadow: "0 0 8px rgba(0,0,0,0.3)",
            zIndex: 2,
          }} />

          {/* Right page */}
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              background: "#F2E8D5",
              borderRadius: "0 4px 4px 0",
              transformOrigin: "left center",
              transform: "perspective(800px) rotateY(-5deg)",
              boxShadow: "inset 8px 0 20px rgba(0,0,0,0.08)",
            }}
          >
            <div className="absolute inset-0 opacity-[0.04]" style={{
              backgroundImage: "repeating-linear-gradient(0deg, #1A1825 0px, transparent 1px, transparent 24px)",
            }} />
            <div className="relative z-10 p-5 flex flex-col items-center justify-center h-full text-center">
              {/* Mini manga panel */}
              <div style={{
                width: 60,
                height: 50,
                border: "2px solid rgba(26,24,37,0.15)",
                marginBottom: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gridTemplateRows: "1fr 1fr",
                gap: 1,
                background: "#fff",
              }}>
                <div style={{ background: "rgba(26,24,37,0.05)" }} />
                <div style={{ background: "rgba(232,25,26,0.08)" }} />
                <div style={{ gridColumn: "1/3", background: "rgba(245,166,35,0.06)" }} />
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "rgba(26,24,37,0.7)" }}>
                THE END
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 9, color: "rgba(26,24,37,0.3)", marginTop: 4, fontStyle: "italic" }}>
                ...is just the beginning.
              </p>
            </div>
          </div>
        </div>

        {/* Fanned pages beneath (stacked page edges) */}
        <div className="relative flex justify-center" style={{ marginTop: -2, zIndex: -1 }}>
          {[...Array(5)].map((_, i) => (
            <div
              key={`page-edge-${i}`}
              style={{
                position: "absolute",
                top: i * 2,
                left: `${4 + i * 0.5}%`,
                right: `${4 + i * 0.5}%`,
                height: 3,
                background: `rgba(242,232,213,${0.6 - i * 0.1})`,
                borderRadius: "0 0 2px 2px",
              }}
            />
          ))}
        </div>

        {/* Book shadow */}
        <div style={{
          height: 16,
          background: "radial-gradient(ellipse 70% 100% at 50% 0%, rgba(0,0,0,0.15) 0%, transparent 100%)",
          marginTop: 10,
        }} />
      </div>

      {/* Copyright line */}
      <div className="py-6 text-center">
        <p style={{
          fontFamily: "var(--font-label)",
          fontSize: 8,
          color: "var(--text-3)",
          letterSpacing: "0.2em",
          opacity: 0.4,
        }}>
          PANELSUMMARY — EVERY BOOK DESERVES TO BE READ
        </p>
      </div>
    </footer>
  );
}

export default BookFooter;
