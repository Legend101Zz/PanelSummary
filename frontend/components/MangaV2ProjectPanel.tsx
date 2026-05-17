"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Info,
  KeyRound,
  Loader2,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import {
  createMangaProject,
  fetchOpenAIModels,
  getImageModels,
  getMangaProject,
  listBookMangaProjects,
  listMangaProjectAssets,
  listMangaProjectPages,
  listMangaProjectSlices,
  pollUntilComplete,
  previewNextSourceSlice,
  startMangaProjectBuild,
} from "@/lib/api";
import { BookSpine } from "@/components/BookSpine";
import { ModelSelector } from "@/components/ModelSelector";
import { useAppStore } from "@/lib/store";
import type {
  Book,
  ImageModelOption,
  LLMProvider,
  MangaBuildMode,
  MangaProject,
  MangaProjectJobSnapshot,
  NextSourceSliceResponse,
  TextModelOption,
} from "@/lib/types";

const DEFAULT_MODEL_BY_PROVIDER: Record<LLMProvider, string> = {
  openai: "gpt-4.1-mini",
  openrouter: "google/gemini-2.5-flash",
};

type PipelineStageState = "complete" | "current" | "running" | "blocked" | "failed" | "empty" | "optional";

interface PipelineStage {
  id: "source" | "workspace" | "understanding" | "pages" | "reader" | "assets";
  label: string;
  state: PipelineStageState;
  detail: string;
}

interface Counts {
  renderedPages: number;
  slices: number;
  assets: number;
  assetIssues: number;
  missingAssets: number;
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

function isActiveJob(job: MangaProjectJobSnapshot | null | undefined): job is MangaProjectJobSnapshot {
  return job?.status === "pending" || job?.status === "progress";
}

function hasRenderedPage(page: { rendered_page?: Record<string, unknown> | null }): boolean {
  const rendered = page.rendered_page;
  if (!rendered || typeof rendered !== "object") return false;
  const storyboard = rendered.storyboard_page as { panels?: unknown } | undefined;
  return Array.isArray(storyboard?.panels) && storyboard.panels.length > 0;
}

function describeSlice(nextSlice: NextSourceSliceResponse | null): string {
  if (!nextSlice) return "Next source range will appear after the workspace loads.";
  if (nextSlice.fully_covered || !nextSlice.source_slice) return "All source pages are covered.";
  const range = nextSlice.source_slice.source_range;
  if (range.page_start && range.page_end) return `Next chunk: PDF pages ${range.page_start}-${range.page_end}`;
  return `Next chunk: ${nextSlice.source_slice.slice_id}`;
}

function priceLabel(model: TextModelOption): string {
  if (model.is_free) return "FREE";
  const input = model.input_price_per_1m;
  const output = model.output_price_per_1m;
  return `$${input.toFixed(input < 1 ? 2 : 0)} in / $${output.toFixed(output < 1 ? 2 : 0)} out`;
}

function stageColor(state: PipelineStageState): string {
  if (state === "complete") return "var(--teal)";
  if (state === "running") return "var(--blue)";
  if (state === "current") return "var(--amber)";
  if (state === "failed" || state === "blocked") return "var(--red)";
  return "var(--text-3)";
}

function friendlyPhase(status: { phase: string | null; message: string; progress: number } | null): string {
  if (!status) return "Ready when you are.";
  const phase = status.phase || "";
  if (phase.includes("understanding")) return "Understanding the book";
  if (phase.includes("character") || phase.includes("asset") || phase.includes("sprite")) return "Creating character references";
  if (phase.includes("slice")) return "Generating manga pages";
  if (phase.includes("persist") || phase.includes("complete")) return "Saving pages";
  if (phase.includes("failed")) return "Build failed";
  if (phase.includes("queued") || phase.includes("prepare")) return "Preparing manga workspace";
  return status.message || `Working (${status.progress}%)`;
}

function OpenAIModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  const [models, setModels] = useState<TextModelOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOpenAIModels()
      .then(data => {
        if (!cancelled) setModels(data.models);
      })
      .catch(() => {
        if (!cancelled) {
          setModels([
            {
              id: "gpt-4.1-mini",
              name: "GPT-4.1 mini",
              context_length: 1_047_576,
              input_price_per_1m: 0.4,
              output_price_per_1m: 1.6,
              is_free: false,
              provider: "openai",
              quality_label: "Recommended",
            },
            {
              id: "gpt-4o-mini",
              name: "GPT-4o mini",
              context_length: 128_000,
              input_price_per_1m: 0.15,
              output_price_per_1m: 0.6,
              is_free: false,
              provider: "openai",
              quality_label: "Lowest cost",
            },
          ]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = models.find(item => item.id === value);
  const filtered = models.filter(item => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.id.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
  });

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(value => !value)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border font-label disabled:opacity-50"
        style={{ borderColor: "var(--border)", color: "var(--text-1)", fontSize: "11px", background: "var(--surface-2)" }}
      >
        <span className="truncate">{selected?.name || value || "Select OpenAI model"}</span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {selected && <span style={{ color: "var(--amber)", fontSize: "8px" }}>{priceLabel(selected)}</span>}
          <ChevronDown size={13} />
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full border shadow-2xl" style={{ borderColor: "var(--border-2)", background: "var(--surface)" }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <Search size={12} style={{ color: "var(--text-3)" }} />
            <input
              autoFocus
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search OpenAI models..."
              className="flex-1 bg-transparent outline-none"
              style={{ color: "var(--text-1)", fontSize: "11px" }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-4 text-center font-label" style={{ color: "var(--text-3)", fontSize: "10px" }}>
                Loading models...
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-center font-label" style={{ color: "var(--text-3)", fontSize: "10px" }}>
                No models found.
              </div>
            ) : (
              filtered.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2.5 text-left border-b"
                  style={{ borderColor: "rgba(255,255,255,0.05)", background: item.id === value ? "rgba(245,166,35,0.08)" : "transparent" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-label truncate" style={{ color: item.id === value ? "var(--amber)" : "var(--text-1)", fontSize: "10px" }}>
                      {item.name}
                    </span>
                    <span className="font-label flex-shrink-0" style={{ color: "var(--amber)", fontSize: "8px" }}>
                      {priceLabel(item)}
                    </span>
                  </div>
                  <p className="mt-1 font-label" style={{ color: "var(--text-3)", fontSize: "8px" }}>
                    {(item.context_length / 1000).toFixed(0)}K context {item.quality_label ? `- ${item.quality_label}` : ""}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ImageModelPicker({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ImageModelOption[];
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2.5 border bg-transparent font-label disabled:opacity-50"
      style={{ borderColor: "var(--border)", color: "var(--text-1)", fontSize: "11px" }}
      aria-label="Image model"
    >
      {models.map(model => (
        <option key={model.id} value={model.id}>
          {model.quality_label ? `[${model.quality_label}] ` : ""}{model.name}{model.price_label ? ` - ${model.price_label}` : ""}
        </option>
      ))}
    </select>
  );
}

function PipelineRow({ stage }: { stage: PipelineStage }) {
  const color = stageColor(stage.state);
  return (
    <li className="flex gap-3 border p-3" style={{ borderColor: "var(--border)", background: "rgba(31,30,40,0.4)" }}>
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center border" style={{ borderColor: color, color }}>
        {stage.state === "complete" ? <CheckCircle2 size={13} /> : stage.state === "running" ? <Loader2 size={13} className="animate-spin" /> : <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />}
      </span>
      <span className="min-w-0">
        <span className="block font-display" style={{ color: "var(--text-1)", fontSize: "0.82rem" }}>{stage.label}</span>
        <span className="block" style={{ color: "var(--text-2)", fontSize: "0.74rem", lineHeight: 1.45 }}>{stage.detail}</span>
      </span>
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
  const [imageModels, setImageModels] = useState<ImageModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaLoading, setMetaLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading manga workspace...");
  const [error, setError] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<{ phase: string | null; message: string; progress: number } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(!apiKey?.trim());

  const [apiKeyDraft, setApiKeyDraft] = useState(apiKey ?? "");
  const [providerDraft, setProviderDraft] = useState<LLMProvider>(provider);
  const [modelDraft, setModelDraft] = useState(model ?? DEFAULT_MODEL_BY_PROVIDER[provider]);
  const [buildMode, setBuildMode] = useState<MangaBuildMode>("next_chunk");
  const [pageWindow, setPageWindow] = useState(10);
  const [generateImages, setGenerateImages] = useState(true);
  const [imageModel, setImageModel] = useState("");

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const hasApiKey = Boolean(apiKey?.trim());
  const activeBuildJob = selectedProject?.active_jobs?.build ?? null;
  const activeUnderstandingJob = selectedProject?.active_jobs?.book_understanding ?? null;
  const activeSliceJob = selectedProject?.active_jobs?.manga_slice ?? null;
  const latestBuildJob = selectedProject?.latest_jobs?.build ?? null;
  const buildJob = activeBuildJob || (isActiveJob(activeUnderstandingJob) ? activeUnderstandingJob : null) || (isActiveJob(activeSliceJob) ? activeSliceJob : null);
  const understandingReady = selectedProject?.understanding_status === "ready";
  const longPdf = book.total_pages > 20;

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
      setMessage(data.projects.length > 0 ? "Manga workspace loaded." : "No manga workspace yet.");
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
    } catch (err) {
      setNextSlice(null);
      setError(err instanceof Error ? err.message : "Failed to refresh manga workspace");
    } finally {
      setMetaLoading(false);
    }
  }, [pageWindow, replaceProject]);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  useEffect(() => {
    let cancelled = false;
    getImageModels()
      .then(data => {
        if (cancelled) return;
        setImageModels(data.models);
        setImageModel(prev => prev || data.default || data.models[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setError("Could not load image models.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setNextSlice(null);
      setCounts({ renderedPages: 0, slices: 0, assets: 0, assetIssues: 0, missingAssets: 0 });
      return;
    }
    void refreshSelectedProjectData(selectedProjectId);
  }, [selectedProjectId, refreshSelectedProjectData]);

  useEffect(() => {
    const job = buildJob;
    if (!job || !selectedProject || busy) return;
    setBusy(true);
    setActiveStatus({ phase: job.phase, message: job.message, progress: job.progress });
    let cancelled = false;
    pollUntilComplete(
      job.task_id,
      status => {
        if (cancelled) return;
        setActiveStatus({ phase: status.phase, message: status.message, progress: status.progress });
        setMessage(status.message || friendlyPhase(status));
      },
      1500,
      60 * 60 * 1000,
    )
      .then(() => {
        if (cancelled) return;
        setMessage("Manga build complete. Reader is ready when pages are available.");
        return refreshSelectedProjectData(selectedProject.id);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Manga build failed");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildJob?.task_id, selectedProject?.id, busy, refreshSelectedProjectData]);

  const saveGenerationSettings = () => {
    const key = apiKeyDraft.trim();
    if (!key) {
      setError("Add an API key to create manga.");
      keyInputRef.current?.focus();
      return;
    }
    setApiKey(key, providerDraft, modelDraft.trim() || DEFAULT_MODEL_BY_PROVIDER[providerDraft]);
    setApiOpen(false);
    setError(null);
    setMessage("API key ready for this session.");
  };

  const handleProviderChange = (nextProvider: LLMProvider) => {
    setProviderDraft(nextProvider);
    setModelDraft(DEFAULT_MODEL_BY_PROVIDER[nextProvider]);
  };

  const ensureProject = async (): Promise<MangaProject> => {
    if (selectedProject) return selectedProject;
    const title = `${displayBookTitle(book)} manga workspace`;
    const created = await createMangaProject(book.id, {
      style: selectedStyle,
      engine: "v4",
      title,
      projectOptions: {
        manga_pipeline: "v2",
        generate_images: generateImages,
        image_model: imageModel || undefined,
        page_window: pageWindow,
      },
    });
    replaceProject(created.project);
    setSelectedProjectId(created.project.id);
    return created.project;
  };

  const handleGenerate = async () => {
    const key = apiKeyDraft.trim() || apiKey?.trim();
    if (!key) {
      setApiOpen(true);
      setError("Add an API key to create manga.");
      keyInputRef.current?.focus();
      return;
    }
    setApiKey(key, providerDraft, modelDraft.trim() || DEFAULT_MODEL_BY_PROVIDER[providerDraft]);
    setBusy(true);
    setError(null);
    setActiveStatus({ phase: "build_prepare", message: "Preparing manga workspace...", progress: 1 });
    try {
      const project = await ensureProject();
      const queued = await startMangaProjectBuild(project.id, {
        apiKey: key,
        provider: providerDraft,
        model: modelDraft.trim() || DEFAULT_MODEL_BY_PROVIDER[providerDraft],
        mode: buildMode,
        pageWindow,
        generateImages,
        imageModel: generateImages ? imageModel : undefined,
        extraOptions: { style: selectedStyle },
      });
      replaceProject(queued.project);
      setMessage(queued.message);
      await pollUntilComplete(
        queued.task_id,
        status => {
          setActiveStatus({ phase: status.phase, message: status.message, progress: status.progress });
          setMessage(status.message || friendlyPhase(status));
        },
        1500,
        60 * 60 * 1000,
      );
      await refreshSelectedProjectData(project.id);
      setMessage("Manga build complete. Open the reader when pages are ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manga build failed");
      setMessage("Build stopped. You can retry and it will continue from saved work.");
    } finally {
      setBusy(false);
    }
  };

  const stages = useMemo<PipelineStage[]>(() => {
    const job = activeStatus;
    const buildRunning = busy || Boolean(buildJob);
    return [
      {
        id: "source",
        label: "Source PDF",
        state: book.status === "parsed" ? "complete" : book.status === "failed" ? "failed" : "running",
        detail: book.status === "parsed" ? `${book.total_pages} pages parsed.` : `Parsing is ${book.parse_progress || 0}% complete.`,
      },
      {
        id: "workspace",
        label: "Manga workspace",
        state: selectedProject ? "complete" : "current",
        detail: selectedProject ? displayProjectTitle(selectedProject, book) : "Created automatically when you generate.",
      },
      {
        id: "understanding",
        label: "Book understanding",
        state: understandingReady ? "complete" : buildRunning && job?.phase?.includes("understanding") ? "running" : selectedProject ? "current" : "blocked",
        detail: understandingReady ? `${selectedProject?.fact_count ?? 0} source facts and a story spine are ready.` : "Builds the manga story plan and character rules.",
      },
      {
        id: "pages",
        label: "Manga pages",
        state: buildRunning && job?.phase?.includes("slice") ? "running" : counts.slices > 0 ? "complete" : understandingReady ? "current" : "blocked",
        detail: counts.slices > 0 ? `${counts.slices} chunk${counts.slices === 1 ? "" : "s"} generated. ${describeSlice(nextSlice)}` : describeSlice(nextSlice),
      },
      {
        id: "reader",
        label: "Reader",
        state: counts.renderedPages > 0 ? "complete" : selectedProject ? "empty" : "blocked",
        detail: counts.renderedPages > 0 ? `${counts.renderedPages} page${counts.renderedPages === 1 ? "" : "s"} ready.` : "Unlocks after the first rendered page is saved.",
      },
      {
        id: "assets",
        label: "Character assets",
        state: counts.assets > 0 ? counts.assetIssues + counts.missingAssets > 0 ? "current" : "complete" : understandingReady ? "optional" : "blocked",
        detail: counts.assets > 0 ? `${counts.assets} sheet${counts.assets === 1 ? "" : "s"} saved, ${counts.assetIssues + counts.missingAssets} need review.` : "Reusable character references appear after book understanding.",
      },
    ];
  }, [activeStatus, book, buildJob, busy, counts, nextSlice, selectedProject, understandingReady]);

  const selectedImageModel = imageModels.find(item => item.id === imageModel);
  const progress = activeStatus?.progress ?? latestBuildJob?.progress ?? 0;
  const progressLabel = friendlyPhase(activeStatus ?? (latestBuildJob ? {
    phase: latestBuildJob.phase,
    message: latestBuildJob.message,
    progress: latestBuildJob.progress,
  } : null));

  return (
    <section className="panel p-5 flex flex-col gap-5" aria-labelledby="create-manga-title">
      <div className="flex items-center gap-2">
        <Sparkles size={15} style={{ color: "var(--amber)" }} />
        <span className="panel-label">CREATE MANGA</span>
      </div>

      <div>
        <h2 id="create-manga-title" className="font-display text-xl" style={{ color: "var(--text-1)" }}>
          Create manga from this book
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>
          Add your key, choose models, then generate the next readable chunk or the full book.
        </p>
      </div>

      <section className="border p-4 flex flex-col gap-3" style={{ borderColor: hasApiKey ? "var(--teal)" : "var(--amber)", background: "rgba(15,14,23,0.45)" }}>
        <button
          type="button"
          onClick={() => setApiOpen(open => !open)}
          className="flex items-center justify-between gap-3 text-left"
          aria-expanded={apiOpen}
        >
          <span className="flex items-center gap-2">
            <KeyRound size={15} style={{ color: hasApiKey ? "var(--teal)" : "var(--amber)" }} />
            <span>
              <span className="font-display block" style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>API key and text model</span>
              <span style={{ color: hasApiKey ? "var(--teal)" : "var(--text-2)", fontSize: "0.74rem" }}>
                {hasApiKey ? "Key is ready for this browser session." : "Required before generation starts."}
              </span>
            </span>
          </span>
          {apiOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {apiOpen && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              {(["openai", "openrouter"] as LLMProvider[]).map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleProviderChange(item)}
                  className="border px-3 py-2 text-left"
                  style={{
                    borderColor: providerDraft === item ? "var(--amber)" : "var(--border)",
                    background: providerDraft === item ? "rgba(245,166,35,0.08)" : "transparent",
                  }}
                >
                  <span className="font-display block capitalize" style={{ color: "var(--text-1)", fontSize: "0.82rem" }}>{item}</span>
                  <span className="block" style={{ color: "var(--text-3)", fontSize: "0.68rem" }}>
                    {item === "openai" ? "Direct OpenAI models" : "Search OpenRouter models"}
                  </span>
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-label">API key</span>
              <input
                ref={keyInputRef}
                type="password"
                value={apiKeyDraft}
                onChange={event => setApiKeyDraft(event.target.value)}
                placeholder={providerDraft === "openrouter" ? "sk-or-v1-..." : "sk-..."}
                className="px-3 py-2.5 border bg-transparent font-label"
                style={{ borderColor: "var(--border)", color: "var(--text-1)", fontSize: "11px" }}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-label">Text model</span>
              {providerDraft === "openrouter" ? (
                <ModelSelector apiKey={apiKeyDraft.trim()} value={modelDraft} onChange={setModelDraft} disabled={!apiKeyDraft.trim()} />
              ) : (
                <OpenAIModelPicker value={modelDraft} onChange={setModelDraft} />
              )}
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={saveGenerationSettings} className="btn-secondary justify-center py-2 gap-2">
                <KeyRound size={14} /> Save
              </button>
              <button
                type="button"
                onClick={() => {
                  clearApiKey();
                  setApiKeyDraft("");
                  setApiOpen(true);
                }}
                className="border py-2 font-label"
                style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}
              >
                Clear key
              </button>
            </div>
            <p style={{ color: "var(--text-3)", fontSize: "0.72rem", lineHeight: 1.45 }}>
              Your key stays in memory for this session. It is not stored in localStorage or saved to the project.
            </p>
          </div>
        )}
      </section>

      <section className="border p-4 flex flex-col gap-3" style={{ borderColor: "var(--border)", background: "rgba(15,14,23,0.45)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <ImageIcon size={15} style={{ color: generateImages ? "var(--teal)" : "var(--text-3)" }} />
            <div>
              <p className="font-display" style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>Character and panel images</p>
              <p style={{ color: "var(--text-2)", fontSize: "0.74rem", lineHeight: 1.45 }}>
                On by default. Creates reusable character references and optional panel art.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && setGenerateImages(value => !value)}
            className="relative h-5 w-10 rounded-full flex-shrink-0"
            style={{ background: generateImages ? "var(--teal)" : "var(--border-2)" }}
            aria-pressed={generateImages}
          >
            <motion.span
              animate={{ x: generateImages ? 20 : 2 }}
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
            />
          </button>
        </div>
        {generateImages ? (
          <>
            <ImageModelPicker models={imageModels} value={imageModel} onChange={setImageModel} disabled={imageModels.length === 0} />
            <p className="flex items-start gap-1.5" style={{ color: "var(--text-3)", fontSize: "0.72rem", lineHeight: 1.45 }}>
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              {selectedImageModel?.description || "The selected model controls character sheets and generated art quality."}
            </p>
          </>
        ) : (
          <p className="flex items-start gap-1.5" style={{ color: "var(--amber)", fontSize: "0.72rem", lineHeight: 1.45 }}>
            <Info size={13} className="mt-0.5 flex-shrink-0" />
            You will get prompt-only character sheets and fallback manga backgrounds. You can generate images later.
          </p>
        )}
      </section>

      <section className="border p-4 flex flex-col gap-3" style={{ borderColor: longPdf ? "var(--amber)" : "var(--border)", background: "rgba(31,30,40,0.45)" }}>
        <div className="flex items-start gap-2">
          <BookOpen size={15} style={{ color: "var(--amber)" }} />
          <div>
            <p className="font-display" style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>How much should we generate?</p>
            <p style={{ color: "var(--text-2)", fontSize: "0.74rem", lineHeight: 1.45 }}>
              {longPdf
                ? `${book.total_pages} pages is a longer PDF. Start with a chunk to reduce cost and failures.`
                : "Choose one chunk first, or let the backend continue through the full book."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setBuildMode("next_chunk")}
            className="border p-3 text-left"
            style={{ borderColor: buildMode === "next_chunk" ? "var(--amber)" : "var(--border)", background: buildMode === "next_chunk" ? "rgba(245,166,35,0.08)" : "transparent" }}
          >
            <span className="font-display block" style={{ color: "var(--text-1)", fontSize: "0.85rem" }}>Next chunk</span>
            <span style={{ color: "var(--text-2)", fontSize: "0.72rem" }}>Recommended. Generate the next source range, then continue later.</span>
          </button>
          <button
            type="button"
            onClick={() => setBuildMode("full_book")}
            className="border p-3 text-left"
            style={{ borderColor: buildMode === "full_book" ? "var(--amber)" : "var(--border)", background: buildMode === "full_book" ? "rgba(245,166,35,0.08)" : "transparent" }}
          >
            <span className="font-display block" style={{ color: "var(--text-1)", fontSize: "0.85rem" }}>Full book</span>
            <span style={{ color: "var(--text-2)", fontSize: "0.72rem" }}>Higher cost and longer runtime. Best after one chunk looks good.</span>
          </button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-label">Chunk size in source PDF pages</span>
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
      </section>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading || metaLoading || busy}
        className="btn-primary justify-center py-3 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : counts.renderedPages > 0 ? <Sparkles size={16} /> : <Sparkles size={16} />}
        {busy ? "Generating..." : counts.renderedPages > 0 ? "Generate more manga" : "Generate manga"}
      </button>

      {(busy || activeStatus || latestBuildJob) && (
        <section className="border p-4 flex flex-col gap-2" style={{ borderColor: "var(--border)", background: "rgba(15,14,23,0.45)" }}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-display" style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>{progressLabel}</span>
            <span className="font-label" style={{ color: "var(--text-3)", fontSize: "0.68rem" }}>{Math.max(0, Math.min(100, progress))}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              style={{ background: "var(--blue)" }}
            />
          </div>
          <p style={{ color: "var(--text-3)", fontSize: "0.72rem", lineHeight: 1.45 }}>
            You can leave this page. When you come back, we continue from the last saved step.
          </p>
        </section>
      )}

      <section aria-label="Manga build status">
        <ol className="flex flex-col gap-2">
          {stages.map(stage => <PipelineRow key={stage.id} stage={stage} />)}
        </ol>
      </section>

      {message && <p className="font-label" style={{ color: "var(--text-3)", fontSize: "9px", lineHeight: 1.5 }}>{message}</p>}
      {error && (
        <div className="flex items-start gap-2 p-3 border" style={{ borderColor: "var(--red)", background: "rgba(232,25,26,0.08)", color: "#ffb3ad" }}>
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <p className="font-label" style={{ fontSize: "9px", lineHeight: 1.5 }}>{error}</p>
        </div>
      )}

      {counts.renderedPages > 0 && selectedProject && (
        <button
          type="button"
          onClick={() => router.push(`/books/${book.id}/manga/v2?project=${selectedProject.id}`)}
          className="flex items-center justify-center gap-2 py-2.5 border font-label"
          style={{ borderColor: "var(--amber)", color: "var(--amber)", fontSize: "10px" }}
        >
          <Eye size={13} /> Open manga reader ({counts.renderedPages})
        </button>
      )}

      <section className="border p-4 flex flex-col gap-3" style={{ borderColor: "var(--border)", background: "rgba(15,14,23,0.35)" }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen(open => !open)}
          className="flex items-center justify-between gap-2 text-left"
          aria-expanded={advancedOpen}
        >
          <span className="font-display" style={{ color: "var(--text-1)", fontSize: "0.9rem" }}>Advanced</span>
          {advancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {advancedOpen && (
          <div className="flex flex-col gap-3">
            {projects.length > 1 && (
              <label className="flex flex-col gap-1">
                <span className="text-label">Workspace</span>
                <select
                  value={selectedProjectId}
                  onChange={event => setSelectedProjectId(event.target.value)}
                  className="px-3 py-2 border bg-transparent font-label"
                  style={{ borderColor: "var(--border)", color: "var(--text-1)", fontSize: "11px" }}
                >
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.title?.trim() || `${displayBookTitle(book)} manga workspace`} - {project.status}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p style={{ color: "var(--text-3)", fontSize: "0.72rem", lineHeight: 1.45 }}>{describeSlice(nextSlice)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => selectedProject && router.push(`/books/${book.id}/manga/v2/characters?project=${selectedProject.id}`)}
                disabled={!selectedProject}
                className="flex items-center justify-center gap-2 py-2.5 border font-label disabled:opacity-45"
                style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}
              >
                <Users size={13} /> Character library
              </button>
              <button
                type="button"
                onClick={() => selectedProject && router.push(`/books/${book.id}/manga/v2?project=${selectedProject.id}`)}
                disabled={!selectedProject || counts.renderedPages === 0}
                className="flex items-center justify-center gap-2 py-2.5 border font-label disabled:opacity-45"
                style={{ borderColor: "var(--border)", color: "var(--text-2)", fontSize: "10px" }}
              >
                <Eye size={13} /> Reader
              </button>
            </div>
            {selectedProject && <BookSpine project={selectedProject} />}
          </div>
        )}
      </section>
    </section>
  );
}
