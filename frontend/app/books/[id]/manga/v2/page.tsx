"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";

import {
  getImageUrl,
  getMangaProject,
  listBookMangaProjects,
  listMangaProjectAssets,
  listMangaProjectPages,
  listMangaProjectSlices,
} from "@/lib/api";
import type { MangaAssetDoc, MangaProject, MangaProjectPageDoc, MangaSliceDoc } from "@/lib/types";
import { V4PageRenderer } from "@/components/V4Engine";
import type { V4CharacterAsset, V4Page } from "@/components/V4Engine";

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
  const v4Page = currentPage?.v4_page as unknown as V4Page | undefined;
  const characterAssets = useMemo<V4CharacterAsset[]>(() => assets.map(asset => ({
    character_id: asset.character_id,
    expression: asset.expression,
    asset_type: asset.asset_type,
    image_url: getImageUrl(asset.image_path),
  })), [assets]);
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pages.length - 1;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && canPrev) setPageIndex(index => index - 1);
      if (event.key === "ArrowRight" && canNext) setPageIndex(index => index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canPrev, canNext]);

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
          Go back to the book page and use the Manga V2 Lab to create a project and generate the first source slice.
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

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <section className="min-h-[70vh] flex flex-col gap-4">
          <div className="flex-1 border shadow-2xl" style={{ borderColor: "#2E2C3F", background: "#F8F3E7" }}>
            {v4Page ? (
              <div className="mx-auto h-[78vh] max-h-[920px] aspect-[2/3]">
                <V4PageRenderer page={v4Page} characterAssets={characterAssets} />
              </div>
            ) : (
              <div className="h-[70vh] flex flex-col items-center justify-center text-center px-6" style={{ color: "#2A2A2A" }}>
                <Sparkles size={40} />
                <h2 className="font-display mt-3 text-xl">No pages generated yet</h2>
                <p className="mt-2 max-w-md">Generate a source slice from the book page. The new backend will persist V4 pages here.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => canPrev && setPageIndex(index => index - 1)}
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
              onClick={() => canNext && setPageIndex(index => index + 1)}
              disabled={!canNext}
              className="px-4 py-2 border flex items-center gap-2 disabled:opacity-40"
              style={{ borderColor: "#2E2C3F", color: "#F0EEE8" }}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
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
                No assets yet. Enable character asset generation in the Manga V2 Lab.
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
                </div>
              ))}
              {slices.length === 0 && <p style={{ color: "#A8A6C0", fontSize: "0.8rem" }}>No slices generated yet.</p>}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
