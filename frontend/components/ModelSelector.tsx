"use client";

/**
 * ModelSelector.tsx
 * Fetches the OpenRouter model list, shows pricing, lets user pick.
 * Used inside the GeneratePanel when provider = "openrouter".
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, ChevronDown, X, ExternalLink } from "lucide-react";
import { fetchOpenRouterModels } from "@/lib/api";

export interface ORModel {
  id: string;
  name: string;
  context_length: number;
  input_price_per_1m: number;
  output_price_per_1m: number;
  is_free: boolean;
  provider: string;
}

// Curated shortlist shown by default (best value models)
const FEATURED_IDS = [
  "google/gemini-2.5-flash",     // RECOMMENDED: fast, reliable JSON, cheap
  "google/gemini-2.0-flash-001",
  "google/gemini-flash-1.5",
  "qwen/qwen3-235b-a22b",
  "qwen/qwq-32b",
  "anthropic/claude-3-haiku",
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "deepseek/deepseek-chat",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-nemo",
  "qwen/qwen3.5-397b-a17b",     // slow for manga gen (~60s/call)
];

// Speed/reliability ratings for manga panel generation
const MODEL_BADGES: Record<string, { label: string; color: string }> = {
  "google/gemini-2.5-flash":     { label: "⚡ Recommended", color: "#2a8703" },
  "google/gemini-2.0-flash-001": { label: "⚡ Fast",   color: "#2a8703" },
  "google/gemini-flash-1.5":     { label: "⚡ Fast",   color: "#2a8703" },
  "openai/gpt-4o-mini":          { label: "⚡ Fast",   color: "#2a8703" },
  "deepseek/deepseek-chat":      { label: "⚡ Fast",   color: "#2a8703" },
  "anthropic/claude-3-haiku":    { label: "⚡ Fast",   color: "#2a8703" },
  "qwen/qwen3.5-397b-a17b":     { label: "🐢 Slow (~60s)", color: "#ea1100" },
};

const POPULAR_MODELS: ORModel[] = [
  {
    id: "google/gemini-2.5-flash",
    name: "Google: Gemini 2.5 Flash",
    context_length: 1_048_576,
    input_price_per_1m: 0.3,
    output_price_per_1m: 2.5,
    is_free: false,
    provider: "google",
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Google: Gemini 2.0 Flash",
    context_length: 1_048_576,
    input_price_per_1m: 0.1,
    output_price_per_1m: 0.4,
    is_free: false,
    provider: "google",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "OpenAI: GPT-4o-mini",
    context_length: 128_000,
    input_price_per_1m: 0.15,
    output_price_per_1m: 0.6,
    is_free: false,
    provider: "openai",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Anthropic: Claude 3.5 Sonnet",
    context_length: 200_000,
    input_price_per_1m: 3,
    output_price_per_1m: 15,
    is_free: false,
    provider: "anthropic",
  },
  {
    id: "qwen/qwen3-235b-a22b",
    name: "Qwen: Qwen3 235B A22B",
    context_length: 131_072,
    input_price_per_1m: 0.13,
    output_price_per_1m: 0.6,
    is_free: false,
    provider: "qwen",
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek: DeepSeek Chat",
    context_length: 64_000,
    input_price_per_1m: 0.14,
    output_price_per_1m: 0.28,
    is_free: false,
    provider: "deepseek",
  },
];

function priceLabel(m: ORModel): string {
  if (m.is_free) return "FREE";
  const inp = m.input_price_per_1m;
  if (inp < 0.1) return `$${inp.toFixed(3)}/1M`;
  return `$${inp.toFixed(2)}/1M`;
}

function ctxLabel(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M ctx`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ctx`;
  return `${n} ctx`;
}

async function fetchModelsWithFallback(apiKey: string): Promise<ORModel[]> {
  const proxied = await fetchOpenRouterModels(apiKey.trim());
  return proxied.models ?? [];
}

interface Props {
  apiKey: string;
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ apiKey, value, onChange, disabled }: Props) {
  const [open, setOpen]         = useState(false);
  const [models, setModels]     = useState<ORModel[]>(POPULAR_MODELS);
  const [loading, setLoading]   = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [showAll, setShowAll]   = useState(false);
  const [remoteLoaded, setRemoteLoaded] = useState(false);

  const load = useCallback(async () => {
    if (remoteLoaded || loading) return;

    setLoading(true);
    setLoadError(null);
    try {
      const nextModels = await fetchModelsWithFallback(apiKey);
      setModels(nextModels.length > 0 ? nextModels : POPULAR_MODELS);
      setRemoteLoaded(nextModels.length > 0);
      if (nextModels.length === 0) {
        setLoadError("OpenRouter returned zero usable text models; showing popular models");
      }
    } catch {
      setModels(POPULAR_MODELS);
      setLoadError("Could not load OpenRouter models; showing popular models");
      setRemoteLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [apiKey, loading, remoteLoaded]);

  useEffect(() => {
    setModels(POPULAR_MODELS);
    setLoadError(null);
    setShowAll(false);
    setRemoteLoaded(false);
  }, [apiKey]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Close on outside click + ESC
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-model-selector]")) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const featuredMatches = models.filter(m =>
    FEATURED_IDS.some(id => m.id === id || m.id.startsWith(id + ":") || m.id.startsWith(id + "-"))
  );
  const allFiltered = models.filter(m => {
    const q = search.toLowerCase();
    if (!q) return showAll || featuredMatches.length === 0 || featuredMatches.includes(m);
    return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q);
  });

  const selected = models.find(m => m.id === value);

  return (
    <div className="relative overflow-visible" data-model-selector>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen(o => !o);
          void load();
        }}
        disabled={disabled}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm border transition-colors"
        style={{
          background: "var(--surface-2)",
          borderColor: value ? "var(--amber)" : "var(--border)",
          color: "var(--text-1)",
          fontFamily: "var(--font-label)",
          fontSize: "11px",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span className="truncate">
          {selected ? selected.name : value || "Select model…"}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {selected && (
            <span
              className="text-label px-1.5 py-0.5"
              style={{
                background: selected.is_free ? "rgba(0,191,165,0.15)" : "rgba(245,166,35,0.12)",
                color: selected.is_free ? "var(--teal)" : "var(--amber)",
                fontSize: "8px",
              }}
            >
              {priceLabel(selected)}
            </span>
          )}
          <ChevronDown size={12} style={{ color: "var(--text-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </div>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            data-model-dropdown
            initial={{ opacity: 0, y: -6, scaleY: 0.98 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -6, scaleY: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-[9999] border shadow-2xl"
            style={{
              transformOrigin: "top",
              background: "var(--surface)",
              borderColor: "var(--border-2)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              overflow: "hidden",
            }}
          >
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
              <Search size={12} style={{ color: "var(--text-3)", flexShrink: 0 }} />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search models…"
                className="flex-1 bg-transparent outline-none text-xs"
                style={{ color: "var(--text-1)", fontFamily: "var(--font-label)" }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ color: "var(--text-3)" }}>
                  <X size={10} />
                </button>
              )}
            </div>

            {/* List — scrollable with explicit pixel height so it always shows */}
            <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
              {loadError && models.length === 0 ? (
                <div className="text-center py-6 text-label" style={{ color: "var(--red)", fontSize: "10px" }}>
                  <p>{loadError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setModels([]);
                      void load();
                    }}
                    className="mt-2 px-2 py-1 border"
                    style={{ borderColor: "var(--red)", color: "var(--red)" }}
                  >
                    RETRY
                  </button>
                </div>
              ) : allFiltered.length === 0 ? (
                <div className="text-center py-6 text-label" style={{ color: "var(--text-3)", fontSize: "10px" }}>
                  {loading ? "LOADING MODELS..." : "NO MODELS FOUND"}
                </div>
              ) : (
                <>
                  {loading && (
                    <div className="px-3 py-1.5 border-b text-label" style={{ borderColor: "var(--border)", color: "var(--text-3)", fontSize: "8px" }}>
                      Loading full OpenRouter list...
                    </div>
                  )}
                  {allFiltered.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { onChange(m.id); setOpen(false); }}
                      className="w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors border-b"
                      style={{
                        background: m.id === value ? "rgba(245,166,35,0.08)" : "transparent",
                        borderColor: "var(--border)",
                        borderBottomColor: "rgba(255,255,255,0.04)",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={e => (e.currentTarget.style.background = m.id === value ? "rgba(245,166,35,0.08)" : "transparent")}
                    >
                      {/* Provider badge */}
                      <span className="text-label px-1 py-0.5 flex-shrink-0 mt-0.5 capitalize"
                        style={{ background: "var(--surface-2)", color: "var(--text-3)", fontSize: "8px", border: "1px solid var(--border)" }}>
                        {m.provider.slice(0, 6)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate flex items-center gap-1.5" style={{ fontFamily: "var(--font-label)", fontSize: "10px", color: m.id === value ? "var(--amber)" : "var(--text-1)" }}>
                          {m.name}
                          {MODEL_BADGES[m.id] && (
                            <span style={{ fontSize: "7px", color: MODEL_BADGES[m.id].color, fontWeight: 600 }}>
                              {MODEL_BADGES[m.id].label}
                            </span>
                          )}
                        </p>
                        <p className="text-label" style={{ fontSize: "8px", color: "var(--text-3)" }}>
                          {ctxLabel(m.context_length)}
                        </p>
                      </div>
                      {/* Pricing */}
                      <div className="text-right flex-shrink-0">
                        <span className="text-label px-1.5 py-0.5"
                          style={{
                            background: m.is_free ? "rgba(0,191,165,0.12)" : "rgba(245,166,35,0.08)",
                            color: m.is_free ? "var(--teal)" : "var(--amber)",
                            fontSize: "8px",
                          }}>
                          {priceLabel(m)}
                        </span>
                        {!m.is_free && (
                          <p className="text-label mt-0.5" style={{ fontSize: "7px", color: "var(--text-3)" }}>
                            out ${m.output_price_per_1m.toFixed(m.output_price_per_1m < 0.1 ? 3 : 2)}/1M
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>

            {loadError && models.length > 0 && (
              <div className="px-3 py-1.5 border-t text-label" style={{ borderColor: "var(--border)", color: "var(--amber)", fontSize: "8px" }}>
                {loadError}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <button
                onClick={() => setShowAll(s => !s)}
                className="text-label hover:underline"
                style={{ fontSize: "9px", color: "var(--text-3)" }}
              >
                {showAll ? "Show featured only" : `Show all ${models.length} models`}
              </button>
              <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-label hover:underline"
                style={{ fontSize: "9px", color: "var(--blue)" }}>
                openrouter.ai <ExternalLink size={8} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
