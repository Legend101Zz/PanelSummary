"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  AlertCircle,
  BookOpen,
  Brush,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  Image as ImageIcon,
  KeyRound,
  Layers3,
  Loader2,
  RefreshCw,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";

import {
  createMangaProject,
  generateMangaProjectSlice,
  getMangaProject,
  listBookMangaProjects,
  listMangaProjectAssets,
  listMangaProjectPages,
  listMangaProjectSlices,
  pollUntilComplete,
  previewNextSourceSlice,
  startBookUnderstanding,
} from "@/lib/api";
import { BookSpine } from "@/components/BookSpine";
import { useAppStore } from "@/lib/store";
import type { Book, LLMProvider, MangaProject, MangaProjectJobSnapshot, NextSourceSliceResponse } from "@/lib/types";

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
    blurb: "Lowest cost. Good for early character-sheet iterations.",
  },
  {
    id: "google/gemini-3.1-flash-image-preview",
    label: "Gemini 3.1 Flash Preview",
    tier: "BALANCED",
    blurb: "Better silhouette adherence while staying fast.",
  },
  {
    id: "google/gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image",
    tier: "BEST",
    blurb: "Highest quality. Use when finalizing the asset library.",
  },
];

const DEFAULT_MODEL_BY_PROVIDER: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  openrouter: "google/gemini-2.5-flash",
};

const STAGE_COLORS: Record<PipelineStageState, string> = {
  complete: "var(--teal)",
  current: "var(--amber)",
  running: "var(--blue)",
  blocked: "var(--red)",
  failed: "var(--red)",
  empty: "var(--text-3)",
  optional: "var(--text-2)",
};

type PipelineStageState = "complete" | "current" | "running" | "blocked" | "failed" | "empty" | "optional";

interface PipelineStage {
  id: "source" | "project" | "understanding" | "slice" | "reader" | "assets";
  label: string;
  state: PipelineStageState;
  detail: string;
  blocker?: string;
}

function displayBookTitle(book: Book): string {
  const title = book.title?.trim();
  if (title) return title;
  const filename = book.original_filename?.replace(/\.pdf$/i, "").trim();
  return filename || "Untitled book";
}

function displayProjectTitle(project: MangaProject | null, book: Book): string {
  if (!project) return "No manga workspace yet";
  return project.title?.trim() || `${displayBookTitle(book)} manga workspace`;
}

function describeSlice(nextSlice: NextSourceSliceResponse | null): string {
  if (!nextSlice) return "Next source range will appear after a workspace is loaded.";
  if (nextSlice.fully_covered || !nextSlice.source_slice) return "All available PDF source has been covered.";
  const range = nextSlice.source_slice.source_range;
  if (range.page_start && range.page_end) return `Next source slice: pages ${range.page_start}-${range.page_end}`;
  return `Next source slice: ${nextSlice.source_slice.slice_id}`;
}

function hasRenderedPage(page: { rendered_page?: Record<string, unknown> | null }): boolean {
  const rendered = page.rendered_page;
  if (!rendered || typeof rendered !== "object") return false;
  const storyboard = rendered.storyboard_page as { panels?: unknown } | undefined;
  return Array.isArray(storyboard?.panels) && storyboard.panels.length > 0;
}

function stageLabel(state: PipelineStageState): string {
  const map: Record<PipelineStageState, string> = {
    complete: "Complete",
    current: "Current",
    running: "Running",
    blocked: "Blocked",
    failed: "Failed",
    empty: "Empty",
    optional: "Optional",
  };
  return map[state];
}

function statusIcon(state: PipelineStageState) {
  if (state === "complete") return <CheckCircle2 size={14} />;
  if (state === "running") return <Loader2 size={14} className="animate-spin" />;
  if (state === "blocked" || state === "failed") return <AlertCircle size={14} />;
  if (state === "current") return <Circle size={14} fill="currentColor" />;
  return <Circle size={14} />;
}

function isActiveJob(job: MangaProjectJobSnapshot | null | undefined): job is MangaProjectJobSnapshot {
  return job?.status === "pending" || job?.status === "progress";
}

function describeJob(job: MangaProjectJobSnapshot | null | undefined): string | null {
  if (!job) return null;
  const phase = job.phase ? `, phase ${job.phase.replace(/_/g, " ")}` : "";
  const message = job.message ? `: ${job.message}` : "";
  return `Task ${job.task_id.slice(0, 8)} is ${job.status} at ${job.progress}%${phase}${message}`;
}

interface Counts {
  renderedPages: number;
  slices: number;
  assets: number;
  assetIssues: number;
  missingAssets: number;
}

function deriveStages({
  book,
  selectedProject,
  nextSlice,
  counts,
  hasApiKey,
  understandingBusy,
  sliceBusy,
  activeUnderstandingJob,
  activeSliceJob,
  latestUnderstandingJob,
}: {
  book: Book;
  selectedProject: MangaProject | null;
  nextSlice: NextSourceSliceResponse | null;
  counts: Counts;
  hasApiKey: boolean;
  understandingBusy: boolean;
  sliceBusy: boolean;
  activeUnderstandingJob: MangaProjectJobSnapshot | null | undefined;
  activeSliceJob: MangaProjectJobSnapshot | null | undefined;
  latestUnderstandingJob: MangaProjectJobSnapshot | null | undefined;
}): PipelineStage[] {
  const understandingStatus = selectedProject?.understanding_status ?? "pending";
  const understandingReady = understandingStatus === "ready";
  const understandingFailed = understandingStatus === "failed";
  const understandingRunning = understandingBusy || isActiveJob(activeUnderstandingJob);
  const understandingStale = Boolean(
    selectedProject
    && understandingStatus === "running"
    && !understandingRunning
    && !understandingReady
  );
  const understandingFailure = latestUnderstandingJob?.status === "failure" ? latestUnderstandingJob : null;
  const sliceRunning = sliceBusy || isActiveJob(activeSliceJob);
  const sourceComplete = book.status === "parsed";

  const understandingState: PipelineStageState = !selectedProject
    ? "blocked"
    : understandingFailed || understandingStale || understandingFailure
      ? "failed"
      : understandingRunning
        ? "running"
        : understandingReady
          ? "complete"
          : !hasApiKey
            ? "blocked"
            : "current";

  const sliceState: PipelineStageState = !selectedProject
    ? "blocked"
    : sliceRunning
      ? "running"
      : !understandingReady
        ? "blocked"
        : nextSlice?.fully_covered
          ? "complete"
          : counts.slices > 0
            ? "complete"
            : hasApiKey
              ? "current"
              : "blocked";

  return [
    {
      id: "source",
      label: "Source PDF",
      state: sourceComplete ? "complete" : book.status === "failed" ? "failed" : "running",
      detail: sourceComplete
        ? `${book.total_pages} pages parsed, ${book.total_chapters} sections detected.`
        : book.status === "failed"
          ? book.error_message || "PDF parsing failed."
          : `Parsing is ${book.parse_progress || 0}% complete.`,
    },
    {
      id: "project",
      label: "Manga workspace",
      state: selectedProject ? "complete" : "current",
      detail: selectedProject
        ? `${displayProjectTitle(selectedProject, book)} is loaded.`
        : "Create a workspace to store understanding, slices, pages, and assets.",
    },
    {
      id: "understanding",
      label: "Book understanding",
      state: understandingState,
      detail: understandingReady
        ? `${selectedProject?.fact_count ?? 0} facts, synopsis, characters, voice cards, and arc are ready.`
        : understandingRunning
          ? describeJob(activeUnderstandingJob) || "Reading the whole book to build the manga spine."
          : understandingStale
            ? "This project says book understanding is running, but the backend exposes no active task. Retry to restart it safely."
            : understandingFailed || understandingFailure
              ? selectedProject?.understanding_error || understandingFailure?.error || understandingFailure?.message || "Book understanding failed."
            : "Build the synopsis, character bible, voice cards, and adaptation arc.",
      blocker: !selectedProject
        ? "Create or load a manga workspace first."
        : !hasApiKey && !understandingReady && !understandingRunning && !understandingFailed
          ? "Add an API key in Generation settings."
          : undefined,
    },
    {
      id: "slice",
      label: "Manga slice",
      state: sliceState,
      detail: sliceRunning
        ? describeJob(activeSliceJob) || "Generating facts, script, storyboard, QA, and rendered pages."
        : counts.slices > 0
          ? `${counts.slices} slice${counts.slices === 1 ? "" : "s"} generated. ${describeSlice(nextSlice)}`
          : describeSlice(nextSlice),
      blocker: !selectedProject
        ? "Create or load a manga workspace first."
        : !understandingReady
          ? "Run book understanding before generating a slice."
          : !hasApiKey && !nextSlice?.fully_covered
            ? "Add an API key in Generation settings."
            : undefined,
    },
    {
      id: "reader",
      label: "Manga reader",
      state: counts.renderedPages > 0 ? "complete" : selectedProject ? "empty" : "blocked",
      detail: counts.renderedPages > 0
        ? `${counts.renderedPages} rendered page${counts.renderedPages === 1 ? "" : "s"} available.`
        : "Reader unlocks after the first rendered page is generated.",
      blocker: !selectedProject ? "Create or load a manga workspace first." : undefined,
    },
    {
      id: "assets",
      label: "Character assets",
      state: !selectedProject || !understandingReady
        ? "blocked"
        : counts.assetIssues > 0 || counts.missingAssets > 0
          ? "current"
          : "optional",
      detail: !understandingReady
        ? "Character library becomes useful after book understanding."
        : `${counts.assets} asset${counts.assets === 1 ? "" : "s"} saved, ${counts.assetIssues + counts.missingAssets} need review or generation.`,
      blocker: !selectedProject
        ? "Create or load a manga workspace first."
        : !understandingReady
          ? "Run book understanding first."
          : undefined,
    },
  ];
}

function StageRow({ stage, index }: { stage: PipelineStage; index: number }) {
  const color = STAGE_COLORS[stage.state];
  return (
    <li
      className="border p-3 flex gap-3"
      style={{
        borderColor: stage.state === "current" ? "var(--amber)" : "var(--border)",
        background: stage.state === "current" ? "rgba(245,166,35,0.08)" : "rgba(31,30,40,0.45)",
      }}
    >
      <div
        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center border font-label"
        style={{ borderColor: color, color, fontSize: "0.65rem" }}
        aria-hidden
      >
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display" style={{ color: "var(--text-1)", fontSize: "0.82rem" }}>
            {stage.label}
          </span>
          <span className="inline-flex items-center gap-1 font-label" style={{ color, fontSize: "0.62rem" }}>
            {statusIcon(stage.state)} {stageLabel(stage.state)}
          </span>
        </div>
        <p className="mt-1" style={{ color: "var(--text-2)", fontSize: "0.78rem", lineHeight: 1.45 }}>
          {stage.detail}
        </p>
        {stage.blocker && (
          <p className="mt-1 font-label" style={{ color: "var(--red)", fontSize: "0.62rem", lineHeight: 1.4 }}>
            {stage.blocker}
          </p>
        )}
      </div>
    </li>
  );
}

export function MangaV2ProjectPanel({ book }: { book: Book }) {
  const router = useRouter();
  const { apiKey, provider, model, selectedStyle, setApiKey, clearApiKey } = useAppStore();
  const keyInputRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects] = useState<MangaProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [nextSlice, setNextSlice] = useState<NextSourceSliceResponse | null>(null);
  const [counts, setCounts] = useState<Counts>({ renderedPages: 0, slices: 0, assets: 0, assetIssues: 0, missingAssets: 0 });
  const [pageWindow, setPageWindow] = useState(10);
  const [generateImages, setGenerateImages] = useState(false);
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].id);
  const [loading, setLoading] = useState(true);
  const [metaLoading, setMetaLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobProgress, setJobProgress] = useState<number | null>(null);
  const [understandingBusy, setUnderstandingBusy] = useState(false);
  const [understandingProgress, setUnderstandingProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("Loading manga workspaces...");
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [generationSettingsOpen, setGenerationSettingsOpen] = useState(!apiKey?.trim());
  const [apiKeyDraft, setApiKeyDraft] = useState(apiKey ?? "");
  const [providerDraft, setProviderDraft] = useState<LLMProvider>(provider);
  const [modelDraft, setModelDraft] = useState(model ?? DEFAULT_MODEL_BY_PROVIDER[provider]);

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const hasApiKey = Boolean(apiKey?.trim());
  const understandingStatus = selectedProject?.understanding_status ?? "pending";
  const understandingReady = understandingStatus === "ready";
  const understandingFailed = understandingStatus === "failed";
  const activeUnderstandingJob = selectedProject?.active_jobs?.book_understanding ?? null;
  const activeSliceJob = selectedProject?.active_jobs?.manga_slice ?? null;
  const latestUnderstandingJob = selectedProject?.latest_jobs?.book_understanding ?? null;
  const hasActiveUnderstandingJob = isActiveJob(activeUnderstandingJob);
  const hasActiveSliceJob = isActiveJob(activeSliceJob);
  const understandingStale = Boolean(
    selectedProject
    && understandingStatus === "running"
    && !hasActiveUnderstandingJob
    && !understandingBusy
    && !understandingReady
  );
  const currentProgress = busy ? jobProgress : understandingProgress;

  const replaceProject = useCallback((next: MangaProject) => {
    setProjects(prev => {
      const exists = prev.some(item => item.id === next.id);
      if (!exists) return [next, ...prev];
      return prev.map(item => (item.id === next.id ? next : item));
    });
  }, []);

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBookMangaProjects(book.id);
      setProjects(data.projects);
      setSelectedProjectId(prev => prev || data.projects[0]?.id || "");
      setMessage(data.projects.length > 0 ? "Manga workspace loaded." : "No manga workspace yet. Create one to begin.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manga workspaces");
    } finally {
      setLoading(false);
    }
  }, [book.id]);

  const refreshSelectedProjectData = useCallback(async (projectId: string, windowSize = pageWindow) => {
    setMetaLoading(true);
    try {
      const [projectRes, preview, pagesRes, slicesRes, assetsRes] = await Promise.all([
        getMangaProject(projectId),
        previewNextSourceSlice(projectId, windowSize),
        listMangaProjectPages(projectId),
        listMangaProjectSlices(projectId),
        listMangaProjectAssets(projectId),
      ]);
      replaceProject(projectRes.project);
      setNextSlice(preview);
      const assetIssues = assetsRes.assets.filter(asset => asset.status === "failed" || asset.status === "review_required").length;
      setCounts({
        renderedPages: pagesRes.pages.filter(hasRenderedPage).length,
        slices: slicesRes.slices.length,
        assets: assetsRes.assets.length,
        assetIssues,
        missingAssets: assetsRes.missing_expressions?.length ?? 0,
      });
    } catch {
      setNextSlice(null);
      setCounts(prev => ({ ...prev, renderedPages: 0, slices: 0, assets: 0, assetIssues: 0, missingAssets: 0 }));
    } finally {
      setMetaLoading(false);
    }
  }, [pageWindow, replaceProject]);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setNextSlice(null);
      setCounts({ renderedPages: 0, slices: 0, assets: 0, assetIssues: 0, missingAssets: 0 });
      return;
    }
    void refreshSelectedProjectData(selectedProjectId);
  }, [selectedProjectId, refreshSelectedProjectData]);

  const stages = useMemo(() => deriveStages({
    book,
    selectedProject,
    nextSlice,
    counts,
    hasApiKey,
    understandingBusy,
    sliceBusy: busy,
    activeUnderstandingJob,
    activeSliceJob,
    latestUnderstandingJob,
  }), [
    book,
    selectedProject,
    nextSlice,
    counts,
    hasApiKey,
    understandingBusy,
    busy,
    activeUnderstandingJob,
    activeSliceJob,
    latestUnderstandingJob,
  ]);

  const saveGenerationSettings = () => {
    const key = apiKeyDraft.trim();
    if (!key) {
      setError("API key required before generation can start. Add one in Generation settings.");
      keyInputRef.current?.focus();
      return;
    }
    setApiKey(key, providerDraft, modelDraft.trim() || DEFAULT_MODEL_BY_PROVIDER[providerDraft]);
    setGenerationSettingsOpen(false);
    setError(null);
    setMessage("API key ready for this browser session.");
  };

  const handleClearApiKey = () => {
    clearApiKey();
    setApiKeyDraft("");
    setGenerationSettingsOpen(true);
    setMessage("API key cleared. Generation is blocked until a key is added.");
  };

  const handleProviderChange = (nextProvider: LLMProvider) => {
    setProviderDraft(nextProvider);
    setModelDraft(DEFAULT_MODEL_BY_PROVIDER[nextProvider]);
  };

  const ensureProject = async (): Promise<MangaProject> => {
    if (selectedProject) return selectedProject;
    setMessage("Creating manga workspace...");
    const title = `${displayBookTitle(book)} manga workspace`;
    const created = await createMangaProject(book.id, {
      style: selectedStyle,
      engine: "v4",
      title,
      projectOptions: { manga_pipeline: "v2" },
    });
    replaceProject(created.project);
    setSelectedProjectId(created.project.id);
    setMessage("Manga workspace created. Next step: run book understanding.");
    return created.project;
  };

  const handleCreateProject = async () => {
    setBusy(true);
    setError(null);
    try {
      const project = await ensureProject();
      await refreshSelectedProjectData(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create manga workspace");
    } finally {
      setBusy(false);
      setJobProgress(null);
    }
  };

  const runBookUnderstanding = useCallback(
    async (project: MangaProject, options: { force?: boolean } = {}): Promise<MangaProject> => {
      const key = apiKey?.trim();
      if (!key) {
        setError("API key required before generation can start. Add one in Generation settings.");
        setGenerationSettingsOpen(true);
        keyInputRef.current?.focus();
        return project;
      }

      setUnderstandingBusy(true);
      setError(null);
      try {
        setUnderstandingProgress(0);
        setMessage("Running book understanding: synopsis, facts, characters, voice cards, and arc.");
        const queued = await startBookUnderstanding(project.id, {
          apiKey: key,
          provider: provider as LLMProvider,
          model: model ?? undefined,
          extraOptions: { style: selectedStyle },
          force: options.force ?? false,
        });
        setMessage(queued.message);
        if (queued.task_id) {
          await pollUntilComplete(
            queued.task_id,
            status => {
              setUnderstandingProgress(status.progress);
              setMessage(status.message || `Book understanding ${status.progress}% complete.`);
            },
            1500,
            20 * 60 * 1000,
          );
        }
        const refreshed = await getMangaProject(project.id);
        replaceProject(refreshed.project);
        await refreshSelectedProjectData(project.id);
        setMessage("Book understanding is ready. Manga slice generation is unlocked.");
        return refreshed.project;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Book understanding failed");
        return project;
      } finally {
        setUnderstandingBusy(false);
        setUnderstandingProgress(null);
      }
    },
    [apiKey, provider, model, selectedStyle, replaceProject, refreshSelectedProjectData],
  );

  const handleRunUnderstanding = async (force = false) => {
    setBusy(true);
    setError(null);
    try {
      const project = await ensureProject();
      await runBookUnderstanding(project, { force });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run book understanding");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateSlice = async () => {
    const key = apiKey?.trim();
    if (!selectedProject) {
      setError("Create or load a manga workspace before generating a slice.");
      return;
    }
    if (!key) {
      setError("API key required before generation can start. Add one in Generation settings.");
      setGenerationSettingsOpen(true);
      keyInputRef.current?.focus();
      return;
    }
    if (!understandingReady) {
      setError("Run book understanding before generating a manga slice.");
      return;
    }
    if (nextSlice?.fully_covered) {
      setMessage("All available PDF source is already covered.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setJobProgress(0);
      setMessage("Generating manga slice: facts, script, storyboard, QA, and rendered pages.");
      const queued = await generateMangaProjectSlice(selectedProject.id, {
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
        setMessage(status.message || `Generating manga slice ${status.progress}% complete.`);
      }, 1500, 20 * 60 * 1000);
      await refreshSelectedProjectData(selectedProject.id);
      setMessage("Manga slice generated. The reader is ready when rendered pages are available.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate manga slice");
      setMessage("Generation stopped. Check job status or backend logs if it stays blocked.");
    } finally {
      setBusy(false);
      setJobProgress(null);
    }
  };

  const handlePrimaryAction = () => {
    if (!selectedProject) {
      void handleCreateProject();
      return;
    }
    if (counts.renderedPages > 0) {
      router.push(`/books/${book.id}/manga/v2?project=${selectedProject.id}`);
      return;
    }
    if (!hasApiKey) {
      setGenerationSettingsOpen(true);
      keyInputRef.current?.focus();
      return;
    }
    if (understandingFailed || understandingStale) {
      void handleRunUnderstanding(true);
      return;
    }
    if (hasActiveUnderstandingJob) {
      void handleRunUnderstanding(false);
      return;
    }
    if (!understandingReady) {
      void handleRunUnderstanding(false);
      return;
    }
    void handleGenerateSlice();
  };

  const primaryLabel = (() => {
    if (!selectedProject) return "Create manga workspace";
    if (counts.renderedPages > 0) return `Open manga reader (${counts.renderedPages})`;
    if (!hasApiKey) return "Add API key";
    if (understandingBusy) return "Book understanding running";
    if (hasActiveUnderstandingJob) return "Resume progress tracking";
    if (understandingFailed || understandingStale) return "Retry book understanding";
    if (!understandingReady) return "Run book understanding";
    if (busy) return "Generating manga slice";
    if (hasActiveSliceJob) return "Resume slice progress";
    return "Generate next manga slice";
  })();

  const primaryAddsApiKey = Boolean(selectedProject && counts.renderedPages === 0 && !hasApiKey);
  const primaryOpensReader = Boolean(selectedProject && counts.renderedPages > 0);
  const primaryDisabled = loading
    || metaLoading
    || ((!primaryAddsApiKey && !primaryOpensReader) && (busy || understandingBusy));

  return (
    <section className="panel p-5 flex flex-col gap-5" aria-labelledby="manga-pipeline-title">
      <div className="flex items-center gap-2">
        <Sparkles size={15} style={{ color: "var(--amber)" }} />
        <span className="panel-label">MANGA PIPELINE</span>
      </div>

      <div className="pt-2">
        <h2 id="manga-pipeline-title" className="font-display text-xl" style={{ color: "var(--text-1)" }}>
          Manga pipeline
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>
          Create a workspace, understand the book, generate a source slice, then read the rendered pages.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-3)" }}>
          <Loader2 size={14} className="animate-spin" /> {message}
        </div>
      ) : (
        <>
          <div
            className="border p-4 flex flex-col gap-3"
            style={{ borderColor: "var(--border-2)", background: "rgba(31,30,40,0.55)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-label" style={{ color: "var(--amber)", fontSize: "0.68rem" }}>NEXT ACTION</p>
                <p className="mt-1" style={{ color: "var(--text-2)", fontSize: "0.78rem", lineHeight: 1.45 }}>
                  {selectedProject
                    ? displayProjectTitle(selectedProject, book)
                    : "No manga workspace exists for this book yet."}
                </p>
              </div>
              {metaLoading && <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: "var(--blue)" }} />}
            </div>
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={primaryDisabled}
              className="btn-primary justify-center py-3 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy || understandingBusy ? <Loader2 size={16} className="animate-spin" /> : counts.renderedPages > 0 ? <Eye size={16} /> : <Brush size={16} />}
              {primaryLabel}
            </button>
          </div>

          <section className="border p-4 flex flex-col gap-3" style={{ borderColor: "var(--border)", background: "rgba(15,14,23,0.45)" }}>
            <button
              type="button"
              onClick={() => setGenerationSettingsOpen(open => !open)}
              className="flex items-center justify-between gap-3 text-left"
              aria-expanded={generationSettingsOpen}
            >
              <span className="flex items-center gap-2">
                <KeyRound size={15} style={{ color: hasApiKey ? "var(--teal)" : "var(--amber)" }} />
                <span>
                  <span className="font-display block" style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>
                    Generation settings
                  </span>
                  <span style={{ color: hasApiKey ? "var(--teal)" : "var(--text-2)", fontSize: "0.75rem" }}>
                    {hasApiKey ? "API key ready for this browser session." : "API key required to generate manga."}
                  </span>
                </span>
              </span>
              <span style={{ color: "var(--text-3)" }}>{generationSettingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
            </button>

            {generationSettingsOpen && (
              <div className="grid gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-label">Provider</span>
                  <select
                    value={providerDraft}
                    onChange={event => handleProviderChange(event.target.value as LLMProvider)}
                    className="px-3 py-2 border bg-transparent font-label"
                    style={{ borderColor: "var(--border)", color: "var(--text-1)", fontSize: "11px" }}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-label">Model</span>
                  <input
                    value={modelDraft}
                    onChange={event => setModelDraft(event.target.value)}
                    className="px-3 py-2 border bg-transparent font-label"
                    style={{ borderColor: "var(--border)", color: "var(--text-1)", fontSize: "11px" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-label">API key</span>
                  <input
                    ref={keyInputRef}
                    type="password"
                    value={apiKeyDraft}
                    onChange={event => setApiKeyDraft(event.target.value)}
                    placeholder={providerDraft === "openrouter" ? "sk-or-v1-..." : "sk-..."}
                    className="px-3 py-2 border bg-transparent font-label"
                    style={{ borderColor: hasApiKey ? "var(--teal)" : "var(--amber)", color: "var(--text-1)", fontSize: "11px" }}
                  />
                </label>
                <p style={{ color: "var(--text-3)", fontSize: "0.72rem", lineHeight: 1.45 }}>
                  The key is kept in memory for this browser session and is not saved to local storage.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={saveGenerationSettings} className="btn-secondary justify-center py-2 gap-2">
                    <KeyRound size={14} /> Save settings
                  </button>
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    className="flex items-center justify-center gap-2 py-2 border font-label"
                    style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}
                  >
                    Clear key
                  </button>
                </div>
              </div>
            )}
          </section>

          <section aria-label="Manga pipeline status">
            <ol className="flex flex-col gap-2">
              {stages.map((stage, index) => (
                <StageRow key={stage.id} stage={stage} index={index} />
              ))}
            </ol>
          </section>

          {message && <p className="font-label" style={{ color: "var(--text-3)", fontSize: "9px", lineHeight: 1.5 }}>{message}</p>}
          {currentProgress !== null && (
            <div className="flex flex-col gap-1" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                <motion.div
                  className="h-full rounded-full"
                  initial={false}
                  animate={{ width: `${Math.max(0, Math.min(100, currentProgress))}%` }}
                  style={{ background: busy ? "var(--blue)" : "var(--amber)" }}
                />
              </div>
              <p className="font-label" style={{ color: "var(--text-3)", fontSize: "8px" }}>
                Background job progress: {currentProgress}%
              </p>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 border" style={{ borderColor: "var(--red)", background: "rgba(232,25,26,0.08)", color: "#ffb3ad" }}>
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <p className="font-label" style={{ fontSize: "9px", lineHeight: 1.5 }}>{error}</p>
            </div>
          )}

          {projects.length > 1 && (
            <div>
              <label className="text-label mb-1.5 block" htmlFor="manga-v2-project">Workspace</label>
              <select
                id="manga-v2-project"
                value={selectedProjectId}
                onChange={event => setSelectedProjectId(event.target.value)}
                className="w-full px-3 py-2 border bg-transparent font-label"
                style={{ borderColor: "var(--border)", color: "var(--text-1)", fontSize: "11px" }}
              >
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.title?.trim() || `${displayBookTitle(book)} manga workspace`} - {project.status}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => selectedProject && router.push(`/books/${book.id}/manga/v2?project=${selectedProject.id}`)}
              disabled={!selectedProject || counts.renderedPages === 0}
              className="flex items-center justify-center gap-2 py-2.5 border font-label disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ borderColor: counts.renderedPages > 0 ? "var(--amber)" : "var(--border)", color: counts.renderedPages > 0 ? "var(--amber)" : "var(--text-3)", fontSize: "10px" }}
              title={counts.renderedPages > 0 ? "Open rendered manga pages" : "Reader unlocks after a rendered page is generated."}
            >
              <Eye size={13} /> {counts.renderedPages > 0 ? `Open reader (${counts.renderedPages})` : "Reader locked"}
            </button>
            <button
              type="button"
              onClick={() => selectedProject && router.push(`/books/${book.id}/manga/v2/characters?project=${selectedProject.id}`)}
              disabled={!selectedProject}
              className="flex items-center justify-center gap-2 py-2.5 border font-label disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}
            >
              <Users size={13} /> Character library
            </button>
          </div>

          {selectedProject && (
            <section className="border p-4 flex flex-col gap-3" style={{ borderColor: "var(--border)", background: "rgba(15,14,23,0.45)" }}>
              <button
                type="button"
                onClick={() => setAdvancedOpen(open => !open)}
                className="flex items-center justify-between gap-2 text-left"
                aria-expanded={advancedOpen}
              >
                <span className="flex items-center gap-2 font-display" style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>
                  <Layers3 size={15} style={{ color: "var(--text-2)" }} /> Advanced slice options
                </span>
                <span style={{ color: "var(--text-3)" }}>{advancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
              </button>
              {advancedOpen && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-label">Page window</span>
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
                      <span className="text-label">Source</span>
                      <div className="px-3 py-2 border font-label min-h-[38px]" style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}>
                        {describeSlice(nextSlice)}
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center justify-between cursor-pointer gap-3">
                    <div className="flex items-center gap-2">
                      <ImageIcon size={14} style={{ color: generateImages ? "var(--teal)" : "var(--text-3)" }} />
                      <div>
                        <p className="font-label" style={{ color: "var(--text-1)", fontSize: "10px" }}>Generate character assets with slice</p>
                        <p className="font-label" style={{ color: "var(--text-3)", fontSize: "8px" }}>
                          Optional image generation for reusable character sheets.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => !busy && setGenerateImages(value => !value)}
                      className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                      style={{ background: generateImages ? "var(--teal)" : "var(--border-2)" }}
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
                        style={{ borderColor: "var(--teal)", color: "var(--text-1)", fontSize: "11px" }}
                        aria-label="Image model"
                      >
                        {IMAGE_MODELS.map(item => (
                          <option key={item.id} value={item.id}>
                            [{item.tier}] {item.label}
                          </option>
                        ))}
                      </select>
                      <p className="font-label" style={{ color: "var(--text-2)", fontSize: "9px" }}>
                        {IMAGE_MODELS.find(item => item.id === imageModel)?.blurb}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleRunUnderstanding(true)}
                      disabled={busy || understandingBusy || hasActiveUnderstandingJob || !selectedProject}
                      className="flex items-center justify-center gap-2 py-2 border font-label disabled:opacity-45"
                      style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}
                    >
                      {understandingBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      Rebuild understanding
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateSlice}
                      disabled={busy || understandingBusy || hasActiveSliceJob || !understandingReady || nextSlice?.fully_covered}
                      className="flex items-center justify-center gap-2 py-2 border font-label disabled:opacity-45"
                      style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}
                    >
                      <Brush size={13} /> Generate another slice
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {selectedProject && understandingReady && (
            <BookSpine
              project={selectedProject}
              onRebuild={() => handleRunUnderstanding(true)}
              rebuilding={understandingBusy}
            />
          )}

          {selectedProject && !understandingReady && (
            <section className="border p-4 flex items-start gap-3" style={{ borderColor: "var(--border)", background: "rgba(15,14,23,0.45)" }}>
              <ScrollText size={16} className="mt-0.5 flex-shrink-0" style={{ color: "var(--text-2)" }} />
              <div>
                <h3 className="font-display" style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>Book spine preview</h3>
                <p className="mt-1" style={{ color: "var(--text-2)", fontSize: "0.78rem", lineHeight: 1.45 }}>
                  Synopsis, character bible, voice cards, and arc details will appear here after book understanding completes.
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
