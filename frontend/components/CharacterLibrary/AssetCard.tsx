"use client";

/**
 * AssetCard.tsx — One character-sheet card in the Character Library.
 *
 * Why split from the page?
 * -----------------------
 * Each card owns its own busy/error/optimistic-pin state. Hoisting that
 * to the page would force per-card state shapes in a parent map, which
 * is the kind of thing that turns a page component into a 600-line
 * God object. Local state is the simpler, more cohesive home.
 *
 * Responsibilities (single):
 * * Render an asset's image + headline metadata
 * * Surface the B2 sprite-quality gate verdict (status / score / checks)
 * * Provide pin and regenerate actions, calling back up to refresh
 *
 * What it deliberately does NOT do:
 * * Decide WHAT to refresh. The page passes ``onAssetUpdated`` so the
 *   page owns the assets list — single source of truth.
 * * Persist its own state across mounts. If the user navigates away,
 *   busy spinners reset. That's correct: the API call already succeeded
 *   (or failed) and the page-level data reflects it.
 */

import { useState } from "react";
import { AlertCircle, Loader2, Pin, PinOff, RefreshCw, Star } from "lucide-react";

import { getImageUrl, regenerateMangaAsset, setMangaAssetPin } from "@/lib/api";
import type { MangaAssetDoc } from "@/lib/types";

interface AssetCardProps {
  asset: MangaAssetDoc;
  projectId: string;
  // The page-level apiKey, only used for regenerate. Kept as a prop
  // (not pulled from store here) so this component is trivially
  // testable without a store provider.
  apiKey: string | null;
  onAssetUpdated: (next: MangaAssetDoc) => void;
}

// Map B2 status → visual treatment. Centralized so adding a new status
// (e.g. "censored") later is a single-line edit.
function statusVisual(status: string): { label: string; bg: string; fg: string; description: string } {
  switch (status) {
    case "ready":
      return {
        label: "READY",
        bg: "rgba(42,135,3,0.15)",
        fg: "#2a8703",
        description: "Passes all sprite-quality checks; renderer will use this.",
      };
    case "review_required":
      return {
        label: "REVIEW",
        bg: "rgba(255,194,32,0.15)",
        fg: "#995213",
        description: "Soft warnings only (e.g. busy background). Still usable.",
      };
    case "failed":
      return {
        label: "FAILED",
        bg: "rgba(234,17,0,0.15)",
        fg: "#ea1100",
        description: "At least one error-level check. Renderer will skip this asset; regenerate it.",
      };
    default:
      return {
        label: "UNCHECKED",
        bg: "rgba(168,166,192,0.15)",
        fg: "#A8A6C0",
        description: "Sprite-quality gate has not yet evaluated this asset.",
      };
  }
}

export function AssetCard({ asset, projectId, apiKey, onAssetUpdated }: AssetCardProps) {
  const [busy, setBusy] = useState<"pin" | "regen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = getImageUrl(asset.image_path);
  const visual = statusVisual(asset.status);

  const handleTogglePin = async () => {
    setBusy("pin");
    setError(null);
    try {
      const result = await setMangaAssetPin(projectId, asset.id, !asset.pinned);
      if (result.asset) onAssetUpdated(result.asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pin");
    } finally {
      setBusy(null);
    }
  };

  const handleRegenerate = async () => {
    const key = apiKey?.trim();
    if (!key) {
      setError("Add your API key in the main panel — regenerate calls the image model.");
      return;
    }
    setBusy("regen");
    setError(null);
    try {
      const result = await regenerateMangaAsset(projectId, asset.id, key);
      if (result.asset) onAssetUpdated(result.asset);
      else setError("Project doesn't have generate_images enabled. Run character-sheets with images first.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setBusy(null);
    }
  };

  // Quality checks → human-readable bullet list. We only render the
  // non-OK ones because OK is implicit when nothing is wrong. Keeping
  // OK rows would make the tooltip noisy and bury the actual signal.
  const flaggedChecks = asset.last_quality_checks.filter(
    check => check.severity && check.severity !== "ok",
  );

  return (
    <article
      className="border flex flex-col"
      style={{
        borderColor: asset.pinned ? "#ffc220" : "#2E2C3F",
        background: "#17161F",
      }}
    >
      <div className="relative aspect-square" style={{ background: "#0F0E17" }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${asset.character_id} — ${asset.expression || asset.asset_type}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-center px-3"
            style={{ color: "#A8A6C0", fontSize: "0.7rem" }}
          >
            Prompt-only sheet (no image generated)
          </div>
        )}

        {asset.pinned && (
          <div
            className="absolute top-2 left-2 px-2 py-1 flex items-center gap-1"
            style={{ background: "#ffc220", color: "#0F0E17", fontSize: "0.6rem" }}
            title="Pinned: panel renderer prefers this asset"
          >
            <Star size={10} /> PINNED
          </div>
        )}

        <div
          className="absolute top-2 right-2 px-2 py-1"
          style={{ background: visual.bg, color: visual.fg, fontSize: "0.6rem", fontWeight: 600 }}
          title={visual.description}
        >
          {visual.label}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2">
        <div>
          <p className="font-label truncate" style={{ color: "#F0EEE8", fontSize: "0.78rem" }}>
            {asset.character_id}
          </p>
          <p className="font-label truncate" style={{ color: "#A8A6C0", fontSize: "0.65rem" }}>
            {asset.expression || asset.asset_type}
            {asset.silhouette_match_score !== null && ` · silhouette ${asset.silhouette_match_score}/5`}
            {asset.regen_count > 0 && ` · regen ×${asset.regen_count}`}
          </p>
        </div>

        {flaggedChecks.length > 0 && (
          <details className="text-xs" style={{ color: "#A8A6C0" }}>
            <summary className="cursor-pointer" style={{ fontSize: "0.65rem" }}>
              {flaggedChecks.length} quality note{flaggedChecks.length > 1 ? "s" : ""}
            </summary>
            <ul className="mt-1 pl-3 flex flex-col gap-0.5" style={{ fontSize: "0.6rem" }}>
              {flaggedChecks.map((check, i) => (
                <li key={i}>
                  <span style={{ color: check.severity === "error" ? "#ea1100" : "#995213" }}>
                    [{check.severity}]
                  </span>{" "}
                  {check.check}
                  {check.details ? `: ${String(check.details)}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && (
          <div className="flex items-start gap-1" style={{ color: "#ea1100", fontSize: "0.6rem" }}>
            <AlertCircle size={10} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5 mt-1">
          <button
            type="button"
            onClick={handleTogglePin}
            disabled={busy !== null}
            className="flex items-center justify-center gap-1 py-1.5 border disabled:opacity-40"
            style={{
              borderColor: asset.pinned ? "#ffc220" : "#2E2C3F",
              color: asset.pinned ? "#ffc220" : "#F0EEE8",
              fontSize: "0.65rem",
            }}
            aria-label={asset.pinned ? "Unpin asset" : "Pin asset"}
          >
            {busy === "pin" ? (
              <Loader2 size={11} className="animate-spin" />
            ) : asset.pinned ? (
              <PinOff size={11} />
            ) : (
              <Pin size={11} />
            )}
            {asset.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={busy !== null}
            className="flex items-center justify-center gap-1 py-1.5 border disabled:opacity-40"
            style={{ borderColor: "#0053e2", color: "#0053e2", fontSize: "0.65rem" }}
            aria-label="Regenerate asset via image model"
          >
            {busy === "regen" ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            Regenerate
          </button>
        </div>
      </div>
    </article>
  );
}
