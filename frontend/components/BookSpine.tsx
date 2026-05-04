"use client";

/**
 * BookSpine — visualization of the run-once book understanding spine.
 * ===================================================================
 *
 * What it shows
 * -------------
 * The backend authors a SPINE for every manga project before any slice
 * is generated:
 *   1. Synopsis (logline + central thesis + emotional arc)
 *   2. Adaptation plan (protagonist contract: who/wants/why_cannot/what_they_do)
 *   3. Character bible (who appears, what they look like)
 *   4. Voice cards (how each character SOUNDS)
 *   5. Arc outline (Ki-Sho-Ten-Ketsu beats across the slices to come)
 *
 * Without this UI the user can't tell whether the system actually
 * understood the book before it spends LLM credits drawing it. With it,
 * a wrong synopsis is caught in five seconds rather than fifty pages.
 *
 * Why one component, not five
 * ---------------------------
 * Each section is small and tightly coupled to one source artifact;
 * splitting them would be premature abstraction. If this file ever
 * pushes 600 lines we revisit (per the puppy rules).
 */

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Compass,
  Loader2,
  Megaphone,
  RefreshCw,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";

import type {
  AdaptationPlan,
  ArcOutline,
  BookSynopsis,
  CharacterVoiceCardBundle,
  CharacterWorldBible,
  MangaProject,
} from "@/lib/types";

interface BookSpineProps {
  project: MangaProject;
  // Optional refresh callback; only the manga-project panel actually
  // needs the "force re-run" button so this stays optional.
  onRebuild?: () => void;
  rebuilding?: boolean;
}

export function BookSpine({ project, onRebuild, rebuilding = false }: BookSpineProps) {
  const status = project.understanding_status;

  // The spine is only meaningful when understanding is ready. For other
  // statuses we render a banner so the user is never staring at an empty
  // panel wondering "is something happening?".
  if (status === "running" || status === "pending") {
    return (
      <SpineFrame title="Preparing the book">
        <div
          className="flex items-center gap-3 p-3 border"
          style={{ borderColor: "#0053e2", color: "#A8A6C0", fontSize: "0.75rem" }}
        >
          <Loader2 size={16} className="animate-spin" style={{ color: "#0053e2" }} />
          Reading the whole book — synopsis, characters, arc, voice cards. This runs once per project.
        </div>
      </SpineFrame>
    );
  }

  if (status === "failed") {
    return (
      <SpineFrame title="Book understanding failed">
        <div
          className="flex items-start gap-3 p-3 border"
          style={{ borderColor: "#ea1100", color: "#ffb3ad", fontSize: "0.75rem", background: "rgba(234,17,0,0.08)" }}
        >
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p>{project.understanding_error || "An unknown error occurred during book understanding."}</p>
            {onRebuild && (
              <button
                type="button"
                onClick={onRebuild}
                disabled={rebuilding}
                className="mt-2 flex items-center gap-1.5 underline"
                style={{ color: "#ffc220" }}
              >
                {rebuilding ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Try again
              </button>
            )}
          </div>
        </div>
      </SpineFrame>
    );
  }

  // status === "ready" path. Each artifact is read only when the
  // understanding is ready, so we cast off the "may-be-empty" union.
  const synopsis = project.book_synopsis as BookSynopsis;
  const plan = project.adaptation_plan as AdaptationPlan;
  const bible = project.character_world_bible as CharacterWorldBible;
  const voice = project.character_voice_cards as CharacterVoiceCardBundle;
  const arc = project.arc_outline as ArcOutline;

  return (
    <SpineFrame title="Book spine" onRebuild={onRebuild} rebuilding={rebuilding}>
      <div className="flex flex-col gap-3">
        <SynopsisBlock synopsis={synopsis} plan={plan} />
        <ArcBlock arc={arc} />
        <CharactersBlock bible={bible} voice={voice} />
      </div>
    </SpineFrame>
  );
}

// ============================================================
// Subcomponents — kept private so the public surface stays tiny.
// ============================================================

function SpineFrame({
  title,
  children,
  onRebuild,
  rebuilding,
}: {
  title: string;
  children: React.ReactNode;
  onRebuild?: () => void;
  rebuilding?: boolean;
}) {
  return (
    <section
      className="border p-4 flex flex-col gap-3"
      style={{ borderColor: "#2E2C3F", background: "#17161F" }}
      aria-labelledby="book-spine-title"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="book-spine-title"
          className="font-display flex items-center gap-2"
          style={{ color: "#ffc220", fontSize: "0.95rem" }}
        >
          <BookOpen size={16} /> {title}
        </h2>
        {onRebuild && (
          <button
            type="button"
            onClick={onRebuild}
            disabled={rebuilding}
            className="flex items-center gap-1 font-label disabled:opacity-50"
            style={{ color: "#A8A6C0", fontSize: "0.65rem" }}
            aria-label="Rebuild book understanding"
          >
            {rebuilding ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Rebuild
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function SynopsisBlock({ synopsis, plan }: { synopsis: BookSynopsis; plan: AdaptationPlan }) {
  // Logline + thesis + protagonist contract are the three things every
  // downstream prompt re-stamps. If any of these read wrong here, the
  // whole manga will read wrong; surface them prominently.
  const contract = plan.protagonist_contract;
  return (
    <CollapsibleSection title="Synopsis & protagonist" icon={<Sparkles size={14} />} defaultOpen>
      <dl className="flex flex-col gap-2" style={{ fontSize: "0.72rem", color: "#F0EEE8" }}>
        <SpineField label="LOGLINE" value={synopsis.logline || plan.logline} />
        <SpineField label="CENTRAL THESIS" value={synopsis.central_thesis || plan.central_thesis} />
        {contract && (
          <>
            <SpineField label="WHO" value={contract.who} />
            <SpineField label="WANTS" value={contract.wants} />
            <SpineField label="WHY THEY CAN'T" value={contract.why_cannot_have_it} />
            <SpineField label="WHAT THEY DO" value={contract.what_they_do} />
          </>
        )}
        {synopsis.emotional_arc && synopsis.emotional_arc.length > 0 && (
          <SpineField
            label="EMOTIONAL ARC"
            value={synopsis.emotional_arc.slice(0, 5).join(" → ")}
          />
        )}
      </dl>
    </CollapsibleSection>
  );
}

function ArcBlock({ arc }: { arc: ArcOutline }) {
  if (!arc?.entries?.length) return null;
  return (
    <CollapsibleSection
      title={`Arc outline · ${arc.structure}`}
      icon={<Compass size={14} />}
      defaultOpen={false}
    >
      <ol className="flex flex-col gap-2" style={{ fontSize: "0.7rem", color: "#F0EEE8" }}>
        {arc.entries.map((entry) => (
          <li
            key={entry.slice_number}
            className="border p-2 flex flex-col gap-1"
            style={{ borderColor: "#2E2C3F" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-label" style={{ color: "#ffc220" }}>
                Slice {entry.slice_number}
              </span>
              <span className="font-label uppercase" style={{ color: "#A8A6C0", fontSize: "0.6rem" }}>
                {entry.role}
              </span>
            </div>
            <p>{entry.beat_summary}</p>
            {entry.emotional_target && (
              <p style={{ color: "#A8A6C0", fontSize: "0.66rem" }}>
                Emotional target: {entry.emotional_target}
              </p>
            )}
          </li>
        ))}
      </ol>
    </CollapsibleSection>
  );
}

function CharactersBlock({
  bible,
  voice,
}: {
  bible: CharacterWorldBible;
  voice: CharacterVoiceCardBundle;
}) {
  if (!bible?.characters?.length) return null;
  // Index voice cards by character_id so each card renders next to its
  // matching bible entry instead of in a separate disconnected list.
  const voiceById = new Map(
    (voice?.cards ?? []).map((card) => [card.character_id, card] as const),
  );
  return (
    <CollapsibleSection
      title={`Characters · ${bible.characters.length}`}
      icon={<Users size={14} />}
      defaultOpen={false}
    >
      <div className="flex flex-col gap-3" style={{ fontSize: "0.7rem", color: "#F0EEE8" }}>
        {bible.characters.map((character) => {
          const card = voiceById.get(character.character_id);
          return (
            <article
              key={character.character_id}
              className="border p-3 flex flex-col gap-2"
              style={{ borderColor: "#2E2C3F" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display" style={{ color: "#F0EEE8" }}>
                  {character.name}
                </span>
                <span className="font-label" style={{ color: "#A8A6C0", fontSize: "0.62rem" }}>
                  {character.role}
                </span>
              </div>
              {character.represents && (
                <p style={{ color: "#A8A6C0" }}>Represents: {character.represents}</p>
              )}
              {character.visual_lock && (
                <p style={{ color: "#A8A6C0" }}>Look: {character.visual_lock}</p>
              )}
              {card ? (
                <VoiceCardBlock card={card} />
              ) : (
                <p style={{ color: "#A8A6C0", fontStyle: "italic" }}>
                  No voice card on file.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

function VoiceCardBlock({ card }: { card: CharacterVoiceCardBundle["cards"][number] }) {
  return (
    <div
      className="border-l-2 pl-3 flex flex-col gap-1.5"
      style={{ borderColor: "#ffc220" }}
    >
      <div className="flex items-center gap-1.5 font-label" style={{ color: "#ffc220", fontSize: "0.62rem" }}>
        <Megaphone size={11} /> VOICE
      </div>
      <p>{card.core_attitude}</p>
      <p style={{ color: "#A8A6C0" }}>Rhythm: {card.speech_rhythm}</p>
      {card.vocabulary_do.length > 0 && (
        <p style={{ color: "#A8A6C0" }}>
          Uses: {card.vocabulary_do.slice(0, 6).join(", ")}
        </p>
      )}
      {card.vocabulary_dont.length > 0 && (
        <p style={{ color: "#A8A6C0" }}>
          Avoids: {card.vocabulary_dont.slice(0, 4).join(", ")}
        </p>
      )}
      {card.example_lines.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {card.example_lines.slice(0, 3).map((line, idx) => (
            <li
              key={idx}
              style={{ color: "#F0EEE8", fontStyle: "italic", fontSize: "0.66rem" }}
            >
              “{line}”
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpineField({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-label" style={{ color: "#A8A6C0", fontSize: "0.6rem" }}>
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  // Pure local state — there is nothing about open/close worth lifting
  // up to the parent. Adding global state for chevron toggles would be
  // YAGNI of the highest order.
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-label" style={{ color: "#F0EEE8", fontSize: "0.7rem" }}>
          <span style={{ color: "#ffc220" }}>{icon}</span>
          {title}
        </span>
        <span style={{ color: "#A8A6C0" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && children}
    </section>
  );
}

// Re-exported icon so the panel can spell its empty state with the same vocab.
export const SpineIcon = ScrollText;
