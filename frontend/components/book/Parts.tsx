"use client";

import { useEffect, useState } from "react";
import { getPreflight, type BookParts, type Preflight } from "@/lib/api";
import {
  CONTINUE_CHOOSE,
  CONTINUE_CHOOSE_DONE,
  CONTINUE_CHOOSE_LEGEND,
  CONTINUE_LEAD,
  CONTINUE_TITLE,
  PARTS_NOTE,
  PARTS_TITLE,
  continueLabel,
  partLabel,
  partStatusWord,
  preflightLines,
} from "@/lib/words";
import { Button, Card, Checkbox, Notice, TextLink, formatCount } from "@/components/ui";
import { continueSelection, pdfRange, toggleSection } from "./bookLogic";
import styles from "./Parts.module.css";

/**
 * The parts of a book as one series (D39): "Part 2 · pages 23–40", each with a link to its own reader.
 * The reader keeps numbering an edition from 1. The series numbers are only on this page.
 */
export function PartsList({ bookId, parts }: { bookId: string; parts: BookParts }) {
  return (
    <Card as="section" className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title} id="parts-title">
          {PARTS_TITLE}
        </h2>
        <p className={styles.meta}>{PARTS_NOTE}</p>
      </div>
      <ol className={styles.list} aria-labelledby="parts-title">
        {parts.parts.map((p) => {
          const word = partStatusWord(p.status, p.pages_failed);
          const readable = p.pages_accepted > 0 || p.pages_failed > 0;
          return (
            <li key={p.edition_id} className={styles.row}>
              <div className={styles.what}>
                <span className={styles.label}>{partLabel(p.part, p.first_page_number, p.last_page_number)}</span>
                <span className={styles.sections}>{p.section_titles.length > 0 ? p.section_titles.join(", ") : "The whole book"}</span>
                {word ? <span className={styles.status}>{word}</span> : null}
              </div>
              {readable ? (
                <TextLink href={`/books/${bookId}/read?edition=${p.edition_id}&page=1`} className={styles.read}>
                  Read part {p.part}
                </TextLink>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/**
 * "Continue with the next section" (D39): shown after a finished part when sections remain after it. One button starts the next
 * part with `continue_from`; "Choose other sections" lets the person pick several. It never holds the words of the Generate button.
 */
export function ContinueNext({
  bookId,
  parts,
  pending,
  refusal,
  narrow,
  onContinue,
}: {
  bookId: string;
  parts: BookParts;
  pending: boolean;
  refusal: string | null;
  narrow: boolean;
  onContinue: (continueFrom: string, sectionIds: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const selected = continueSelection(chosen, parts.remaining);
  const titles = parts.remaining.filter((s) => selected.includes(s.id)).map((s) => s.title);
  const [estimate, setEstimate] = useState<Preflight | null | undefined>(undefined);
  const key = selected.join(",");

  // The estimate of a continuation is the estimate of its scope: the new text only (the prior adds a little reading).
  useEffect(() => {
    if (selected.length === 0) {
      setEstimate(null);
      return;
    }
    let live = true;
    setEstimate(undefined);
    const t = setTimeout(() => {
      getPreflight(bookId, { section_ids: key.split(",") }).then((p) => live && setEstimate(p));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, key]);

  const lines = estimate ? preflightLines(estimate) : null;
  const off = selected.length === 0 || pending || estimate?.within_limits === false;
  const why = pending ? undefined : selected.length === 0 ? "Choose at least one section." : estimate?.within_limits === false ? estimate.blocking_reasons.join(" ") : undefined;
  const from = parts.continue_from;
  if (!from) return null;

  return (
    <Card as="section" className={styles.card}>
      <h2 className={styles.title} id="continue-title">
        {CONTINUE_TITLE}
      </h2>
      <p className={styles.lead}>{CONTINUE_LEAD}</p>
      {choosing ? (
        <div className={styles.choose} role="group" aria-label={CONTINUE_CHOOSE_LEGEND}>
          <p className={styles.sub}>{CONTINUE_CHOOSE_LEGEND}</p>
          <ul>
            {parts.remaining.map((s) => (
              <li key={s.id}>
                <Checkbox
                  checked={selected.includes(s.id)}
                  onChange={() => setChosen(toggleSection(selected, s.id, parts.remaining))}
                  label={
                    <span className={styles.sectionLabel}>
                      <span>{s.title}</span>
                      <span className={styles.sectionPages}>PDF pages {pdfRange(s.page_start, s.page_end)}</span>
                    </span>
                  }
                  extra={`${formatCount(s.word_count)} words`}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.next}>
          Next: <strong>{titles[0] ?? "no section"}</strong>
          {parts.remaining.length > 1 ? ` (${parts.remaining.length - 1} more after it)` : null}
        </p>
      )}
      {lines && estimate?.within_limits !== false ? (
        <p className={styles.estimate}>
          This part: about {lines.pages}, {lines.cost}, ready in {lines.total}. Estimates, not a bill.
        </p>
      ) : null}
      {estimate?.within_limits === false ? <p className={styles.estimate}>{estimate.blocking_reasons.join(" ")}</p> : null}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="md"
          fullWidth={narrow}
          loading={pending}
          accessibleName={pending ? "Continue: starting" : undefined}
          disabled={off}
          why={off && !pending ? why : undefined}
          onClick={() => onContinue(from, selected)}
        >
          {pending ? "Starting" : continueLabel(titles)}
        </Button>
        {parts.remaining.length > 1 ? (
          <Button variant="quiet" size="sm" onClick={() => setChoosing((v) => !v)} aria-expanded={choosing}>
            {choosing ? CONTINUE_CHOOSE_DONE : CONTINUE_CHOOSE}
          </Button>
        ) : null}
      </div>
      {refusal ? (
        <Notice tone="needs" title="The next part did not start." role="alert">
          {refusal}
        </Notice>
      ) : null}
    </Card>
  );
}
