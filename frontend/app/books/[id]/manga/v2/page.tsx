"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";

import {
  getImageUrl,
  getMangaProject,
  listBookMangaProjects,
  listMangaProjectAssets,
  listMangaProjectPages,
  listMangaProjectSlices,
} from "@/lib/api";
import type {
  MangaAssetDoc,
  MangaProject,
  MangaProjectPageDoc,
  MangaSliceDoc,
  RenderedPage,
} from "@/lib/types";
import { MangaPageRenderer } from "@/components/MangaReader";
import type { MangaCharacterAsset } from "@/components/MangaReader";
import { BookSpine } from "@/components/BookSpine";

function rangeLabel(page: MangaProjectPageDoc | null): string {
  if (!page) return "No source range";
  const start = page.source_range?.page_start;
  const end = page.source_range?.page_end;
  return start && end ? `Source pages ${start}–${end}` : "Source-linked page";
}

function getQualitySummary(slice: MangaSliceDoc | null): string {
  if (!slice?.quality_report) return "Quality report pending";
  const passed = slice.quality_report.passed;
  const issues = Array.isArray(slice.quality_report.issues) ? slice.quality_report.issues.length : 0;
  if (passed === true) return issues ? `Passed with ${issues} note(s)` : "Passed deterministic QA";
  if (passed === false) return `Failed QA with ${issues} issue(s)`;
  return "Quality report recorded";
}

// Phase 2.6: surface the fact-coverage data the continuity gate now
// stamps onto the QualityReport. Returns null when the report has not
// recorded coverage so the caller can fall back to its previous label.
function getFactCoverageLabel(slice: MangaSliceDoc | null): string | null {
  const report = slice?.quality_report as Record<string, unknown> | undefined;
  if (!report) return null;
  const grounded = Array.isArray(report.grounded_fact_ids) ? report.grounded_fact_ids.length : 0;
  const missing = Array.isArray(report.missing_fact_ids) ? report.missing_fact_ids.length : 0;
  if (grounded === 0 && missing === 0) return null;
  // "5/7 critical facts covered" reads better than "5 grounded, 2 missing";
  // we compute the denominator from grounded + missing because the gate
  // only puts arc-must-cover facts in `missing` (it never penalises a slice
  // for citing extra facts beyond the must-cover list).
  const total = grounded + missing;
  return `${grounded}/${total} critical facts covered`;
}

// Phase 4.5c: structural narrow from the API's loose ``Record<string, unknown>``
// into the typed ``RenderedPage``. The narrow returns null when the
// payload is missing storyboard panels — the v2 reader treats that as
// 'no page yet' and renders the empty state. Pre-4.5a docs land here
// too: their ``rendered_page`` is the default empty dict, and 4.5c
// removed the v4 fallback path on purpose (one source of truth for
// the renderer; legacy docs will be rerun, not migrated client-side).
function narrowRenderedPage(value: unknown): RenderedPage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { storyboard_page?: { panels?: unknown } };
  if (!candidate.storyboard_page) return null;
  if (!Array.isArray(candidate.storyboard_page.panels)) return null;
  if (candidate.storyboard_page.panels.length === 0) return null;
  return value as RenderedPage;
}

export default function MangaV2ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: bookId } = use(params);
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get("project");

  const [project, setProject] = useState<MangaProject | null>(null);
  const [pages, setPages] = useState<MangaProjectPageDoc[]>([]);
  const [slices, setSlices] = useState<MangaSliceDoc[]>([]);
  const [assets, setAssets] = useState<MangaAssetDoc[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const readerRef = useRef<HTMLElement | null>(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let projectId = projectIdParam;
      if (!projectId) {
        const listed = await listBookMangaProjects(bookId);
        projectId = listed.projects[0]?.id ?? null;
      }
      if (!projectId) {
        setProject(null);
        setPages([]);
        setSlices([]);
        setAssets([]);
        return;
      }

      const [projectRes, pageRes, sliceRes, assetRes] = await Promise.all([
        getMangaProject(projectId),
        listMangaProjectPages(projectId),
        listMangaProjectSlices(projectId),
        listMangaProjectAssets(projectId),
      ]);
      setProject(projectRes.project);
      setPages(pageRes.pages);
      setSlices(sliceRes.slices);
      setAssets(assetRes.assets);
      setPageIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manga v2 project");
    } finally {
      setLoading(false);
    }
  }, [bookId, projectIdParam]);

  useEffect(() => { loadProject(); }, [loadProject]);

  const currentPage = pages[pageIndex] ?? null;
  const currentSlice = useMemo(
    () => slices.find(slice => slice.id === currentPage?.slice_id) ?? slices.at(-1) ?? null,
    [currentPage?.slice_id, slices],
  );
  // Phase 4.5c: ``rendered_page`` is the only contract. Pre-4.5a docs
  // narrow to null and fall through to the empty state below; the
  // ``v4_page`` fallback that lived here through 4.5b is gone.
  const renderedPage = useMemo<RenderedPage | null>(
    () => narrowRenderedPage(currentPage?.rendered_page),
    [currentPage?.rendered_page],
  );
  const characterAssets = useMemo<MangaCharacterAsset[]>(() => assets.map(asset => ({
    character_id: asset.character_id,
    expression: asset.expression,
    asset_type: asset.asset_type,
    image_url: getImageUrl(asset.image_path),
  })), [assets]);
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pages.length - 1;

  const focusReader = useCallback(() => {
    window.requestAnimationFrame(() => {
      readerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, []);

  const goToPage = useCallback((nextIndex: number) => {
    setPageIndex(() => Math.min(Math.max(nextIndex, 0), Math.max(pages.length - 1, 0)));
    focusReader();
  }, [focusReader, pages.length]);

  const currentPageAnchor = `manga-page-${pageIndex + 1}`;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && canPrev) goToPage(pageIndex - 1);
      if (event.key === "ArrowRight" && canNext) goToPage(pageIndex + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canPrev, canNext, goToPage, pageIndex]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "#0F0E17", color: "#F0EEE8" }}>
        <Loader2 className="animate-spin mr-2" size={18} /> Loading manga v2…
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center" style={{ background: "#0F0E17", color: "#F0EEE8" }}>
        <AlertCircle size={42} style={{ color: "#ea1100" }} />
        <h1 className="font-display text-2xl">Could not load manga v2</h1>
        <p style={{ color: "#A8A6C0" }}>{error}</p>
        <Link href={`/books/${bookId}`} className="px-4 py-2 border" style={{ borderColor: "#ffc220", color: "#ffc220" }}>
          Back to book
        </Link>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center" style={{ background: "#0F0E17", color: "#F0EEE8" }}>
        <Sparkles size={42} style={{ color: "#ffc220" }} />
        <h1 className="font-display text-2xl">No v2 manga project yet</h1>
        <p style={{ color: "#A8A6C0", maxWidth: 520 }}>
          Go back to the book page and use the Manga pipeline to create a workspace and generate the first source slice.
        </p>
        <Link href={`/books/${bookId}`} className="px-4 py-2 border" style={{ borderColor: "#ffc220", color: "#ffc220" }}>
          Back to book
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: "#0F0E17", color: "#F0EEE8" }}>
      <header className="sticky top-0 z-20 border-b" style={{ background: "#17161F", borderColor: "#2E2C3F" }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href={`/books/${bookId}`} className="flex items-center gap-2 text-sm" style={{ color: "#ffc220" }}>
            <ArrowLeft size={15} /> Book
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate" style={{ fontSize: "1rem" }}>{project.title || "Manga V2"}</h1>
            <p className="truncate" style={{ color: "#A8A6C0", fontSize: "0.75rem" }}>
              {rangeLabel(currentPage)} · {getQualitySummary(currentSlice)} · {project.fact_count} facts
            </p>
          </div>
          <span className="font-label" style={{ color: "#A8A6C0", fontSize: "0.7rem" }}>
            {pages.length ? pageIndex + 1 : 0} / {pages.length}
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <section
          ref={readerRef}
          id={currentPageAnchor}
          className="scroll-mt-24 flex min-h-[72vh] flex-col items-center gap-4"
        >
          <div
            className="w-full border shadow-2xl"
            style={{
              borderColor: "#2E2C3F",
              background:
                "radial-gradient(circle at 50% 8%, rgba(255,194,32,0.08), transparent 32%), #111019",
              padding: "clamp(0.75rem, 2vw, 1.5rem)",
            }}
          >
            {renderedPage ? (
              <div
                className="mx-auto shadow-[0_26px_70px_rgba(0,0,0,0.42)]"
                style={{
                  aspectRatio: "2 / 3",
                  background: "#F8F3E7",
                  width: "min(calc(100vw - 4rem), calc((100vh - 11rem) * 2 / 3), 760px)",
                  minWidth: "min(100%, 320px)",
                }}
              >
                <MangaPageRenderer page={renderedPage} characterAssets={characterAssets} />
              </div>
            ) : (
              <div className="h-[70vh] flex flex-col items-center justify-center text-center px-6" style={{ color: "#F0EEE8" }}>
                <Sparkles size={40} />
                <h2 className="font-display mt-3 text-xl">No pages generated yet</h2>
                <p className="mt-2 max-w-md">Generate a source slice from the book page. Rendered manga pages will appear here.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => canPrev && goToPage(pageIndex - 1)}
              disabled={!canPrev}
              className="px-4 py-2 border flex items-center gap-2 disabled:opacity-40"
              style={{ borderColor: "#2E2C3F", color: "#F0EEE8" }}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <Link href={`/books/${bookId}`} className="px-4 py-2" style={{ color: "#ffc220" }}>
              Generate another slice
            </Link>
            <button
              type="button"
              onClick={() => canNext && goToPage(pageIndex + 1)}
              disabled={!canNext}
              className="px-4 py-2 border flex items-center gap-2 disabled:opacity-40"
              style={{ borderColor: "#2E2C3F", color: "#F0EEE8" }}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </section>

        <section className="mt-8 border p-4" style={{ borderColor: "#2E2C3F", background: "#17161F" }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display flex items-center gap-2" style={{ color: "#ffc220" }}>
              <BookOpen size={16} /> Manga pages
            </h2>
            <p className="text-sm" style={{ color: "#A8A6C0" }}>
              Jump between rendered pages without losing the reader position.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {pages.map((page, index) => (
              <a
                key={page.id}
                href={`#manga-page-${index + 1}`}
                onClick={(event) => {
                  event.preventDefault();
                  goToPage(index);
                }}
                className="border px-3 py-2 font-label"
                style={{
                  borderColor: index === pageIndex ? "#ffc220" : "#2E2C3F",
                  background: index === pageIndex ? "#ffc220" : "transparent",
                  color: index === pageIndex ? "#1f1f29" : "#F0EEE8",
                  fontSize: "0.68rem",
                }}
                aria-current={index === pageIndex ? "page" : undefined}
              >
                Page {index + 1}
              </a>
            ))}
          </div>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <section className="border p-4" style={{ borderColor: "#2E2C3F", background: "#17161F" }}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display flex items-center gap-2" style={{ color: "#ffc220" }}>
                <ImageIcon size={16} /> Character assets
              </h2>
              {project && (
                <Link
                  href={`/books/${bookId}/manga/v2/characters?project=${project.id}`}
                  className="font-label"
                  style={{ color: "#ffc220", fontSize: "0.65rem" }}
                >
                  Open library →
                </Link>
              )}
            </div>
            {assets.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: "#A8A6C0" }}>
                No assets yet. Enable character asset generation in Advanced slice options on the book page.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {assets.map(asset => {
                  const src = getImageUrl(asset.image_path);
                  return (
                    <article key={asset.id} className="border p-2" style={{ borderColor: "#2E2C3F" }}>
                      {src ? (
                        <img src={src} alt={`${asset.character_id} ${asset.expression}`} className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="aspect-square flex items-center justify-center text-center px-2" style={{ background: "#0F0E17", color: "#A8A6C0", fontSize: "0.7rem" }}>
                          Prompt only
                        </div>
                      )}
                      <p className="mt-2 font-label truncate" style={{ fontSize: "0.65rem", color: "#F0EEE8" }}>{asset.character_id}</p>
                      <p className="font-label truncate" style={{ fontSize: "0.6rem", color: "#A8A6C0" }}>{asset.expression || asset.asset_type}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="border p-4" style={{ borderColor: "#2E2C3F", background: "#17161F" }}>
            <h2 className="font-display" style={{ color: "#ffc220" }}>Generated slices</h2>
            <div className="mt-3 flex flex-col gap-2">
              {slices.map(slice => (
                <div key={slice.id} className="border p-3" style={{ borderColor: "#2E2C3F" }}>
                  <p className="font-label" style={{ color: "#F0EEE8", fontSize: "0.68rem" }}>Slice {slice.slice_index + 1} · {slice.slice_role}</p>
                  <p className="mt-1" style={{ color: "#A8A6C0", fontSize: "0.72rem" }}>{getQualitySummary(slice)}</p>
                  {getFactCoverageLabel(slice) && (
                    <p className="mt-1 font-label" style={{ color: "#ffc220", fontSize: "0.65rem" }}>
                      {getFactCoverageLabel(slice)}
                    </p>
                  )}
                </div>
              ))}
              {slices.length === 0 && <p style={{ color: "#A8A6C0", fontSize: "0.8rem" }}>No slices generated yet.</p>}
            </div>
          </section>
        </div>

        <section className="mt-6">
          <BookSpine project={project} />
        </section>
      </div>
    </main>
  );
}
