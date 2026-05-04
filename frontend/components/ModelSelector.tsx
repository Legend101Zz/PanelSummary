"use client";

/**
 * ModelSelector.tsx
 * Fetches the OpenRouter model list, shows pricing, lets user pick.
 * Used inside the GeneratePanel when provider = "openrouter".
 */

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Search, ChevronDown, X, ExternalLink } from "lucide-react";
import { fetchOpenRouterModels } from "@/lib/api";
import axios from "axios";

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

type RawOpenRouterModel = {
  id?: string;
  name?: string;
  context_length?: number | string | null;
  architecture?: { modality?: string | null } | null;
  pricing?: { prompt?: string | number | null; completion?: string | number | null } | null;
};

function normalizeOpenRouterModels(rawModels: RawOpenRouterModel[]): ORModel[] {
  return rawModels
    .filter((model) => {
      const contextLength = Number(model.context_length ?? 0);
      const modality = String(model.architecture?.modality ?? "text->text");
      return Boolean(model.id) && contextLength >= 4000 && modality.includes("text");
    })
    .map((model) => {
      const pricing = model.pricing ?? {};
      const inputPrice = Number.parseFloat(String(pricing.prompt ?? "0")) * 1_000_000;
      const outputPrice = Number.parseFloat(String(pricing.completion ?? "0")) * 1_000_000;
      const safeInputPrice = Number.isFinite(inputPrice) ? inputPrice : 0;
      const safeOutputPrice = Number.isFinite(outputPrice) ? outputPrice : 0;
      const id = String(model.id);

      return {
        id,
        name: String(model.name ?? id),
        context_length: Number(model.context_length ?? 0),
        input_price_per_1m: Number(safeInputPrice.toFixed(4)),
        output_price_per_1m: Number(safeOutputPrice.toFixed(4)),
        is_free: safeInputPrice === 0 && safeOutputPrice === 0,
        provider: id.includes("/") ? id.split("/")[0] : "unknown",
      };
    })
    .sort((a, b) => Number(b.is_free) - Number(a.is_free) || a.input_price_per_1m - b.input_price_per_1m);
}

async function fetchModelsWithFallback(): Promise<ORModel[]> {
  try {
    const proxied = await fetchOpenRouterModels("");
    return proxied.models ?? [];
  } catch {
    const response = await axios.get("https://openrouter.ai/api/v1/models", { timeout: 15000 });
    return normalizeOpenRouterModels(response.data?.data ?? []);
  }
}

interface Props {
  apiKey: string;
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: Props) {
  const [open, setOpen]         = useState(false);
  const [models, setModels]     = useState<ORModel[]>([]);
  const [loading, setLoading]   = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [showAll, setShowAll]   = useState(false);

  const load = useCallback(async () => {
    if (models.length > 0 || loading) return;

    setLoading(true);
    setLoadError(null);
    try {
      const nextModels = await fetchModelsWithFallback();
      setModels(nextModels);
      if (nextModels.length === 0) {
        setLoadError("OpenRouter returned zero usable text models");
      }
    } catch {
      setLoadError("Could not load OpenRouter models");
    } finally {
      setLoading(false);
    }
  }, [loading, models.length]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 420,
    placement: "bottom" as "bottom" | "top",
  });

  // Compute trigger position + flip-up if no room below
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const GUTTER = 12;
    const PREFERRED_H = 420;

    const spaceBelow = viewportH - rect.bottom - GUTTER;
    const spaceAbove = rect.top - GUTTER;

    // Prefer below; flip up only if below is too cramped AND above has more room
    const placement: "bottom" | "top" =
      spaceBelow < 220 && spaceAbove > spaceBelow ? "top" : "bottom";

    const available = placement === "bottom" ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(220, Math.min(PREFERRED_H, available));

    setDropdownPos({
      top: placement === "bottom" ? rect.bottom + 4 : rect.top - maxHeight - 4,
      left: rect.left,
      width: rect.width,
      maxHeight,
      placement,
    });
  }, []);

  // Measure on open + on scroll/resize while open.
  // useLayoutEffect ensures position is calculated before the browser paints,
  // so the dropdown never renders at the default (0,0,width:0) position.
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updatePosition]);

  // Close on outside click + ESC
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-model-dropdown]") && !triggerRef.current?.contains(target)) {
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
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
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

      {/* Dropdown — portaled to body to escape overflow:hidden parents */}
      <AnimatePresence>
        {open && typeof document !== "undefined" && createPortal(
          <motion.div
            data-model-dropdown
            initial={{ opacity: 0, y: dropdownPos.placement === "top" ? 6 : -6, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: dropdownPos.placement === "top" ? 6 : -6, scaleY: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[9999] border shadow-2xl"
            style={{
              transformOrigin: dropdownPos.placement === "top" ? "bottom" : "top",
              background: "var(--surface)",
              borderColor: "var(--border-2)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
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
            <div className="overflow-y-auto" style={{ maxHeight: Math.max(120, dropdownPos.maxHeight - 90) }}>
              {loading ? (
                <div className="text-center py-6 text-label" style={{ color: "var(--text-3)", fontSize: "10px" }}>
                  LOADING MODELS…
                </div>
              ) : loadError ? (
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
                  NO MODELS FOUND
                </div>
              ) : (
                allFiltered.map(m => (
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
                ))
              )}
            </div>

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
          </motion.div>,
          document.body,
        )}
      </AnimatePresence>
    </div>
  );
}
