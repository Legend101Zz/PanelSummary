"use client";

/**
 * GeneratePanel.tsx \u2014 Book-detail "generate a summary" UI
 * ===========================================================
 * Extracted from ``app/books/[id]/page.tsx`` because the page-level route
 * was approaching 750 lines and had three large sub-components inlined into
 * it. The page route should be a layout + composition; complex feature
 * components belong here under ``components/``.
 *
 * Responsibilities:
 *   - Pick provider + API key + model + style + engine + image-gen options.
 *   - Optionally constrain large PDFs to a chapter range.
 *   - Fire ``startSummarization`` and poll ``getJobStatus`` until done.
 *   - Surface live progress via ``PipelineTracker`` + ``LogFeed``.
 *
 * Non-responsibilities (kept in the page route):
 *   - Listing existing summaries, deleting them, generating reels from them.
 *
 * The component is intentionally a single function: splitting it further
 * (e.g. one component per section) would be aesthetic decomposition. Each
 * section here owns local UI state that is small and trivial; lifting it
 * into separate components would create more wiring than it saves. The
 * 600-line file budget is for the file, not for any single component, and
 * this file is comfortably under that.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Lock, ExternalLink, EyeOff, Eye, Image as ImageIcon,
  Zap, Loader2, X,
} from "lucide-react";
import { startSummarization, getJobStatus } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { STYLE_OPTIONS } from "@/lib/types";
import { ModelSelector } from "@/components/ModelSelector";
import { PipelineTracker } from "@/components/PipelineTracker";
import { LogFeed } from "@/components/LogFeed";
import type { LogEntry } from "@/components/LogFeed";
import { LargePdfWarning, PAGE_LIMIT } from "@/components/LargePdfWarning";
import { GenerationFacts } from "@/components/GenerationFacts";
import type { Book, SummaryStyle, LLMProvider } from "@/lib/types";

interface GeneratePanelProps {
  book: Book;
  /** Called with the new summary id when generation finishes. */
  onComplete: (sid: string) => void;
}

/**
 * Default image-model menu shown when "Generate Panel Images" is enabled.
 * Hard-coded because the OpenRouter image-model catalogue is small and
 * stable; the upstream image-models API is consulted in the generation
 * pipeline, not in the picker here.
 */
const DEFAULT_IMAGE_MODELS: { id: string; name: string }[] = [
  { id: "google/gemini-2.5-flash-image",            name: "Gemini 2.5 Flash Image \u2014 $2.50/1M (cheapest)" },
  { id: "google/gemini-3.1-flash-image-preview",    name: "Gemini 3.1 Flash Image Preview \u2014 $3/1M" },
  { id: "google/gemini-3-pro-image-preview",        name: "Gemini 3 Pro Image Preview \u2014 $12/1M (best quality)" },
];

export function GeneratePanel({ book, onComplete }: GeneratePanelProps) {
  const { apiKey, provider, model, setApiKey, selectedStyle, setSelectedStyle } = useAppStore();

  const [localKey, setLocalKey]     = useState(apiKey ?? "");
  const [localProv, setLocalProv]   = useState<LLMProvider>(provider === "openai" ? "openrouter" : provider);
  const [localModel, setLocalModel] = useState(model ?? "google/gemini-2.5-flash");
  const [showKey, setShowKey]       = useState(false);
  const [keyError, setKeyError]     = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genImages, setGenImages]   = useState(false);
  const [selectedEngine, setSelectedEngine] = useState<"v2" | "v4">("v2");
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODELS[0].id);
  const [chapterRange, setChapterRange] = useState<[number, number] | null>(null);
  const [showLargePdf, setShowLargePdf] = useState(false);
  const [rangeChosen, setRangeChosen]   = useState(false);
  const [log, setLog]               = useState<LogEntry[]>([]);
  const [taskId, setTaskId]         = useState<string | null>(null);
  const pollingRef                  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pipeline state \u2014 fed by structured progress data from backend.
  const [pipeline, setPipeline] = useState({
    phase: null as string | null,
    panelsDone: 0,
    panelsTotal: 0,
    costSoFar: 0,
    estimatedCost: null as number | null,
  });

  // Books with too many pages or chapters get the "pick a range" prompt
  // before we hand them off to the backend; this protects user budget.
  const isLarge = (book.total_pages ?? 0) > PAGE_LIMIT || (book.total_chapters ?? 0) > 12;

  const push = (pct: number, msg: string, opts?: Partial<LogEntry>) =>
    setLog(prev => [...prev, { pct, msg, ...opts }]);

  useEffect(() => {
    if (!taskId) return;
    pollingRef.current = setInterval(async () => {
      try {
        const s = await getJobStatus(taskId);
        push(s.progress, s.message);

        // Update pipeline state from structured backend data.
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
          push(100, "Complete! Opening manga reader\u2026", { done: true });
          setGenerating(false);
          setTimeout(() => onComplete(s.result_id!), 1200);
        }
        if (s.status === "failure") {
          clearInterval(pollingRef.current!);
          push(0, s.error ?? "Generation failed", { error: true });
          setGenerating(false);
        }
      } catch {
        // Polling errors are intentionally swallowed: the backend job is
        // authoritative, transient network blips shouldn't crash the UI.
      }
    }, 2000);
    return () => clearInterval(pollingRef.current!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const handleGenerate = async () => {
    const key = localKey.trim();
    if (!key) { setKeyError("Enter your API key above"); return; }
    if (localProv === "openai" && !key.startsWith("sk-")) { setKeyError("OpenAI keys start with sk-"); return; }
    if (localProv === "openrouter" && !key.startsWith("sk-or")) { setKeyError("OpenRouter keys start with sk-or"); return; }

    // For large books, prompt the user if they haven't chosen a range yet.
    if (isLarge && !rangeChosen) {
      setShowLargePdf(true);
      return;
    }

    setKeyError(null);
    setApiKey(key, localProv, localModel);
    setGenerating(true);
    setLog([]);
    push(0, "Queuing generation task\u2026");
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
      push(2, `Task received \u00b7 model: ${localModel}`);
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
            placeholder={localProv === "openai" ? "sk-proj-\u2026" : "sk-or-v1-\u2026"}
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
              Max {4} splash images \u00b7 via OpenRouter
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

      {/* Image model picker \u2014 shown only when image gen is enabled */}
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
              {DEFAULT_IMAGE_MODELS.map(opt => (
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

      {/* Engine selector */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-label" style={{ fontSize: "10px", color: "var(--text-1)" }}>Rendering Engine</p>
          <p className="font-label" style={{ fontSize: "8px", color: "var(--text-3)" }}>
            V2 = verbose DSL \u00b7 V4 = semantic intent (faster, cheaper)
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
            \u2713 Chapters {chapterRange[0]+1}\u2013{chapterRange[1]+1} selected
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
          {isLarge && !rangeChosen ? "Choose Chapter Range \u2192" : "Generate Summary"}
        </motion.button>
      ) : (
        <div className="w-full py-3.5 flex items-center justify-center gap-2 font-label border"
          style={{ borderColor: "var(--border)", color: "var(--text-3)", background: "var(--surface-2)", fontSize: "11px" }}>
          <Loader2 size={13} className="animate-spin" /> Running\u2026
        </div>
      )}

      {/* Generation in progress \u2014 pipeline + facts + status */}
      <AnimatePresence>
        {generating && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-3">
            <PipelineTracker
              phase={pipeline.phase}
              progress={log.at(-1)?.pct ?? 0}
              panelsDone={pipeline.panelsDone}
              panelsTotal={pipeline.panelsTotal}
              costSoFar={pipeline.costSoFar}
              estimatedCost={pipeline.estimatedCost}
              message={log.at(-1)?.msg ?? "Initializing..."}
            />
            <div className="flex items-start gap-2 px-3 py-2 border"
              style={{ borderColor: "rgba(245,166,35,0.2)", background: "rgba(245,166,35,0.03)" }}>
              <span style={{ fontSize: "14px" }}>\u2615</span>
              <p className="font-label" style={{ color: "var(--amber)", fontSize: "9px", lineHeight: 1.5 }}>
                This takes ~1\u20133 min per chapter. You can open another tab and come back \u2014
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
