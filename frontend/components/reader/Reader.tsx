"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  getBook,
  getEdition,
  isActive,
  listEditions,
  loadPage,
  resumeEdition,
  type EditionDetail,
  type EditionPage,
} from "@/lib/api";
import { useMedia, usePoll, useReducedMotion } from "@/lib/hooks";
import { isReachedPage, readPreference, savePosition, savePreference } from "@/lib/position";
import { plainReason, plural, providerStopLines, stageLine, voiceLabel } from "@/lib/words";
import { SvgPage } from "@/components/SvgPage";
import { Sheet } from "@/components/Paper";
import { ArrowLeft, ChevronLeft, ChevronRight, PageIcon, PanelsIcon, SourceIcon, ZoomReset } from "@/components/Icons";
import { PAGE, maxZoom, overflows, panelCam, restScale, scrollStep, toPage, useCameraRig, zoomCam, type PageView, type Size } from "./camera";
import { PagePicker } from "./PagePicker";
import { groupPages, pageLabel, ticksAreButtons } from "./picker";
import { SourceDrawer } from "./SourceDrawer";
import { transcript } from "./transcript";
import { useStageGestures } from "./gestures";
import styles from "./reader.module.css";

type Mode = "page" | "panel";
type Zoom = { z: number; cx: number; cy: number };
/** Zoom 1 is the resting view; cy 0 asks for the top of the page, which centres a page that fits. */
const REST: Zoom = { z: 1, cx: PAGE.w / 2, cy: 0 };
/** Width the picker button takes in the bottom bar, with its gap. */
const PICKER_BTN_W = 140;

interface Pos {
  page: number;
  /** Panel index in reading order; -1 = the last panel (entering a page backwards). */
  panel: number;
}

export function Reader({ bookId }: { bookId: string }) {
  const params = useSearchParams();
  const debug = params.get("debug") === "1";
  const urlPage = Math.max(1, Math.floor(Number(params.get("page"))) || 1);

  const [editionId, setEditionId] = useState<string | null>(params.get("edition"));
  const [edition, setEdition] = useState<EditionDetail | null>(null);
  const [bookTitle, setBookTitle] = useState<string>("");
  const [fatal, setFatal] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos>({ page: urlPage, panel: 0 });
  const [loaded, setLoaded] = useState<{ n: number; page: EditionPage | null; missing?: boolean; error?: string } | null>(null);
  const [mode, setMode] = useState<Mode>("page");
  const [view, setView] = useState<PageView>("read");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [midW, setMidW] = useState(0);
  const [zoom, setZoomState] = useState<Zoom>(REST);
  // gestures fire faster than React renders: the latest zoom lives in a ref too
  const zoomRef = useRef<Zoom>(REST);
  const setZoom = useCallback((z: Zoom) => {
    zoomRef.current = z;
    setZoomState(z);
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [stage, setStage] = useState<Size | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const drawerHeadingRef = useRef<HTMLHeadingElement>(null);
  const sourceButtonRef = useRef<HTMLButtonElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const animateNext = useRef(false);
  const rig = useCameraRig();
  const reduced = useReducedMotion();
  const wide = useMedia("(min-width: 1024px)", true);

  // After a client navigation Next.js focuses the first element, the "Skip to content" link. Move that focus to the main region. A direct load is left alone, so Tab from the top still reaches the skip link.
  const mainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let tabbed = false; // the viewer pressed Tab on this page: the skip link is theirs
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Tab") tabbed = true;
    };
    window.addEventListener("keydown", onKey, true);
    const focusMain = () => {
      if (tabbed) return;
      const a = document.activeElement;
      if (a instanceof HTMLElement && a.classList.contains("skip-link")) mainRef.current?.focus({ preventScroll: true });
    };
    const t = window.setTimeout(focusMain, 0);
    const f = window.requestAnimationFrame(() => window.requestAnimationFrame(focusMain));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
      window.cancelAnimationFrame(f);
    };
  }, []);

  // ---------------------------------------------------------------- data

  useEffect(() => {
    getBook(bookId)
      .then((b) => setBookTitle(b.title))
      .catch(() => undefined);
  }, [bookId]);

  useEffect(() => {
    if (editionId) return;
    listEditions(bookId)
      .then((list) => {
        if (list[0]) setEditionId(list[0].id);
        else setFatal("This book has no manga yet. Generate it from the book's page.");
      })
      .catch((e) => setFatal(e instanceof ApiError && e.status === 404 ? "This book is not on your shelf." : "The manga could not be loaded."));
  }, [bookId, editionId]);

  const loadEdition = useCallback(async () => {
    if (!editionId) return;
    try {
      setEdition(await getEdition(editionId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setFatal("This edition does not exist.");
      else throw e;
    }
  }, [editionId]);

  useEffect(() => {
    loadEdition().catch(() => setFatal("The manga could not be loaded. Check that the PanelSummary server is running."));
  }, [loadEdition]);

  const total = edition ? edition.page_total || edition.pages.length : 0;
  const summary = edition?.pages.find((p) => p.page_number === pos.page);
  const current = loaded && loaded.n === pos.page ? loaded : null;
  const page = current?.page ?? null;
  const accepted = page?.status === "accepted" && !!page.svg;

  // keep polling while anything could still change under the reader
  const waiting = !!edition && (isActive(edition.status) || (!!summary && summary.status !== "accepted" && summary.status !== "failed"));
  usePoll(loadEdition, 3000, waiting);

  // clamp an out-of-range ?page= once the page count is known
  useEffect(() => {
    if (total > 0 && pos.page > total) setPos({ page: total, panel: 0 });
  }, [total, pos.page]);

  // the current page; fetched again whenever its status changes
  useEffect(() => {
    if (!editionId) return;
    let live = true;
    const n = pos.page;
    loadPage(editionId, n)
      .then((p) => live && setLoaded({ n, page: p }))
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) setLoaded({ n, page: null, missing: true });
        else setLoaded({ n, page: null, error: e instanceof Error ? e.message : "This page could not be loaded." });
      });
    return () => {
      live = false;
    };
  }, [editionId, pos.page, summary?.status]);

  // neighbours, so turning a page is instant
  useEffect(() => {
    if (!editionId || !edition) return;
    for (const n of [pos.page + 1, pos.page - 1, pos.page + 2]) {
      const s = edition.pages.find((p) => p.page_number === n);
      if (s?.status === "accepted") loadPage(editionId, n).catch(() => undefined);
    }
  }, [editionId, edition, pos.page]);

  // ?page= in the address bar, and the reading position for "Continue"
  useEffect(() => {
    if (!editionId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("edition", editionId);
    url.searchParams.set("page", String(pos.page));
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [editionId, pos.page]);

  // The reading position for "Continue": only a page the reader really shows as the current page (loaded, drawn or marked as failed, inside the book).
  // Not the number in the address bar, not a page that is only being fetched ahead.
  const shown = loaded && loaded.n === pos.page && !loaded.missing && !loaded.error ? loaded.page?.status : null;
  useEffect(() => {
    if (editionId && isReachedPage(pos.page, total, shown)) savePosition(editionId, pos.page);
  }, [editionId, pos.page, total, shown]);

  // back/forward to an entry with another ?page= while the reader stays mounted
  useEffect(() => {
    const onPop = () => {
      const n = Math.max(1, Math.floor(Number(new URL(window.location.href).searchParams.get("page"))) || 1);
      setPos((p) => (p.page === n ? p : { page: n, panel: 0 }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = bookTitle ? `${bookTitle}, page ${pos.page} | PanelSummary` : "Reader | PanelSummary";
  }, [bookTitle, pos.page]);

  // ---------------------------------------------------------------- mode

  useEffect(() => {
    const saved = readPreference("reader-mode");
    setMode(saved === "page" || saved === "panel" ? saved : window.innerWidth < 700 ? "panel" : "page");
    setView(readPreference("reader-view") === "whole" ? "whole" : "read");
  }, []);

  const chooseView = (v: PageView) => {
    animateNext.current = true;
    setView(v);
    setZoom(REST);
    savePreference("reader-view", v);
  };

  const chooseMode = (m: Mode) => {
    animateNext.current = true;
    setMode(m);
    setZoom(REST);
    savePreference("reader-mode", m);
  };

  // ---------------------------------------------------------------- camera

  const panels = useMemo(() => (page && accepted ? [...page.panels].sort((a, b) => a.order - b.order) : []), [page, accepted]);
  const panelIndex = panels.length ? (pos.panel < 0 ? panels.length - 1 : Math.min(pos.panel, panels.length - 1)) : 0;
  const activePanel = mode === "panel" && panels.length ? panels[panelIndex] : null;
  const pad = stage ? (stage.w < 600 ? 10 : 28) : 28;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setStage((s) => (s && Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fatal]);

  /** Scale at zoom 1: the page fills the width up to a readable size, or fits whole. */
  const base = useMemo(() => (stage ? restScale(stage, pad, view) : 1), [stage, pad, view]);
  /** The page is bigger than the stage at rest, so it scrolls up and down. */
  const scrolls = !!stage && overflows(stage, restScale(stage, pad, "read")) && restScale(stage, pad, "read") > restScale(stage, pad, "whole") + 0.001;

  useLayoutEffect(() => {
    const el = midRef.current;
    if (!el) return;
    const measure = () => setMidW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [edition, chrome, fatal]);

  const targetCam = useMemo(() => {
    if (!stage) return null;
    if (activePanel) return panelCam(activePanel.bbox, stage, pad);
    return zoomCam(stage, pad, zoom.z, zoom.cx, zoom.cy, base).cam;
  }, [stage, activePanel, pad, zoom, base]);

  useLayoutEffect(() => {
    if (!targetCam) return;
    rig.setCam(targetCam, animateNext.current && !reduced);
    animateNext.current = false;
  }, [targetCam, reduced, rig, page]);

  // ---------------------------------------------------------------- navigation

  const goToPage = useCallback(
    (n: number, panel = 0) => {
      if (n < 1 || (total > 0 && n > total)) return;
      animateNext.current = false;
      setZoom(REST);
      setPos({ page: n, panel });
    },
    [total, setZoom],
  );

  const next = useCallback(() => {
    if (mode === "panel" && panels.length && panelIndex < panels.length - 1) {
      animateNext.current = true;
      setPos({ page: pos.page, panel: panelIndex + 1 });
      return;
    }
    goToPage(pos.page + 1, 0);
  }, [mode, panels.length, panelIndex, pos.page, goToPage]);

  const prev = useCallback(() => {
    if (mode === "panel" && panels.length && panelIndex > 0) {
      animateNext.current = true;
      setPos({ page: pos.page, panel: panelIndex - 1 });
      return;
    }
    goToPage(pos.page - 1, mode === "panel" ? -1 : 0);
  }, [mode, panels.length, panelIndex, pos.page, goToPage]);

  const zoomed = mode === "page" && accepted && zoom.z > 1.001;
  const panable = mode === "page" && accepted && !!stage && overflows(stage, base * zoom.z);

  /** Zoom to `z` keeping the page point under stage pixel (px, py) where it is. */
  const setZoomAt = useCallback(
    (z: number, px: number, py: number, animate: boolean) => {
      if (!stage) return;
      const cur = zoomRef.current;
      const nz = Math.min(maxZoom(stage, pad, base), Math.max(1, z));
      const point = toPage(zoomCam(stage, pad, cur.z, cur.cx, cur.cy, base).cam, stage, px, py);
      const s = base * nz;
      const clamped = zoomCam(stage, pad, nz, point.x + (stage.w / 2 - px) / s, point.y + (stage.h / 2 - py) / s, base);
      animateNext.current = animate;
      setZoom({ z: nz, cx: clamped.cx, cy: clamped.cy });
    },
    [stage, pad, base, setZoom],
  );

  const resetZoom = useCallback(() => {
    animateNext.current = true;
    setZoom(REST);
  }, [setZoom]);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      if (!stage) return;
      const zm = zoomRef.current;
      const s = base * zm.z;
      // start from where the camera really is: the stored centre may lie outside the clamp (zoom 1 asks for the top)
      const here = zoomCam(stage, pad, zm.z, zm.cx, zm.cy, base);
      const c = zoomCam(stage, pad, zm.z, here.cx - dx / s, here.cy - dy / s, base);
      animateNext.current = false;
      setZoom({ z: zm.z, cx: c.cx, cy: c.cy });
    },
    [stage, pad, base, setZoom],
  );

  /** Scroll the page by a part of the screen; true when it was already at that end. */
  const scrollPage = useCallback(
    (dir: 1 | -1, fraction: number) => {
      if (!stage) return true;
      const r = scrollStep(stage, pad, base, zoomRef.current, dir, fraction);
      animateNext.current = true;
      if (!r.atEdge) setZoom(r.zoom);
      return r.atEdge;
    },
    [stage, pad, base, setZoom],
  );

  useStageGestures(stageRef, {
    mode,
    zoomed,
    panable,
    // taps and swipes turn pages whatever the page state; zoom needs a drawn page
    enabled: !!current,
    onTapZone: (zone) => {
      if (zone === "left") prev();
      else if (zone === "right") next();
      else setChrome((c) => !c);
    },
    onDoubleTap: (x, y) => {
      if (!accepted) return;
      if (zoomed) resetZoom();
      else setZoomAt(2.5, x, y, true);
    },
    onSwipe: (dir) => (dir === "next" ? next() : prev()),
    onPan: panBy,
    onZoom: (factor, x, y) => {
      if (accepted) setZoomAt(zoomRef.current.z * factor, x, y, false);
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (pickerOpen && e.key !== "Escape") return;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp":
          if (!panable) break;
          e.preventDefault();
          scrollPage(e.key === "ArrowDown" ? 1 : -1, 0.25);
          break;
        case " ":
          // a focused button keeps its own Space
          if (t && /^(BUTTON|A)$/.test(t.tagName)) break;
          e.preventDefault();
          if (e.shiftKey) {
            if (panable ? scrollPage(-1, 0.85) : true) prev();
          } else if (panable ? scrollPage(1, 0.85) : true) next();
          break;
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          prev();
          break;
        case "Home":
          e.preventDefault();
          goToPage(1);
          break;
        case "End":
          e.preventDefault();
          if (total) goToPage(total, mode === "panel" ? -1 : 0);
          break;
        case "+":
        case "=":
          if (mode === "page" && accepted && stage) setZoomAt(zoomRef.current.z * 1.5, stage.w / 2, stage.h / 2, true);
          break;
        case "-":
          if (mode === "page" && accepted && stage) setZoomAt(zoomRef.current.z / 1.5, stage.w / 2, stage.h / 2, true);
          break;
        case "0":
          if (mode === "page") resetZoom();
          break;
        case "Escape":
          if (pickerOpen) {
            setPickerOpen(false);
            pickerButtonRef.current?.focus();
          } else if (drawerOpen) {
            setDrawerOpen(false);
            sourceButtonRef.current?.focus();
          } else if (zoomed) resetZoom();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, goToPage, total, mode, stage, accepted, zoomed, panable, scrollPage, setZoomAt, resetZoom, drawerOpen, pickerOpen]);

  // ---------------------------------------------------------------- drawer

  const toggleDrawer = () => {
    setDrawerOpen((open) => {
      if (open) requestAnimationFrame(() => sourceButtonRef.current?.focus());
      else requestAnimationFrame(() => drawerHeadingRef.current?.focus());
      return !open;
    });
  };

  const retry = async () => {
    if (!editionId) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await resumeEdition(editionId);
      await loadEdition();
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setRetrying(false);
    }
  };

  // ---------------------------------------------------------------- render

  const bookHref = `/books/${bookId}`;
  const readerHref = editionId ? `/books/${bookId}/read?edition=${editionId}&page=${pos.page}` : `/books/${bookId}/read`;
  const atStart = pos.page <= 1 && (mode !== "panel" || panelIndex === 0 || !panels.length);
  const atEnd = total > 0 && pos.page >= total && (mode !== "panel" || !panels.length || panelIndex >= panels.length - 1);

  if (fatal) {
    return (
      <div className={styles.reader}>
        <div className={styles.fatal}>
          <p>{fatal}</p>
          <Link href={bookHref} className="btn btn-ink">
            Back to the book
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.reader} ${drawerOpen && wide ? styles.withDrawer : ""}`}>
      {chrome ? (
        <header className={styles.topbar}>
          <Link href={bookHref} className={styles.backLink} aria-label={`Back to ${bookTitle || "the book"}`}>
            <ArrowLeft />
            <span className={styles.backTitle}>{bookTitle}</span>
          </Link>
          <p className={styles.counter}>
            {total ? (
              <>
                Page {pos.page} <span className={styles.counterOf}>of {total}</span>
                {activePanel ? <span className={styles.counterPanel}>Panel {panelIndex + 1} of {panels.length}</span> : null}
              </>
            ) : (
              " "
            )}
          </p>
          <div className={styles.tools}>
            <div className={styles.modes} role="group" aria-label="Reading mode">
              <button type="button" className={styles.modeBtn} aria-pressed={mode === "page"} onClick={() => chooseMode("page")}>
                <PageIcon />
                <span className={styles.modeLabel}>Page</span>
              </button>
              <button type="button" className={styles.modeBtn} aria-pressed={mode === "panel"} onClick={() => chooseMode("panel")}>
                <PanelsIcon />
                <span className={styles.modeLabel}>Panels</span>
              </button>
            </div>
            <button
              ref={sourceButtonRef}
              type="button"
              className={styles.sourceBtn}
              aria-expanded={drawerOpen}
              aria-controls="source-drawer"
              onClick={toggleDrawer}
            >
              <SourceIcon />
              <span className={styles.modeLabel}>Sources</span>
            </button>
          </div>
        </header>
      ) : null}

      <div className={styles.body} id="main" role="main" ref={mainRef} tabIndex={-1} style={{ outline: "none" }}>
        <div
          ref={stageRef}
          className={`${styles.stage} ${accepted ? styles.stageInteractive : ""} ${zoomed ? styles.stageZoomed : ""}`}
          role="group"
          aria-roledescription="manga page"
          aria-label={total ? `Page ${pos.page} of ${total}` : "Manga page"}
        >
          {!edition || !current ? (
            <div className={styles.center}>
              <div className={styles.sheetFit}>
                <div className={styles.skeleton} aria-label="Loading page" role="img" />
              </div>
            </div>
          ) : accepted && page ? (
            <>
              <SvgPage key={`${editionId}:${page.page_number}`} svg={page.svg!} className={styles.art} onReady={rig.register} />
              {activePanel ? (
                <svg ref={rig.register} className={styles.mask} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
                  <path
                    fillRule="evenodd"
                    d={`M-4000 -4000H5000V5500H-4000Z M${activePanel.polygon.map((p) => `${p.x} ${p.y}`).join(" L")}Z`}
                  />
                </svg>
              ) : null}
              <Transcript page={page} />
            </>
          ) : (
            <PageState
              bookId={bookId}
              pageNumber={pos.page}
              total={total}
              edition={edition}
              page={page}
              missing={!!current.missing}
              error={current.error}
              retrying={retrying}
              retryError={retryError}
              onRetry={retry}
            />
          )}

          {mode === "page" && accepted && (zoomed || scrolls) ? (
            <div className={styles.viewTools}>
              {zoomed ? (
                <button type="button" className={styles.fitBtn} onClick={resetZoom}>
                  <ZoomReset />
                  {view === "whole" ? "Fit page" : "Reset zoom"}
                </button>
              ) : null}
              {scrolls ? (
                <button type="button" className={styles.fitBtn} aria-pressed={view === "whole"} onClick={() => chooseView(view === "whole" ? "read" : "whole")}>
                  {view === "whole" ? "Read size" : "Whole page"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {drawerOpen ? (
          <>
            {!wide ? <div className={styles.scrim} onClick={toggleDrawer} aria-hidden="true" /> : null}
            <aside id="source-drawer" className={styles.drawer} aria-label={`Sources for page ${pos.page}`}>
              <SourceDrawer
                ref={drawerHeadingRef}
                page={page}
                pageNumber={pos.page}
                bookId={bookId}
                from={readerHref}
                activePanel={activePanel?.id ?? null}
                debug={debug}
                onClose={toggleDrawer}
              />
            </aside>
          </>
        ) : null}
      </div>

      {chrome ? (
        <footer className={styles.bottombar}>
          <button type="button" className={styles.navBtn} onClick={prev} disabled={atStart} aria-label={mode === "panel" ? "Previous panel" : "Previous page"}>
            <ChevronLeft />
          </button>
          {edition && total ? (
            <div className={styles.middle} ref={midRef}>
              {ticksAreButtons(midW - PICKER_BTN_W, total) ? (
                <ol className={styles.ticks} aria-label="Pages">
                  {Array.from({ length: total }, (_, i) => {
                    const n = i + 1;
                    const st = edition.pages.find((p) => p.page_number === n)?.status ?? "pending";
                    const label = pageLabel(n, st);
                    return (
                      <li key={n}>
                        <button
                          type="button"
                          className={`${styles.tick} ${styles[`tick_${st}`]}`}
                          aria-current={n === pos.page ? "page" : undefined}
                          aria-label={label}
                          title={label}
                          onClick={() => goToPage(n)}
                        />
                      </li>
                    );
                  })}
                </ol>
              ) : (
                // too many pages for 44 px buttons: a picture of the book; the picker is the control
                <div className={styles.strip} aria-hidden="true">
                  {Array.from({ length: total }, (_, i) => {
                    const n = i + 1;
                    const st = edition.pages.find((p) => p.page_number === n)?.status ?? "pending";
                    return <span key={n} className={`${styles.seg} ${styles[`tick_${st}`]}`} data-current={n === pos.page ? "true" : undefined} />;
                  })}
                </div>
              )}
              <button
                ref={pickerButtonRef}
                type="button"
                className={styles.pickerBtn}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                aria-label={`All pages. Page ${pos.page} of ${total}`}
                onClick={() => setPickerOpen((o) => !o)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <rect x="4" y="4" width="6" height="6" />
                  <rect x="14" y="4" width="6" height="6" />
                  <rect x="4" y="14" width="6" height="6" />
                  <rect x="14" y="14" width="6" height="6" />
                </svg>
                <span className={styles.pickerWide}>All pages</span>
                <span className={styles.pickerNarrow}>
                  Page {pos.page} <span className={styles.counterOf}>of {total}</span>
                </span>
              </button>
            </div>
          ) : (
            <span />
          )}
          <button type="button" className={styles.navBtn} onClick={next} disabled={atEnd} aria-label={mode === "panel" ? "Next panel" : "Next page"}>
            <ChevronRight />
          </button>
        </footer>
      ) : null}

      {pickerOpen && edition && total ? (
        <PagePicker
          groups={groupPages(edition.pages, total, edition.book?.sections)}
          current={pos.page}
          total={total}
          onSelect={(n) => {
            setPickerOpen(false);
            goToPage(n);
            pickerButtonRef.current?.focus();
          }}
          onClose={() => {
            setPickerOpen(false);
            pickerButtonRef.current?.focus();
          }}
        />
      ) : null}

      <p className="sr-only" aria-live="polite">
        {total ? `Page ${pos.page} of ${total}` : ""}
      </p>
      {debug && page?.svg_hash ? (
        <p className={styles.debugBadge}>
          {page.renderer_version} {page.svg_hash.slice(0, 12)}
        </p>
      ) : null}
    </div>
  );
}

/** The page's lettering in reading order: the text alternative for the drawn page. */
function Transcript({ page }: { page: EditionPage }) {
  const panels = transcript(page);
  return (
    <section className="sr-only" aria-label={`Text of page ${page.page_number}`}>
      <ol>
        {panels.map(({ panel, number, texts }) => (
          <li key={panel.id}>
            Panel {number}.
            {texts.map((t) => (
              <p key={t.index}>
                {voiceLabel(t.kind, t.speaker, page.speakers)}: {t.text}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

function PageState({
  bookId,
  pageNumber,
  total,
  edition,
  page,
  missing,
  error,
  retrying,
  retryError,
  onRetry,
}: {
  pageNumber: number;
  total: number;
  edition: EditionDetail;
  page: EditionPage | null;
  missing: boolean;
  bookId: string;
  error?: string;
  retrying: boolean;
  retryError: string | null;
  onRetry: () => void;
}) {
  const active = isActive(edition.status);
  const canResume = !active && edition.status !== "complete";
  const failedCount = edition.pages.filter((p) => p.status === "failed").length;
  let tone: "pencil" | "redpen" = "pencil";
  let title: string;
  let body: React.ReactNode = null;
  let action: React.ReactNode = null;

  if (error) {
    tone = "redpen";
    title = "This page could not be loaded";
    body = (
      <>
        <p>{error}</p>
        <p>Check that the server is running, then reload this page.</p>
      </>
    );
    action = (
      <button type="button" className="btn" onClick={() => window.location.reload()}>
        Reload
      </button>
    );
  } else if (missing || !page) {
    title = total ? `Page ${pageNumber} is not planned` : "The pages are still being planned";
    body = <p>{active ? `${stageLine(edition.status, edition.pages, total)}. This view refreshes on its own.` : "This edition has no such page."}</p>;
  } else if (page.status === "failed") {
    tone = "redpen";
    title = "This page could not be drawn";
    body = (
      <>
        <p className={styles.reason}>{plainReason(page.error?.message).plain}</p>
        {plainReason(page.error?.message).detail ? <p className={styles.detail}>Technical detail: {plainReason(page.error?.message).detail}</p> : null}
        {failedCount > 1 ? <p>{plural(failedCount, "page")} in this book could not be drawn.</p> : null}
        {active ? (
          <p>
            {edition.status === "drawing"
              ? "The rest of the book is still being drawn. You can retry this page when it finishes."
              : "Drawing is starting again, and this page will be tried again."}
          </p>
        ) : null}
      </>
    );
    if (canResume) {
      action = (
        <button type="button" className="btn btn-redpen" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying" : "Retry failed pages"}
        </button>
      );
    }
  } else {
    title = page.status === "drawing" ? `Page ${pageNumber} is being drawn` : `Page ${pageNumber} is waiting to be drawn`;
    const stopLines = !active && edition.status === "failed" && edition.provider_stop ? providerStopLines(edition.provider_stop) : null;
    body = active ? (
      <p>It will appear here as soon as it is ready. This view refreshes on its own.</p>
    ) : stopLines ? (
      <>
        <p className={styles.reason}>{stopLines.title}. Nothing was sent for this page.</p>
        <p>{stopLines.next}</p>
        {stopLines.detail ? <p className={styles.detail}>Technical detail: {stopLines.detail}</p> : null}
      </>
    ) : (
      <p>Drawing stopped before this page.</p>
    );
    if (canResume) {
      action = (
        <button type="button" className="btn" onClick={onRetry} disabled={retrying}>
          {retrying ? "Resuming" : "Resume drawing"}
        </button>
      );
    }
  }

  return (
    <div className={styles.center}>
      <div className={styles.sheetFit}>
        <Sheet tone={tone} busy={page?.status === "drawing" || (active && page?.status === "pending")} className={styles.stateSheet}>
          <div className={styles.stateText} role="status">
            <p className={styles.stateTitle}>{title}</p>
            {body}
            {action}
            {retryError ? <p className={styles.reason} role="alert">{`Could not start again. ${retryError}`}</p> : null}
            <Link href={`/books/${bookId}`} className={styles.stateBack}>
              Back to the book
            </Link>
          </div>
        </Sheet>
      </div>
    </div>
  );
}
