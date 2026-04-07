"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen, Zap, Film, Video, Loader2, CheckCircle,
  AlertCircle, Eye, Lock, ExternalLink,
  EyeOff, Pencil, Check, Trash2, Image as ImageIcon,
  ChevronRight, Info, X, FileText
} from "lucide-react";
import {
  getBook, getBookSummaries, startSummarization,
  getJobStatus, getImageUrl, updateBookTitle, deleteSummary, generateReels,
  generateVideoReel, getVideoReelsForBook,
} from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { STYLE_OPTIONS } from "@/lib/types";
import { ModelSelector } from "@/components/ModelSelector";
import { PipelineTracker } from "@/components/PipelineTracker";
import { LogFeed } from "@/components/LogFeed";
import { LargePdfWarning, PAGE_LIMIT } from "@/components/LargePdfWarning";
import { StatusBadge, TitleEditor } from "@/components/BookWidgets";
import type { LogEntry } from "@/components/LogFeed";
import { getImageModels } from "@/lib/api";
import { GenerationFacts } from "@/components/GenerationFacts";
import type { Book, SummaryListItem, SummaryStyle, LLMProvider } from "@/lib/types";

// ─── GENERATE PANEL ─────────────────────────────────────────
// ─── GENERATE PANEL ─────────────────────────────────────────
function GeneratePanel({ book, onComplete }: { book: Book; onComplete: (sid: string) => void }) {
  const { apiKey, provider, model, setApiKey, selectedStyle, setSelectedStyle } = useAppStore();

  const [localKey, setLocalKey]     = useState(apiKey ?? "");
  const [localProv, setLocalProv]   = useState<LLMProvider>(provider === "openai" ? "openrouter" : provider);
  const [localModel, setLocalModel] = useState(model ?? "google/gemini-2.5-flash");
  const [showKey, setShowKey]       = useState(false);
  const [keyError, setKeyError]     = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genImages, setGenImages]   = useState(false);
  const [selectedEngine, setSelectedEngine] = useState<"v2" | "v4">("v2");
  const [imageModel, setImageModel] = useState("google/gemini-2.5-flash-image");
  const [imageModelOptions, setImageModelOptions] = useState<{id:string;name:string}[]>([
    { id: "google/gemini-2.5-flash-image",            name: "Gemini 2.5 Flash Image — $2.50/1M (cheapest)" },
    { id: "google/gemini-3.1-flash-image-preview",    name: "Gemini 3.1 Flash Image Preview — $3/1M" },
    { id: "google/gemini-3-pro-image-preview",        name: "Gemini 3 Pro Image Preview — $12/1M (best quality)" },
  ]);
  const [chapterRange, setChapterRange] = useState<[number, number] | null>(null);
  const [showLargePdf, setShowLargePdf] = useState(false);
  const [rangeChosen, setRangeChosen]   = useState(false);
  const [log, setLog]               = useState<LogEntry[]>([]);
  const [taskId, setTaskId]         = useState<string | null>(null);
  const pollingRef                  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pipeline state — fed by structured progress data from backend
  const [pipeline, setPipeline] = useState({
    phase: null as string | null,
    panelsDone: 0,
    panelsTotal: 0,
    costSoFar: 0,
    estimatedCost: null as number | null,
  });

  // Show large PDF warning automatically for big books
  const isLarge = (book.total_pages ?? 0) > PAGE_LIMIT || (book.total_chapters ?? 0) > 12;

  const push = (pct: number, msg: string, opts?: Partial<LogEntry>) =>
    setLog(prev => [...prev, { pct, msg, ...opts }]);

  useEffect(() => {
    if (!taskId) return;
    pollingRef.current = setInterval(async () => {
      try {
        const s = await getJobStatus(taskId);
        push(s.progress, s.message);

        // Update pipeline state from structured backend data
        setPipeline(prev => ({
          phase: s.phase ?? prev.phase,
          panelsDone: s.panels_done ?? prev.panelsDone,
          panelsTotal: s.panels_total ?? prev.panelsTotal,
          costSoFar: s.cost_so_far ?? prev.costSoFar,
          estimatedCost: s.estimated_total_cost ?? prev.estimatedCost,
        }));

        if (s.status === "success") {
          clearInterval(pollingRef.current!);
          setPipeline(prev => ({ ...prev, phase: "complete" }));
          push(100, "Complete! Opening manga reader…", { done: true });
          setGenerating(false);
          setTimeout(() => onComplete(s.result_id!), 1200);
        }
        if (s.status === "failure") {
          clearInterval(pollingRef.current!);
          push(0, s.error ?? "Generation failed", { error: true });
          setGenerating(false);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(pollingRef.current!);
  }, [taskId]);

  const handleGenerate = async () => {
    const key = localKey.trim();
    if (!key) { setKeyError("Enter your API key above"); return; }
    if (localProv === "openai" && !key.startsWith("sk-")) { setKeyError("OpenAI keys start with sk-"); return; }
    if (localProv === "openrouter" && !key.startsWith("sk-or")) { setKeyError("OpenRouter keys start with sk-or"); return; }

    // For large books, prompt the user if they haven't chosen a range yet
    if (isLarge && !rangeChosen) {
      setShowLargePdf(true);
      return;
    }

    setKeyError(null);
    setApiKey(key, localProv, localModel);
    setGenerating(true);
    setLog([]);
    push(0, "Queuing generation task…");
    try {
      const res = await startSummarization(book.id, {
        apiKey: key,
        provider: localProv,
        model: localModel,
        style: selectedStyle,
        chapterRange,
        generateImages: genImages,
        imageModel: genImages ? imageModel : undefined,
        engine: selectedEngine,
      });
      setTaskId(res.task_id);
      push(2, `Task received · model: ${localModel}`);
    } catch (e: any) {
      push(0, e?.message ?? "Failed to start", { error: true });
      setGenerating(false);
    }
  };

  return (
    <div className="panel p-5 flex flex-col gap-4">
      <div className="panel-label">GENERATE SUMMARY</div>
      <div className="mt-2">
        <p className="font-display text-xl" style={{ fontFamily: "var(--font-display)", color: "var(--text-1)" }}>Transform with AI</p>
        <p className="text-sm mt-0.5" style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          Pick a model, enter your key, launch.
        </p>
      </div>

      {/* Provider tabs */}
      <div className="flex gap-2">
        {(["openrouter", "openai"] as LLMProvider[]).map(p => (
          <button key={p} onClick={() => !generating && setLocalProv(p)} disabled={generating}
            className="flex-1 py-1.5 font-label border transition-all"
            style={{ fontSize: "10px", borderColor: localProv === p ? "var(--amber)" : "var(--border)",
              background: localProv === p ? "rgba(245,166,35,0.08)" : "var(--surface-2)",
              color: localProv === p ? "var(--amber)" : "var(--text-3)" }}>
            {p === "openrouter" ? "OpenRouter" : "OpenAI"}
          </button>
        ))}
      </div>

      {/* API key */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Lock size={10} style={{ color: "var(--text-3)" }} />
          <span className="text-label">API KEY (never stored)</span>
          <a href={localProv === "openai" ? "https://platform.openai.com/api-keys" : "https://openrouter.ai/keys"}
            target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-label hover:underline"
            style={{ color: "var(--blue)", fontSize: "9px" }}>
            Get key <ExternalLink size={8} />
          </a>
        </div>
        <div className="relative">
          <input type={showKey ? "text" : "password"} value={localKey}
            onChange={e => { setLocalKey(e.target.value); setKeyError(null); }}
            disabled={generating}
            placeholder={localProv === "openai" ? "sk-proj-…" : "sk-or-v1-…"}
            className="w-full px-3 py-2.5 pr-9 text-sm border outline-none font-label"
            style={{ background: "var(--surface-2)", color: "var(--text-1)", fontSize: "11px",
              borderColor: keyError ? "var(--red)" : localKey ? "var(--amber)" : "var(--border)" }} />
          <button type="button" onClick={() => setShowKey(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }}>
            {showKey ? <EyeOff size={13}/> : <Eye size={13}/>}
          </button>
        </div>
        {keyError && <p className="font-label mt-1" style={{ color: "var(--red)", fontSize: "9px" }}>{keyError}</p>}
      </div>

      {/* Model selector (OpenRouter only) */}
      {localProv === "openrouter" && (
        <div>
          <p className="text-label mb-1.5">MODEL</p>
          <ModelSelector
            apiKey={localKey}
            value={localModel}
            onChange={setLocalModel}
            disabled={generating}
          />
          <p className="font-label mt-1" style={{ fontSize: "9px", color: "var(--text-3)" }}>
            Recommended: google/gemini-2.5-flash (fastest, best JSON reliability)
          </p>
        </div>
      )}

      {/* Style picker */}
      <div>
        <p className="text-label mb-1.5">STYLE</p>
        <div className="grid grid-cols-5 gap-1.5">
          {STYLE_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => !generating && setSelectedStyle(opt.value as SummaryStyle)}
              disabled={generating}
              className="flex flex-col items-center gap-1 py-2 border transition-all"
              style={{ borderColor: selectedStyle === opt.value ? opt.colors.primary : "var(--border)",
                background: selectedStyle === opt.value ? `${opt.colors.primary}12` : "var(--surface-2)" }}>
              <span className="text-base leading-none">{opt.emoji}</span>
              <span className="font-label" style={{ fontSize: "7px",
                color: selectedStyle === opt.value ? opt.colors.primary : "var(--text-3)" }}>
                {opt.label.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Generate Images toggle */}
      <label className="flex items-center justify-between cursor-pointer">
        <div className="flex items-center gap-2">
          <ImageIcon size={13} style={{ color: genImages ? "var(--teal)" : "var(--text-3)" }} />
          <div>
            <p className="font-label" style={{ fontSize: "10px", color: "var(--text-1)" }}>Generate Panel Images</p>
            <p className="font-label" style={{ fontSize: "8px", color: "var(--text-3)" }}>
              Max {4} splash images · via OpenRouter
            </p>
          </div>
        </div>
        <button onClick={() => !generating && setGenImages(g => !g)} disabled={generating}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: genImages ? "var(--teal)" : "var(--border-2)" }}>
          <motion.div animate={{ x: genImages ? 18 : 2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow" />
        </button>
      </label>

      {/* Image model picker — shown only when image gen is enabled */}
      <AnimatePresence>
        {genImages && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex flex-col gap-1.5 pl-2 border-l-2" style={{ borderColor: "var(--teal)" }}>
              <p className="text-label" style={{ fontSize: "9px", color: "var(--teal)" }}>IMAGE MODEL</p>
              {imageModelOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => !generating && setImageModel(opt.id)}
                  disabled={generating}
                  className="w-full text-left px-3 py-2 border transition-colors"
                  style={{
                    borderColor: imageModel === opt.id ? "var(--teal)" : "var(--border)",
                    background: imageModel === opt.id ? "rgba(0,191,165,0.08)" : "var(--surface-2)",
                  }}
                >
                  <p className="font-label" style={{ fontSize: "9px", color: imageModel === opt.id ? "var(--teal)" : "var(--text-2)" }}>
                    {opt.name}
                  </p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Large PDF warning (inline, collapsible) */}

      {/* Engine selector */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-label" style={{ fontSize: "10px", color: "var(--text-1)" }}>Rendering Engine</p>
          <p className="font-label" style={{ fontSize: "8px", color: "var(--text-3)" }}>
            V2 = verbose DSL · V4 = semantic intent (faster, cheaper)
          </p>
        </div>
        <div className="flex gap-1">
          {(["v2", "v4"] as const).map(eng => (
            <button
              key={eng}
              onClick={() => !generating && setSelectedEngine(eng)}
              disabled={generating}
              className="px-3 py-1 rounded text-xs font-bold transition-all"
              style={{
                background: selectedEngine === eng
                  ? (eng === "v4" ? "#2A8703" : "#0053e2")
                  : "var(--bg-3)",
                color: selectedEngine === eng ? "#fff" : "var(--text-3)",
                border: `1px solid ${selectedEngine === eng ? "transparent" : "var(--border-2)"}`,
                fontFamily: "var(--font-label)",
                letterSpacing: "0.08em",
              }}
            >
              {eng.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Large PDF warning (inline, collapsible) */}
      <AnimatePresence>
        {showLargePdf && !rangeChosen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <LargePdfWarning
              totalPages={book.total_pages}
              totalChapters={book.total_chapters}
              chapters={book.chapters}
              onChoice={range => {
                setChapterRange(range);
                setRangeChosen(true);
                setShowLargePdf(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Range chosen confirmation */}
      {rangeChosen && chapterRange && (
        <div className="flex items-center justify-between px-3 py-2 border"
          style={{ borderColor: "rgba(0,191,165,0.3)", background: "rgba(0,191,165,0.06)" }}>
          <p className="font-label" style={{ fontSize: "9px", color: "var(--teal)" }}>
            ✓ Chapters {chapterRange[0]+1}–{chapterRange[1]+1} selected
          </p>
          <button onClick={() => { setRangeChosen(false); setChapterRange(null); }}
            style={{ color: "var(--text-3)" }}><X size={10} /></button>
        </div>
      )}

      {/* Launch */}
      {!generating ? (
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={handleGenerate}
          className="btn-primary w-full justify-center py-3.5 text-base gap-2"
          style={{ fontFamily: "var(--font-display)" }}>
          <Zap size={17} />
          {isLarge && !rangeChosen ? "Choose Chapter Range →" : "Generate Summary"}
        </motion.button>
      ) : (
        <div className="w-full py-3.5 flex items-center justify-center gap-2 font-label border"
          style={{ borderColor: "var(--border)", color: "var(--text-3)", background: "var(--surface-2)", fontSize: "11px" }}>
          <Loader2 size={13} className="animate-spin" /> Running…
        </div>
      )}

      {/* Generation in progress — pipeline + facts + status */}
      <AnimatePresence>
        {generating && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-3">
            {/* Pipeline Tracker */}
            <PipelineTracker
              phase={pipeline.phase}
              progress={log.at(-1)?.pct ?? 0}
              panelsDone={pipeline.panelsDone}
              panelsTotal={pipeline.panelsTotal}
              costSoFar={pipeline.costSoFar}
              estimatedCost={pipeline.estimatedCost}
              message={log.at(-1)?.msg ?? "Initializing..."}
            />
            {/* Background hint */}
            <div className="flex items-start gap-2 px-3 py-2 border"
              style={{ borderColor: "rgba(245,166,35,0.2)", background: "rgba(245,166,35,0.03)" }}>
              <span style={{ fontSize: "14px" }}>☕</span>
              <p className="font-label" style={{ color: "var(--amber)", fontSize: "9px", lineHeight: 1.5 }}>
                This takes ~1–3 min per chapter. You can open another tab and come back —
                generation continues in the background.
              </p>
            </div>
            <GenerationFacts visible={generating} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live log */}
      <AnimatePresence>
        {log.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <LogFeed entries={log} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SUMMARY ROW ────────────────────────────────────────────
function SummaryRow({ summary, bookId, onDeleted }: { summary: SummaryListItem; bookId: string; onDeleted: () => void }) {
  const opt = STYLE_OPTIONS.find(s => s.value === summary.style);
  const [deleting, setDeleting] = useState(false);
  const [generatingReels, setGeneratingReels] = useState(false);
  const [generatingVideoReel, setGeneratingVideoReel] = useState(false);
  const [reelTaskId, setReelTaskId] = useState<string | null>(null);
  const [reelDone, setReelDone] = useState(false);
  const [videoReelMsg, setVideoReelMsg] = useState<string | null>(null);
  const { apiKey, provider, model } = useAppStore();
  const router = useRouter();

  /** Get API key — prompt if missing */
  const ensureApiKey = (): string | null => {
    let key = apiKey;
    if (!key) {
      key = prompt("Enter your OpenRouter API key:");
      if (!key) return null;
      const store = useAppStore.getState();
      store.setApiKey(key, store.provider, store.model ?? undefined);
    }
    return key;
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("Delete this summary?")) return;
    setDeleting(true);
    try { await deleteSummary(summary.id); onDeleted(); } catch {}
    setDeleting(false);
  };

  const handleGenerateReels = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const key = ensureApiKey();
    if (!key) return;
    setGeneratingReels(true);
    try {
      const res = await generateReels(summary.id, { apiKey: key, provider: provider as LLMProvider, model: model ?? undefined });
      if (res.task_id) {
        setReelTaskId(res.task_id);
        const poll = async () => {
          const status = await getJobStatus(res.task_id!);
          if (status.status === "success") { setReelDone(true); setGeneratingReels(false); onDeleted(); }
          else if (status.status === "failure") { setGeneratingReels(false); alert("Reel generation failed"); }
          else setTimeout(poll, 2000);
        };
        poll();
      } else {
        setReelDone(true); setGeneratingReels(false);
      }
    } catch { setGeneratingReels(false); }
  };

  const handleGenerateVideoReel = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const key = ensureApiKey();
    if (!key) return;
    setGeneratingVideoReel(true);
    setVideoReelMsg("Starting...");
    try {
      const res = await generateVideoReel(summary.id, key, provider, model ?? undefined);
      if (res.task_id) {
        const poll = async () => {
          const status = await getJobStatus(res.task_id);
          setVideoReelMsg(status.message || "Generating...");
          if (status.status === "success") {
            setGeneratingVideoReel(false);
            setVideoReelMsg(null);
            router.push(`/video-reels?book=${bookId}`);
          } else if (status.status === "failure") {
            setGeneratingVideoReel(false);
            setVideoReelMsg(null);
            alert(`Video reel failed: ${status.error || "Unknown error"}`);
          } else {
            setTimeout(poll, 2500);
          }
        };
        poll();
      }
    } catch (err: any) {
      setGeneratingVideoReel(false);
      setVideoReelMsg(null);
      alert(`Error: ${err.message}`);
    }
  };

  const hasReels = summary.total_reels > 0 || reelDone;

  return (
    <motion.div whileHover={{ x: 3 }} className="panel px-4 py-3">
      <div className="flex items-center justify-between">
        <Link href={`/books/${bookId}/manga?summary=${summary.id}`} className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xl">{opt?.emoji}</span>
          <div className="min-w-0">
            <p className="font-label capitalize" style={{ color: "var(--text-1)", fontSize: "11px" }}>{summary.style} Style</p>
            <p className="text-label" style={{ fontSize: "9px" }}>
              {summary.total_chapters} ch · {hasReels ? `${summary.total_reels} reels` : "no reels yet"}
              {summary.estimated_cost_usd > 0 && ` · $${summary.estimated_cost_usd.toFixed(3)}`}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={summary.status} />
          {summary.status === "complete" && (
            <>
              <Link href={`/books/${bookId}/manga?summary=${summary.id}`} title="Read manga">
                <BookOpen size={14} style={{ color: "var(--amber)" }} />
              </Link>
              {hasReels ? (
                <Link href={`/reels?summary=${summary.id}`} title="View lesson reels">
                  <Film size={14} style={{ color: "var(--red)" }} />
                </Link>
              ) : (
                <button
                  onClick={handleGenerateReels}
                  disabled={generatingReels}
                  title="Generate lesson reels"
                  className="flex items-center gap-1 px-2 py-0.5 border"
                  style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: "8px", fontFamily: "var(--font-label)", opacity: generatingReels ? 0.6 : 1 }}
                >
                  {generatingReels ? <Loader2 size={10} className="animate-spin" /> : <Film size={10} />}
                  {generatingReels ? "..." : "REELS"}
                </button>
              )}
              {/* Video Reel generate button */}
              <button
                onClick={handleGenerateVideoReel}
                disabled={generatingVideoReel}
                title="Generate a video reel from this summary"
                className="flex items-center gap-1 px-2 py-0.5 border"
                style={{
                  borderColor: "var(--amber)",
                  color: "var(--amber)",
                  fontSize: "8px",
                  fontFamily: "var(--font-label)",
                  opacity: generatingVideoReel ? 0.6 : 1,
                  background: generatingVideoReel ? "rgba(245,166,35,0.06)" : "transparent",
                }}
              >
                {generatingVideoReel ? <Loader2 size={10} className="animate-spin" /> : <Video size={10} />}
                {generatingVideoReel ? "..." : "🎬 VIDEO"}
              </button>
            </>
          )}
          <button onClick={handleDelete} disabled={deleting} style={{ color: "var(--text-3)" }} title="Delete">
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>
      {/* Progress message for video reel generation */}
      {videoReelMsg && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="mt-2 flex items-center gap-2 px-2 py-1.5"
          style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.15)" }}
        >
          <Loader2 size={10} className="animate-spin flex-shrink-0" style={{ color: "var(--amber)" }} />
          <p className="font-label" style={{ color: "var(--amber)", fontSize: "9px" }}>{videoReelMsg}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────
export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [book, setBook]           = useState<Book | null>(null);
  const [title, setTitle]         = useState("");
  const [summaries, setSummaries] = useState<SummaryListItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, sums] = await Promise.all([getBook(id), getBookSummaries(id).catch(() => [])]);
      setBook(b); setTitle(b.title); setSummaries(sums);
    } catch { setError("Book not found"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <Loader2 size={28} className="animate-spin" style={{ color: "var(--amber)" }} />
    </div>
  );

  if (error || !book) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: "var(--bg)" }}>
      <AlertCircle size={40} style={{ color: "var(--red)" }} />
      <p className="font-display text-2xl" style={{ fontFamily: "var(--font-display)" }}>{error}</p>
      <Link href="/" className="text-label" style={{ color: "var(--amber)" }}>← Back</Link>
    </div>
  );

  const coverUrl    = getImageUrl(book.cover_image_id);
  const isParsed    = book.status === "parsed";
  const hasComplete = summaries.some(s => s.status === "complete");
  const firstDone   = summaries.find(s => s.status === "complete");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="fixed inset-0 opacity-25 pointer-events-none"
        style={{ backgroundImage: "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-10">

        {/* ── BOOK HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex gap-6 mb-10">
          {/* Cover */}
          <div className="flex-shrink-0">
            {coverUrl
              ? <img src={coverUrl} alt={title} className="w-28 h-40 object-cover border-2" style={{ borderColor: "var(--border)" }} />
              : <div className="w-28 h-40 border-2 flex items-center justify-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <BookOpen size={28} style={{ color: "var(--text-3)" }} />
                </div>
            }
          </div>

          {/* Meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="chapter-badge">CH.02 — BOOK DETAIL</span>
              <StatusBadge status={book.status} />
            </div>

            <TitleEditor bookId={id} initial={title} onSaved={t => setTitle(t)} />

            {book.author && <p className="mt-1 mb-2" style={{ color: "var(--text-3)", fontFamily: "var(--font-body)", fontSize: "0.9rem" }}>by {book.author}</p>}
            <div className="flex flex-wrap gap-4 mb-4 font-label" style={{ color: "var(--text-3)", fontSize: "10px" }}>
              <span>{book.total_pages} pages</span><span>·</span>
              <span>{book.total_chapters} chapters</span>
              {book.total_words > 0 && <><span>·</span><span>~{Math.ceil(book.total_words / 200)} min read</span></>}
            </div>

            <div className="flex flex-wrap gap-3">
              {hasComplete && (
                <>
                  <Link href={`/books/${id}/manga?summary=${firstDone?.id}`}>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn-primary py-2.5 px-5 text-sm gap-2">
                      <Eye size={14} /> Read Manga
                    </motion.div>
                  </Link>
                  <Link href={`/reels?summary=${firstDone?.id}`}>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn-secondary py-2.5 px-5 text-sm gap-2">
                      <Film size={14} /> Watch Reels
                    </motion.div>
                  </Link>
                  <Link href={`/video-reels?book=${id}`}>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 py-2.5 px-5 border text-sm font-label transition-colors"
                      style={{ borderColor: "var(--red)", color: "var(--red)", background: "var(--surface)", fontSize: "11px" }}>
                      <Video size={14} /> Video Reels
                    </motion.div>
                  </Link>
                </>
              )}
              <Link href={`/books/${id}/read`}>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 py-2.5 px-5 border text-sm font-label transition-colors"
                  style={{ borderColor: "var(--border-2)", color: "var(--text-2)", background: "var(--surface)",
                    fontSize: "11px" }}>
                  <FileText size={14} /> Read PDF
                </motion.div>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* ── MAIN GRID ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">

          {/* Left */}
          <div className="flex flex-col gap-4">
            {isParsed && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <GeneratePanel book={book} onComplete={sid => router.push(`/books/${id}/manga?summary=${sid}`)} />
              </motion.div>
            )}

            {summaries.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-label">SUMMARIES</span>
                  <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                </div>
                <div className="flex flex-col gap-2">
                  {summaries.map(s => (
                    <SummaryRow key={s.id} summary={s} bookId={id} onDeleted={load} />
                  ))}
                </div>
              </motion.div>
            )}

            {!isParsed && summaries.length === 0 && (
              <div className="panel p-5 flex items-center gap-3">
                <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: "var(--amber)" }} />
                <p className="font-label" style={{ color: "var(--text-3)", fontSize: "10px" }}>
                  {book.status === "parsing" ? "Parsing in progress…" : `Status: ${book.status}`}
                </p>
              </div>
            )}
          </div>

          {/* Right: chapters */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-label">SECTIONS DETECTED ({book.total_chapters})</span>
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            </div>
            <p className="font-label mb-3" style={{ color: "var(--text-3)", fontSize: "8px", lineHeight: 1.5 }}>
              Each heading/section in your PDF is treated as a chapter.
              Docling detected {book.total_chapters} sections across {book.total_pages} pages.
              Each section gets its own manga chapter + reel lesson.
            </p>
            <div className="flex flex-col gap-1.5">
              {book.chapters.map((ch, i) => (
                <motion.div key={ch.index}
                  initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                  className="panel flex items-center gap-3 px-3 py-2.5">
                  <span className="font-label w-6 text-right flex-shrink-0" style={{ color: "var(--text-3)", fontSize: "10px" }}>
                    {String(ch.index + 1).padStart(2, "0")}
                  </span>
                  <p className="flex-1 truncate text-sm" style={{ fontFamily: "var(--font-body)", color: "var(--text-2)" }}>
                    {ch.title}
                  </p>
                  <div className="flex gap-3 flex-shrink-0 font-label" style={{ color: "var(--text-3)", fontSize: "9px" }}>
                    <span>pp.{ch.page_start}–{ch.page_end}</span>
                    {ch.image_count > 0 && <span>📷{ch.image_count}</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
