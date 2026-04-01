"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen, Zap, Film, Loader2, CheckCircle,
  AlertCircle, Eye, Lock, ExternalLink,
  EyeOff, Pencil, Check, Trash2, Image as ImageIcon,
  ChevronRight, Info, X, FileText
} from "lucide-react";
import {
  getBook, getBookSummaries, startSummarization,
  getJobStatus, getImageUrl, updateBookTitle, deleteSummary, generateReels
} from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { STYLE_OPTIONS } from "@/lib/types";
import { ModelSelector } from "@/components/ModelSelector";
import { getImageModels } from "@/lib/api";
import { GenerationFacts } from "@/components/GenerationFacts";
import type { Book, SummaryListItem, SummaryStyle, LLMProvider } from "@/lib/types";

// ─── STATUS BADGE ───────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    pending:     { color: "var(--text-3)",  label: "Pending" },
    parsing:     { color: "var(--amber)",   label: "Parsing…" },
    parsed:      { color: "var(--teal)",    label: "Ready" },
    summarizing: { color: "var(--amber)",   label: "Summarizing…" },
    generating:  { color: "var(--amber)",   label: "Generating…" },
    complete:    { color: "var(--teal)",    label: "Complete" },
    failed:      { color: "var(--red)",     label: "Failed" },
  };
  const { color, label } = map[status] ?? { color: "var(--text-3)", label: status };
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-label border"
      style={{ color, borderColor: color, background: `${color}15`, fontSize: "10px" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ─── INLINE TITLE EDITOR ────────────────────────────────────
function TitleEditor({ bookId, initial, onSaved }: { bookId: string; initial: string; onSaved: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(initial);
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = async () => {
    if (!value.trim() || value === initial) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateBookTitle(bookId, value.trim());
      onSaved(value.trim());
    } catch {}
    setSaving(false);
    setEditing(false);
  };

  if (!editing) return (
    <div className="flex items-center gap-2 group">
      <h1 className="font-display leading-tight"
        style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem,4vw,2.8rem)", color: "var(--text-1)" }}>
        {initial}
      </h1>
      <button onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--text-3)" }} title="Rename">
        <Pencil size={14} />
      </button>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="bg-transparent border-b-2 outline-none font-display"
        style={{
          fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem,4vw,2.8rem)",
          color: "var(--text-1)", borderColor: "var(--amber)", minWidth: "200px",
        }}
      />
      <button onClick={save} disabled={saving} style={{ color: "var(--teal)" }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
      </button>
      <button onClick={() => { setEditing(false); setValue(initial); }} style={{ color: "var(--text-3)" }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ─── LIVE LOG FEED ───────────────────────────────────────────
interface LogEntry { pct: number; msg: string; done?: boolean; error?: boolean }

function LogFeed({ entries }: { entries: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [entries.length]);

  return (
    <div className="border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
        <div className="flex gap-1.5">
          {["var(--red)", "var(--amber)", "var(--teal)"].map((c, i) => (
            <div key={i} className="w-2 h-2 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <span className="font-label" style={{ color: "var(--text-3)", fontSize: "9px" }}>AI GENERATION LOG</span>
      </div>
      <div className="p-3 max-h-44 overflow-y-auto space-y-0.5">
        {entries.map((e, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            className="flex items-start gap-2 font-label text-xs">
            <span style={{ color: "var(--text-3)", minWidth: "28px", textAlign: "right" }}>{e.pct}%</span>
            <span style={{ color: e.error ? "var(--red)" : e.done ? "var(--teal)" : "var(--text-2)" }}>
              {e.error ? "✗ " : e.done ? "✓ " : "› "}{e.msg}
            </span>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>
      {entries.length > 0 && (
        <div className="xp-bar mx-3 mb-3">
          <motion.div className="xp-fill" animate={{ width: `${entries.at(-1)?.pct ?? 0}%` }} transition={{ duration: 0.35 }} />
        </div>
      )}
    </div>
  );
}

// ─── LARGE PDF WARNING ──────────────────────────────────────
const WORDS_PER_PAGE = 500;
const TOKEN_LIMIT    = 65_000;
const PAGE_LIMIT     = Math.floor(TOKEN_LIMIT / WORDS_PER_PAGE); // ~130 pages

interface PageChoiceProps {
  totalPages: number;
  totalChapters: number;
  chapters: { index: number; title: string; page_start: number; page_end: number; word_count: number }[];
  onChoice: (range: [number, number] | null) => void;
}

function LargePdfWarning({ totalPages, totalChapters, chapters, onChoice }: PageChoiceProps) {
  const [mode, setMode] = useState<"full" | "first" | "custom">("first");
  const [customEnd, setCustomEnd] = useState(Math.min(totalChapters - 1, 9));

  const estWords = (range: [number, number] | null) => {
    const chs = range ? chapters.filter(c => c.index >= range[0] && c.index <= range[1]) : chapters;
    return chs.reduce((s, c) => s + c.word_count, 0);
  };
  const estCost = (words: number) => ((words / 750) * 0.0002).toFixed(3);

  const selected: [number, number] | null =
    mode === "full"   ? null :
    mode === "first"  ? [0, Math.min(totalChapters - 1, 9)] :
                        [0, customEnd];

  const selWords = estWords(selected);

  return (
    <div className="panel p-4 border-amber" style={{ borderColor: "rgba(245,166,35,0.5)", background: "rgba(245,166,35,0.04)" }}>
      <div className="flex items-start gap-2 mb-4">
        <Info size={14} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="font-label" style={{ color: "var(--amber)", fontSize: "10px" }}>LARGE DOCUMENT DETECTED</p>
          <p className="text-sm mt-0.5" style={{ fontFamily: "var(--font-body)", color: "var(--text-2)" }}>
            This book has {totalPages} pages (~{Math.round(totalPages * WORDS_PER_PAGE / 1000)}K words).
            Processing all chapters in one job may exceed the {PAGE_LIMIT}-page token budget.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {([
          { key: "full",   label: "Full Book",        sub: `${totalChapters} chapters · may be slow/costly` },
          { key: "first",  label: "First 10 Chapters", sub: `Chapters 1–10 · recommended for big books` },
          { key: "custom", label: "Custom Range",      sub: "Choose end chapter" },
        ] as const).map(opt => (
          <label key={opt.key} className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="range-mode" value={opt.key}
              checked={mode === opt.key} onChange={() => setMode(opt.key)}
              style={{ marginTop: 3, accentColor: "var(--amber)" }} />
            <div>
              <p className="font-label" style={{ fontSize: "10px", color: "var(--text-1)" }}>{opt.label}</p>
              <p className="font-label" style={{ fontSize: "9px", color: "var(--text-3)" }}>{opt.sub}</p>
              {opt.key === "custom" && mode === "custom" && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="font-label" style={{ fontSize: "9px", color: "var(--text-3)" }}>Chapters 1 –</span>
                  <input type="range" min={1} max={totalChapters - 1}
                    value={customEnd} onChange={e => setCustomEnd(+e.target.value)}
                    style={{ accentColor: "var(--amber)", width: "100px" }} />
                  <span className="font-label" style={{ fontSize: "9px", color: "var(--amber)" }}>{customEnd + 1}</span>
                </div>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="font-label" style={{ fontSize: "9px", color: "var(--text-3)" }}>
          Est. ~{Math.round(selWords / 1000)}K words · ~${estCost(selWords)} at $0.20/1M tokens
        </p>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={() => onChoice(selected)}
          className="btn-primary py-1.5 px-4 text-xs gap-1.5"
          style={{ fontFamily: "var(--font-label)", fontSize: "10px" }}>
          <Zap size={12} /> Use This Range
        </motion.button>
      </div>
    </div>
  );
}

// ─── GENERATE PANEL ─────────────────────────────────────────
function GeneratePanel({ book, onComplete }: { book: Book; onComplete: (sid: string) => void }) {
  const { apiKey, provider, model, setApiKey, selectedStyle, setSelectedStyle } = useAppStore();

  const [localKey, setLocalKey]     = useState(apiKey ?? "");
  const [localProv, setLocalProv]   = useState<LLMProvider>(provider === "openai" ? "openrouter" : provider);
  const [localModel, setLocalModel] = useState(model ?? "qwen/qwen3.5-397b-a17b");
  const [showKey, setShowKey]       = useState(false);
  const [keyError, setKeyError]     = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genImages, setGenImages]   = useState(false);
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
        if (s.status === "success") {
          clearInterval(pollingRef.current!);
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
            Recommended: qwen/qwen3.5-397b-a17b · Try also qwq-32b or gemini-flash
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

      {/* Generation in progress — facts + status */}
      <AnimatePresence>
        {generating && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-3">
            {/* Simultaneous notice */}
            <div className="flex items-start gap-2 px-3 py-2 border"
              style={{ borderColor: "rgba(0,191,165,0.25)", background: "rgba(0,191,165,0.04)" }}>
              <span style={{ fontSize: "14px" }}>⚡</span>
              <p className="font-label" style={{ color: "var(--teal)", fontSize: "9px", lineHeight: 1.5 }}>
                Manga panels + Reels are generated simultaneously from the same canonical summary.
                One LLM call per chapter — no double billing.
              </p>
            </div>
            {/* Relax notice */}
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
  const [reelTaskId, setReelTaskId] = useState<string | null>(null);
  const [reelDone, setReelDone] = useState(false);
  const { apiKey, provider, model } = useAppStore();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("Delete this summary?")) return;
    setDeleting(true);
    try { await deleteSummary(summary.id); onDeleted(); } catch {}
    setDeleting(false);
  };

  const handleGenerateReels = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!apiKey) { alert("Please enter your API key first"); return; }
    setGeneratingReels(true);
    try {
      const res = await generateReels(summary.id, { apiKey, provider: provider as LLMProvider, model: model ?? undefined });
      if (res.task_id) {
        setReelTaskId(res.task_id);
        // Poll until done
        const poll = async () => {
          const status = await getJobStatus(res.task_id!);
          if (status.status === "success") { setReelDone(true); setGeneratingReels(false); onDeleted(); }
          else if (status.status === "failure") { setGeneratingReels(false); alert("Reel generation failed"); }
          else setTimeout(poll, 2000);
        };
        poll();
      } else {
        // Already had reels
        setReelDone(true); setGeneratingReels(false);
      }
    } catch { setGeneratingReels(false); }
  };

  const hasReels = summary.total_reels > 0 || reelDone;

  return (
    <motion.div whileHover={{ x: 3 }} className="panel flex items-center justify-between px-4 py-3">
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
              <Link href={`/reels?summary=${summary.id}`} title="View reels">
                <Film size={14} style={{ color: "var(--red)" }} />
              </Link>
            ) : (
              <button
                onClick={handleGenerateReels}
                disabled={generatingReels}
                title="Generate reels"
                className="flex items-center gap-1 px-2 py-0.5 border"
                style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: "8px", fontFamily: "var(--font-label)", opacity: generatingReels ? 0.6 : 1 }}
              >
                {generatingReels ? <Loader2 size={10} className="animate-spin" /> : <Film size={10} />}
                {generatingReels ? "..." : "REELS"}
              </button>
            )}
          </>
        )}
        <button onClick={handleDelete} disabled={deleting} style={{ color: "var(--text-3)" }} title="Delete">
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </div>
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
