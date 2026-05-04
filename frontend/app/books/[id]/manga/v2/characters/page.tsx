"use client";

/**
 * Character Library page — Phase B4.
 *
 * One-line purpose:
 *   Show every persisted character sheet for a manga project, grouped
 *   by character, with the B2 sprite-quality verdict baked in, so a
 *   user can pin keepers and regenerate the duds before kicking off
 *   panel rendering.
 *
 * Why a dedicated page instead of stuffing this into the v2 reader?
 *   The reader's mental model is "I'm reading a comic". The Library's
 *   mental model is "I'm curating reusable assets". Mixing them in one
 *   route conflates two interaction loops and hurts both. The reader's
 *   asset sidebar (still there) becomes a quick glance; this route is
 *   the editorial workbench.
 *
 * Data flow:
 *   On mount we fetch the project (for its character_world_bible) and
 *   the assets list. The bible gives us character profile prose to
 *   render alongside each character's grid; the assets list is the
 *   page-owned source of truth that AssetCard mutates via callback.
 */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";

import {
  getMangaProject,
  listBookMangaProjects,
  listMangaProjectAssets,
  materializeCharacterSheets,
} from "@/lib/api";
import { useAppStore } from "@/lib/store";
import type { MangaAssetDoc, MangaProject, MissingExpression } from "@/lib/types";
import { AssetCard } from "@/components/CharacterLibrary/AssetCard";

// Loose mirror of backend CharacterDesign — kept as `any`-friendly
// because the bible is persisted as a generic dict on MangaProject;
// strict types would force an unrelated migration. The keys we
// touch (character_id, name, role, visual_lock, …) are stable.
interface BibleCharacter {
  character_id: string;
  name: string;
  role: string;
  represents?: string;
  personality?: string;
  visual_lock?: string;
  silhouette_notes?: string;
  outfit_notes?: string;
  speech_style?: string;
}

interface CharacterWorldBibleLite {
  characters: BibleCharacter[];
  visual_style?: string;
}

// Group assets by character_id while preserving the bible's character
// order — so the page reads top-to-bottom in the same order the
// LLM authored the cast list.
function groupAssets(
  assets: MangaAssetDoc[],
  bible: CharacterWorldBibleLite | null,
): { character: BibleCharacter | null; characterId: string; assets: MangaAssetDoc[] }[] {
  const byCharacter = new Map<string, MangaAssetDoc[]>();
  for (const asset of assets) {
    const list = byCharacter.get(asset.character_id) ?? [];
    list.push(asset);
    byCharacter.set(asset.character_id, list);
  }

  const orderedIds: string[] = [];
  if (bible?.characters) {
    for (const char of bible.characters) {
      if (byCharacter.has(char.character_id)) orderedIds.push(char.character_id);
    }
  }
  // Tail any orphan asset character_ids not present in the bible —
  // shouldn't happen in practice but we don't want to silently hide them.
  for (const id of byCharacter.keys()) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }

  return orderedIds.map(characterId => ({
    characterId,
    character: bible?.characters?.find(c => c.character_id === characterId) ?? null,
    assets: byCharacter.get(characterId) ?? [],
  }));
}

interface StatusTallies {
  ready: number;
  review: number;
  failed: number;
  unchecked: number;
}

function tallyStatuses(assets: MangaAssetDoc[]): StatusTallies {
  const tallies: StatusTallies = { ready: 0, review: 0, failed: 0, unchecked: 0 };
  for (const asset of assets) {
    if (asset.status === "ready") tallies.ready += 1;
    else if (asset.status === "review_required") tallies.review += 1;
    else if (asset.status === "failed") tallies.failed += 1;
    else tallies.unchecked += 1;
  }
  return tallies;
}

export default function CharacterLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: bookId } = use(params);
  const { apiKey } = useAppStore();
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get("project");

  const [project, setProject] = useState<MangaProject | null>(null);
  const [assets, setAssets] = useState<MangaAssetDoc[]>([]);
  // Phase 3.1: planner gaps from the same /assets call. State-owned at
  // page level (not derived from `assets`) because the gap list is
  // computed server-side against the planner output, not just the rows
  // we happen to have in memory.
  const [missingExpressions, setMissingExpressions] = useState<MissingExpression[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [fillMessage, setFillMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let projectId = projectIdParam;
      if (!projectId) {
        const list = await listBookMangaProjects(bookId);
        projectId = list.projects[0]?.id ?? null;
      }
      if (!projectId) {
        setProject(null);
        setAssets([]);
        return;
      }
      const [projectRes, assetRes] = await Promise.all([
        getMangaProject(projectId),
        listMangaProjectAssets(projectId),
      ]);
      setProject(projectRes.project);
      setAssets(assetRes.assets);
      setMissingExpressions(assetRes.missing_expressions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load character library");
    } finally {
      setLoading(false);
    }
  }, [bookId, projectIdParam]);

  useEffect(() => { load(); }, [load]);

  const bible = useMemo<CharacterWorldBibleLite | null>(
    () => (project?.character_world_bible as CharacterWorldBibleLite | undefined) ?? null,
    [project?.character_world_bible],
  );
  const grouped = useMemo(() => groupAssets(assets, bible), [assets, bible]);
  const tallies = useMemo(() => tallyStatuses(assets), [assets]);

  const handleAssetUpdated = useCallback((next: MangaAssetDoc) => {
    setAssets(prev => prev.map(asset => (asset.id === next.id ? next : asset)));
  }, []);

  const handleFillMissing = async () => {
    if (!project) return;
    const key = apiKey?.trim() ?? null;
    setFilling(true);
    setFillMessage(null);
    setError(null);
    try {
      const result = await materializeCharacterSheets(project.id, key);
      setAssets(result.assets);
      // "Fill missing" reruns the planner; the gap list is implicitly
      // empty afterwards (anything still missing is the user's choice
      // not to provide an API key for image gen). Refresh from /assets
      // so the UI shows whatever the server now considers a gap.
      try {
        const refreshed = await listMangaProjectAssets(project.id);
        setMissingExpressions(refreshed.missing_expressions ?? []);
      } catch {
        // Non-fatal: leave the prior gap list in place rather than
        // false-clear it on a transient list-call failure.
      }
      setFillMessage(
        result.generated_count > 0
          ? `Filled in ${result.generated_count} missing sheet${result.generated_count > 1 ? "s" : ""}.`
          : "Library already complete — no new sheets generated.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fill missing sheets");
    } finally {
      setFilling(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "#0F0E17", color: "#F0EEE8" }}>
        <Loader2 className="animate-spin mr-2" size={18} /> Loading character library…
      </main>
    );
  }

  if (error && !project) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center" style={{ background: "#0F0E17", color: "#F0EEE8" }}>
        <AlertCircle size={42} style={{ color: "#ea1100" }} />
        <h1 className="font-display text-2xl">Could not load character library</h1>
        <p style={{ color: "#A8A6C0" }}>{error}</p>
        <Link href={`/books/${bookId}`} className="px-4 py-2 border" style={{ borderColor: "#ffc220", color: "#ffc220" }}>
          Back to book
        </Link>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center" style={{ background: "#0F0E17", color: "#F0EEE8" }}>
        <Sparkles size={42} style={{ color: "#ffc220" }} />
        <h1 className="font-display text-2xl">No manga project yet</h1>
        <p style={{ color: "#A8A6C0", maxWidth: 520 }}>
          Create a v2 manga project for this book first — the library lives inside a project.
        </p>
        <Link href={`/books/${bookId}`} className="px-4 py-2 border" style={{ borderColor: "#ffc220", color: "#ffc220" }}>
          Back to book
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: "#0F0E17", color: "#F0EEE8" }}>
      <header className="sticky top-0 z-20 border-b" style={{ background: "#17161F", borderColor: "#2E2C3F" }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href={`/books/${bookId}`} className="flex items-center gap-2 text-sm" style={{ color: "#ffc220" }}>
            <ArrowLeft size={15} /> Book
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display flex items-center gap-2" style={{ fontSize: "1rem" }}>
              <Users size={16} /> Character Library
            </h1>
            <p className="truncate" style={{ color: "#A8A6C0", fontSize: "0.7rem" }}>
              {project.title || "Untitled project"} · {assets.length} sheet{assets.length === 1 ? "" : "s"}
              {bible?.visual_style ? ` · style: ${bible.visual_style}` : ""}
            </p>
          </div>
          <Link
            href={`/books/${bookId}/manga/v2?project=${project.id}`}
            className="px-3 py-1.5 border font-label"
            style={{ borderColor: "#ffc220", color: "#ffc220", fontSize: "0.7rem" }}
          >
            Read manga →
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Status tallies + global actions */}
        <section className="border p-4 flex flex-wrap items-center gap-4" style={{ borderColor: "#2E2C3F", background: "#17161F" }}>
          <StatusPill icon={<CheckCircle2 size={14} />} label="Ready" count={tallies.ready} fg="#2a8703" />
          <StatusPill icon={<AlertCircle size={14} />} label="Review" count={tallies.review} fg="#995213" />
          <StatusPill icon={<XCircle size={14} />} label="Failed" count={tallies.failed} fg="#ea1100" />
          <StatusPill icon={<Sparkles size={14} />} label="Unchecked" count={tallies.unchecked} fg="#A8A6C0" />
          {/* Phase 3.1: "Missing" is structurally different from the four
              status tallies (it counts gaps, not asset rows) so we use the
              same pill component but feed it a different source-of-truth
              count. Hidden when zero to avoid celebrating a non-event. */}
          {missingExpressions.length > 0 && (
            <StatusPill
              icon={<AlertCircle size={14} />}
              label="Missing"
              count={missingExpressions.length}
              fg="#ea1100"
            />
          )}

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleFillMissing}
            disabled={filling}
            className="flex items-center gap-2 px-3 py-2 border disabled:opacity-40"
            style={{ borderColor: "#0053e2", color: "#0053e2", fontSize: "0.7rem" }}
            title="Re-run the planner; only missing assets get generated. Idempotent."
          >
            {filling ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
            Fill missing sheets
          </button>
        </section>

        {error && (
          <div className="flex items-start gap-2 border p-3" style={{ borderColor: "#ea1100", color: "#ffb3ad", background: "rgba(234,17,0,0.08)" }}>
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <p style={{ fontSize: "0.75rem" }}>{error}</p>
          </div>
        )}
        {fillMessage && (
          <p style={{ color: "#A8A6C0", fontSize: "0.75rem" }}>{fillMessage}</p>
        )}

        {grouped.length === 0 ? (
          <div className="border p-8 text-center" style={{ borderColor: "#2E2C3F", background: "#17161F" }}>
            <Sparkles size={32} className="mx-auto mb-3" style={{ color: "#ffc220" }} />
            <p style={{ color: "#F0EEE8" }}>No character sheets yet.</p>
            <p className="mt-2" style={{ color: "#A8A6C0", fontSize: "0.8rem" }}>
              Run book understanding from the Manga V2 Lab, then come back here.
            </p>
          </div>
        ) : (
          grouped.map(group => (
            <section
              key={group.characterId}
              className="border p-4 flex flex-col gap-4"
              style={{ borderColor: "#2E2C3F", background: "#17161F" }}
            >
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display" style={{ color: "#F0EEE8", fontSize: "1.1rem" }}>
                  {group.character?.name ?? group.characterId}
                </h2>
                {group.character?.role && (
                  <span className="font-label" style={{ color: "#ffc220", fontSize: "0.7rem" }}>
                    {group.character.role.toUpperCase()}
                  </span>
                )}
                <span className="font-label" style={{ color: "#A8A6C0", fontSize: "0.65rem" }}>
                  {group.assets.length} sheet{group.assets.length === 1 ? "" : "s"}
                </span>
              </header>

              {group.character && (
                <CharacterProfile character={group.character} />
              )}

              {/* Phase 3.1: missing-expression chips. Calling these out per
                  character is more useful than a global "N gaps" badge
                  because the user fixes them in the same place they curate
                  the assets. We split reference-sheet vs expression copy
                  because they fail differently: a missing reference sheet
                  is a regenerate, a missing expression is a planner gap. */}
              {(() => {
                const gaps = missingExpressions.filter(g => g.character_id === group.characterId);
                if (gaps.length === 0) return null;
                return (
                  <div
                    className="flex flex-wrap items-center gap-2 border px-3 py-2"
                    style={{ borderColor: "#995213", background: "rgba(255,194,32,0.08)" }}
                  >
                    <AlertCircle size={13} style={{ color: "#995213" }} />
                    <span className="font-label" style={{ color: "#995213", fontSize: "0.65rem" }}>
                      MISSING
                    </span>
                    {gaps.map((gap, idx) => (
                      <span
                        key={`${gap.character_id}-${gap.asset_type}-${gap.expression}-${idx}`}
                        className="px-2 py-0.5 border"
                        style={{
                          borderColor: gap.asset_type === "reference_sheet" ? "#ea1100" : "#995213",
                          color: gap.asset_type === "reference_sheet" ? "#ea1100" : "#F0EEE8",
                          fontSize: "0.6rem",
                        }}
                        title={
                          gap.asset_type === "reference_sheet"
                            ? "Reference sheet missing \u2014 panel renderer has nothing to condition on. Run 'Fill missing sheets'."
                            : "Expression missing \u2014 panels asking for it will fall back to the reference sheet."
                        }
                      >
                        {gap.expression}
                        {gap.asset_type === "reference_sheet" ? " (ref)" : ""}
                      </span>
                    ))}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {group.assets.map(asset => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    projectId={project.id}
                    apiKey={apiKey}
                    onAssetUpdated={handleAssetUpdated}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

function StatusPill({
  icon,
  label,
  count,
  fg,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  fg: string;
}) {
  return (
    <div className="flex items-center gap-1.5 font-label" style={{ color: fg, fontSize: "0.7rem" }}>
      {icon}
      <span>
        {count} {label}
      </span>
    </div>
  );
}

// Character profile prose. Read-only in B4 — editing the bible is a
// separate (still-design-stage) feature; until then, surfacing the
// LLM's authored description gives the user enough context to judge
// whether each generated sheet matches the intent.
function CharacterProfile({ character }: { character: BibleCharacter }) {
  const rows: Array<[string, string | undefined]> = [
    ["Represents", character.represents],
    ["Personality", character.personality],
    ["Visual lock", character.visual_lock],
    ["Silhouette", character.silhouette_notes],
    ["Outfit", character.outfit_notes],
    ["Speech", character.speech_style],
  ];
  const filled = rows.filter(([, value]) => value && value.trim().length > 0);
  if (filled.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5" style={{ fontSize: "0.7rem" }}>
      {filled.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <dt className="font-label flex-shrink-0" style={{ color: "#ffc220", fontSize: "0.6rem", minWidth: "70px" }}>
            {label.toUpperCase()}
          </dt>
          <dd style={{ color: "#A8A6C0" }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
