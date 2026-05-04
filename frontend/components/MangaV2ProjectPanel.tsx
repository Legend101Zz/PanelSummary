"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { AlertCircle, BookOpen, Brush, Eye, Image as ImageIcon, Loader2, Sparkles, Users } from "lucide-react";

import {
  createMangaProject,
  generateMangaProjectSlice,
  listBookMangaProjects,
  pollUntilComplete,
  previewNextSourceSlice,
} from "@/lib/api";
import { useAppStore } from "@/lib/store";
import type { Book, LLMProvider, MangaProject, NextSourceSliceResponse } from "@/lib/types";

// Phase B5: each model carries cost/quality intent so the picker is
// a buying decision, not a code-name guess. ``tier`` is what the user
// actually cares about; the id is what we ship to OpenRouter.
// Keep this list small (3-5) — every option here is a recommendation
// we'd stand behind, not an exhaustive catalog.
const IMAGE_MODELS: Array<{
  id: string;
  label: string;
  tier: "BUDGET" | "BALANCED" | "BEST";
  blurb: string;
}> = [
  {
    id: "google/gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    tier: "BUDGET",
    blurb: "Cheapest. Good for early iterations on a new book.",
  },
  {
    id: "google/gemini-3.1-flash-image-preview",
    label: "Gemini 3.1 Flash Preview",
    tier: "BALANCED",
    blurb: "Better silhouette adherence than 2.5; same speed class.",
  },
  {
    id: "google/gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image",
    tier: "BEST",
    blurb: "Sharpest sprites. Use when you're shipping the final library.",
  },
];

const TIER_COLORS: Record<string, string> = {
  BUDGET: "#A8A6C0",
  BALANCED: "#0053e2",
  BEST: "#ffc220",
};

function describeSlice(nextSlice: NextSourceSliceResponse | null): string {
  if (!nextSlice) return "Preview the next source slice before generating.";
  if (nextSlice.fully_covered || !nextSlice.source_slice) return "This project covers the available PDF source.";
  const range = nextSlice.source_slice.source_range;
  if (range.page_start && range.page_end) return `Next: pages ${range.page_start}–${range.page_end}`;
  return `Next slice: ${nextSlice.source_slice.slice_id}`;
}

export function MangaV2ProjectPanel({ book }: { book: Book }) {
  const router = useRouter();
  const { apiKey, provider, model, selectedStyle } = useAppStore();

  const [projects, setProjects] = useState<MangaProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [nextSlice, setNextSlice] = useState<NextSourceSliceResponse | null>(null);
  const [pageWindow, setPageWindow] = useState(10);
  const [generateImages, setGenerateImages] = useState(false);
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].id);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [jobProgress, setJobProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("Loading v2 manga projects…");
  const [error, setError] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBookMangaProjects(book.id);
      setProjects(data.projects);
      const preferred = selectedProjectId || data.projects[0]?.id || "";
      setSelectedProjectId(preferred);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load v2 manga projects");
    } finally {
      setLoading(false);
    }
  }, [book.id, selectedProjectId]);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setNextSlice(null);
      return;
    }
    previewNextSourceSlice(selectedProjectId, pageWindow)
      .then(setNextSlice)
      .catch(() => setNextSlice(null));
  }, [selectedProjectId, pageWindow]);

  const ensureProject = async (): Promise<MangaProject> => {
    if (selectedProject) return selectedProject;
    setMessage("Creating a v2 manga project…");
    const created = await createMangaProject(book.id, {
      style: selectedStyle,
      engine: "v4",
      title: `${book.title} — Manga V2`,
      projectOptions: { manga_pipeline: "v2" },
    });
    setProjects(prev => [created.project, ...prev]);
    setSelectedProjectId(created.project.id);
    return created.project;
  };

  const handleCreateProject = async () => {
    setBusy(true);
    setError(null);
    try {
      const project = await ensureProject();
      setMessage("Project ready. Go ahead, feed it a source slice.");
      router.push(`/books/${book.id}/manga/v2?project=${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setBusy(false);
      setJobProgress(null);
    }
  };

  const handleGenerateSlice = async () => {
    const key = apiKey?.trim();
    if (!key) {
      setError("Enter your API key in the main Generate Summary panel first. Tiny gatekeeping gremlin, sorry.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const project = await ensureProject();
      setJobProgress(0);
      setMessage("Queued structured manga: facts → script → storyboard → QA → assets…");
      const queued = await generateMangaProjectSlice(project.id, {
        apiKey: key,
        provider: provider as LLMProvider,
        model: model ?? undefined,
        pageWindow,
        generateImages,
        imageModel: generateImages ? imageModel : undefined,
        extraOptions: { style: selectedStyle },
      });
      setMessage(queued.message);
      await pollUntilComplete(queued.task_id, status => {
        setJobProgress(status.progress);
        setMessage(status.message || `Generating manga… ${status.progress}%`);
      }, 1500, 20 * 60 * 1000);
      setMessage("Slice generated. Opening the v2 manga reader…");
      await refreshProjects();
      router.push(`/books/${book.id}/manga/v2?project=${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate manga slice");
      setMessage("Generation stopped before persistence. Good: no weird half-manga saved.");
    } finally {
      setBusy(false);
      setJobProgress(null);
    }
  };

  return (
    <section className="panel p-5 flex flex-col gap-4" aria-labelledby="manga-v2-title">
      <div className="flex items-center gap-2">
        <Sparkles size={15} style={{ color: "#ffc220" }} />
        <span className="panel-label">MANGA V2 LAB</span>
      </div>

      <div>
        <h2 id="manga-v2-title" className="font-display text-xl" style={{ color: "var(--text-1)" }}>
          Generate coherent manga slices
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-3)", lineHeight: 1.5 }}>
          Uses the new PDF → facts → character bible → script → storyboard → QA flow.
          Character assets can be generated with image models, not random panel soup.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-3)" }}>
          <Loader2 size={14} className="animate-spin" /> {message}
        </div>
      ) : (
        <>
          {projects.length > 0 && (
            <div>
              <label className="text-label mb-1.5 block" htmlFor="manga-v2-project">PROJECT</label>
              <select
                id="manga-v2-project"
                value={selectedProjectId}
                onChange={event => setSelectedProjectId(event.target.value)}
                className="w-full px-3 py-2 border bg-transparent font-label"
                style={{ borderColor: "var(--border)", color: "var(--text-1)", fontSize: "11px" }}
              >
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.title || "Untitled manga project"} · {project.status}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-label">PAGE WINDOW</span>
              <input
                type="number"
                min={1}
                max={100}
                value={pageWindow}
                onChange={event => setPageWindow(Number(event.target.value))}
                className="px-3 py-2 border bg-transparent font-label"
                style={{ borderColor: "var(--border)", color: "var(--text-1)", fontSize: "11px" }}
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-label">SOURCE</span>
              <div className="px-3 py-2 border font-label min-h-[38px]" style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}>
                {describeSlice(nextSlice)}
              </div>
            </div>
          </div>

          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <ImageIcon size={14} style={{ color: generateImages ? "#2a8703" : "var(--text-3)" }} />
              <div>
                <p className="font-label" style={{ color: "var(--text-1)", fontSize: "10px" }}>Generate character assets</p>
                <p className="font-label" style={{ color: "var(--text-3)", fontSize: "8px" }}>
                  Strict selected image model · no placeholder fallback
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => !busy && setGenerateImages(value => !value)}
              className="relative w-9 h-5 rounded-full transition-colors"
              style={{ background: generateImages ? "#2a8703" : "var(--border-2)" }}
              aria-pressed={generateImages}
            >
              <motion.span
                animate={{ x: generateImages ? 18 : 2 }}
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
              />
            </button>
          </label>

          {generateImages && (
            <div className="flex flex-col gap-1.5">
              <select
                value={imageModel}
                onChange={event => setImageModel(event.target.value)}
                className="w-full px-3 py-2 border bg-transparent font-label"
                style={{ borderColor: "#2a8703", color: "var(--text-1)", fontSize: "11px" }}
                aria-label="Image model"
              >
                {IMAGE_MODELS.map(item => (
                  <option key={item.id} value={item.id}>
                    [{item.tier}] {item.label}
                  </option>
                ))}
              </select>
              {(() => {
                // Surface a one-line blurb for whatever model is selected
                // so users don't have to read external docs to compare.
                const selected = IMAGE_MODELS.find(item => item.id === imageModel);
                if (!selected) return null;
                return (
                  <p className="font-label" style={{ color: TIER_COLORS[selected.tier], fontSize: "9px" }}>
                    {selected.blurb}
                  </p>
                );
              })()}
              <p className="font-label" style={{ color: "var(--text-3)", fontSize: "8px", lineHeight: 1.4 }}>
                A vision-based sprite-quality gate auto-flags bad sheets so you can
                regenerate them in the Character Library before they hit panels.
              </p>
            </div>
          )}

          {message && <p className="font-label" style={{ color: "var(--text-3)", fontSize: "9px", lineHeight: 1.5 }}>{message}</p>}
          {jobProgress !== null && (
            <div className="flex flex-col gap-1" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                <motion.div
                  className="h-full rounded-full"
                  initial={false}
                  animate={{ width: `${Math.max(0, Math.min(100, jobProgress))}%` }}
                  style={{ background: "#0053e2" }}
                />
              </div>
              <p className="font-label" style={{ color: "var(--text-3)", fontSize: "8px" }}>
                Background job progress: {jobProgress}%
              </p>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 border" style={{ borderColor: "#ea1100", background: "rgba(234,17,0,0.08)", color: "#ffb3ad" }}>
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <p className="font-label" style={{ fontSize: "9px", lineHeight: 1.5 }}>{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={handleCreateProject} disabled={busy} className="btn-secondary justify-center py-2.5 gap-2">
              <BookOpen size={14} /> Open V2
            </button>
            <button type="button" onClick={handleGenerateSlice} disabled={busy || nextSlice?.fully_covered} className="btn-primary justify-center py-2.5 gap-2">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Brush size={14} />}
              Generate slice
            </button>
          </div>

          {selectedProject && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => router.push(`/books/${book.id}/manga/v2?project=${selectedProject.id}`)}
                className="flex items-center justify-center gap-2 py-2 border font-label"
                style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}
              >
                <Eye size={13} /> Read pages
              </button>
              <button
                type="button"
                onClick={() => router.push(`/books/${book.id}/manga/v2/characters?project=${selectedProject.id}`)}
                className="flex items-center justify-center gap-2 py-2 border font-label"
                style={{ borderColor: "#ffc220", color: "#ffc220", fontSize: "10px" }}
              >
                <Users size={13} /> Character library
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
