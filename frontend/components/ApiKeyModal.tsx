/**
 * ApiKeyModal.tsx — API Key Entry Modal
 * ========================================
 * Users enter their OpenAI or OpenRouter key here.
 * The key is NEVER stored — only kept in memory for the session.
 */

"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, Lock, ExternalLink, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import type { LLMProvider } from "@/lib/types";

interface ApiKeyModalProps {
  onClose: () => void;
  onSave: () => void;
}

const PROVIDERS: {
  id: LLMProvider;
  name: string;
  placeholder: string;
  link: string;
  description: string;
  defaultModel: string;
}[] = [
  {
    id: "openai",
    name: "OpenAI",
    placeholder: "sk-proj-...",
    link: "https://platform.openai.com/api-keys",
    description: "Best quality. $5 free credit to start.",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    placeholder: "sk-or-v1-...",
    link: "https://openrouter.ai/keys",
    description: "100+ models. Often cheaper. Free models available.",
    defaultModel: "anthropic/claude-3-haiku",
  },
];

export function ApiKeyModal({ onClose, onSave }: ApiKeyModalProps) {
  const { setApiKey, apiKey, provider: currentProvider } = useAppStore();

  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(currentProvider);
  const [key, setKey] = useState(apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentProviderInfo = PROVIDERS.find((p) => p.id === selectedProvider)!;

  const handleSave = () => {
    const trimmed = key.trim();

    if (!trimmed) {
      setError("Please enter an API key");
      return;
    }

    // Basic validation
    if (selectedProvider === "openai" && !trimmed.startsWith("sk-")) {
      setError("OpenAI keys start with 'sk-'");
      return;
    }
    if (selectedProvider === "openrouter" && !trimmed.startsWith("sk-or")) {
      setError("OpenRouter keys start with 'sk-or'");
      return;
    }

    setApiKey(trimmed, selectedProvider, currentProviderInfo.defaultModel);
    onSave();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="manga-panel p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-plasma" />
            <h2 className="font-display font-bold text-xl text-text-primary">
              Your API Key
            </h2>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security notice */}
        <div
          className="p-3 rounded-sm mb-5 text-xs font-mono leading-relaxed"
          style={{
            background: "rgba(0,245,255,0.05)",
            border: "1px solid rgba(0,245,255,0.2)",
            color: "var(--text-secondary)",
          }}
        >
          🔒 Your key is kept in memory only. It's never stored in our database,
          logs, or localStorage. You re-enter it each session.
        </div>

        {/* Provider selector */}
        <div className="mb-4">
          <p className="text-text-secondary text-sm mb-2">Provider:</p>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                className={`p-3 rounded-sm border text-left transition-all ${
                  selectedProvider === p.id
                    ? "border-plasma bg-plasma/10"
                    : "border-panel-border hover:border-plasma/40"
                }`}
              >
                <p className="font-display font-bold text-sm text-text-primary">{p.name}</p>
                <p className="text-text-muted text-xs mt-0.5">{p.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Key input */}
        <div className="mb-2">
          <p className="text-text-secondary text-sm mb-2">
            {currentProviderInfo.name} Key:
          </p>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError(null);
              }}
              placeholder={currentProviderInfo.placeholder}
              className="w-full px-3 py-2.5 pr-10 rounded-sm font-mono text-sm bg-panel-light border border-panel-border text-text-primary placeholder-text-muted focus:outline-none focus:border-plasma transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Get key link */}
        <a
          href={currentProviderInfo.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-plasma text-xs hover:underline mb-4"
        >
          <ExternalLink className="w-3 h-3" />
          Get your {currentProviderInfo.name} key →
        </a>

        {/* Error */}
        {error && (
          <p className="text-sakura text-sm mb-3">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-sm border border-panel-border text-text-secondary hover:text-text-primary transition-colors font-mono text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-sm font-display font-bold text-ink"
            style={{ background: "linear-gradient(135deg, var(--plasma), var(--plasma-dim))" }}
          >
            Save Key
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
