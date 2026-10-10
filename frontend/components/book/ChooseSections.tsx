"use client";

import type { BookDetail } from "@/lib/api";
import { Checkbox, Meter, NumberField, SegmentedControl, formatCount } from "@/components/ui";
import { checkRange, limitState, pdfRange, toggleSection, usageOf, scopeOf, WHOLE_BOOK, type Choice } from "./bookLogic";
import styles from "./Book.module.css";

export interface Limits {
  max_pdf_pages: number;
  max_source_words: number;
}

/**
 * 6A, choose what to draw (#40). A control ABOVE the one Generate button: the whole book, some sections from Contents,
 * or a range of PDF pages (when Contents has one section or looks wrong). It never holds the words "Generate manga".
 */
export function ChooseSections({
  book,
  choice,
  onChange,
  limits,
  wholeBlocked,
  leadText,
}: {
  book: BookDetail;
  choice: Choice;
  onChange: (c: Choice) => void;
  limits: Limits | null;
  /** The whole book is over the limit: that option is off, with the reason. */
  wholeBlocked: boolean;
  leadText?: string;
}) {
  const scope = scopeOf(choice, book.page_count);
  const usage = usageOf(book, scope === undefined ? { section_ids: [] } : scope);
  const state = limits ? limitState(usage, limits) : null;
  const range = choice.mode === "range" ? checkRange(choice.from, choice.to, book.page_count) : null;
  const rangeStarted = choice.from !== "" || choice.to !== "";

  return (
    <div className={styles.choose}>
      <h2 className={styles.cardTitle} id="choose-title">
        {wholeBlocked ? "Choose what to draw" : "What to draw"}
      </h2>
      {leadText ? <p className={styles.chooseLead}>{leadText}</p> : null}
      <SegmentedControl
        name="scope-mode"
        legend="What to draw"
        value={choice.mode}
        onChange={(v) => onChange({ ...choice, mode: v as Choice["mode"] })}
        options={[
          { value: "whole", label: "The whole book", disabledReason: wholeBlocked ? "Over the limit" : undefined },
          { value: "sections", label: "Some sections", disabledReason: book.sections.length === 0 ? "No sections found" : undefined },
          { value: "range", label: "PDF pages" },
        ]}
      />

      {choice.mode === "whole" ? (
        <p className={styles.chooseNote}>
          The whole book: {formatCount(book.page_count)} PDF pages, {formatCount(book.word_count)} words. To draw one part, choose some sections.
        </p>
      ) : null}

      {choice.mode === "sections" ? (
        <div className={styles.sectionList} role="group" aria-label="Sections, from Contents">
          <p className={styles.chooseSub}>Sections, from Contents</p>
          <ul>
            {book.sections.map((s) => (
              <li key={s.id}>
                <Checkbox
                  checked={choice.sectionIds.includes(s.id)}
                  onChange={() => onChange({ ...choice, sectionIds: toggleSection(choice.sectionIds, s.id, book.sections) })}
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
          <p className={styles.chooseNote}>PanelSummary finds the sections from the size of the headings, so they can be wrong. If they are, choose a range of PDF pages.</p>
        </div>
      ) : null}

      {choice.mode === "range" ? (
        <div className={styles.rangeBox}>
          <p className={styles.chooseSub}>A range of PDF pages</p>
          <div className={styles.rangeFields}>
            <NumberField
              label="From PDF page"
              min={1}
              max={book.page_count}
              value={choice.from}
              onChange={(e) => onChange({ ...choice, from: e.target.value })}
              invalid={!!range && !range.ok && rangeStarted}
            />
            <NumberField
              label="To PDF page"
              min={1}
              max={book.page_count}
              value={choice.to}
              onChange={(e) => onChange({ ...choice, to: e.target.value })}
              invalid={!!range && !range.ok && rangeStarted}
              suffix={`of ${formatCount(book.page_count)}`}
            />
          </div>
          {range && !range.ok && rangeStarted ? (
            <p className={styles.rangeHint} role="status">
              {range.hint}
            </p>
          ) : (
            <p className={styles.chooseNote}>Use this when Contents shows one section, or the sections are wrong. The run uses the whole text on these PDF pages.</p>
          )}
        </div>
      ) : null}

      {limits ? (
        <div className={styles.meters}>
          <Meter
            label="Words"
            value={usage.words}
            limit={limits.max_source_words}
            valueText={`${usage.estimated ? "about " : ""}${formatCount(usage.words)} of ${formatCount(limits.max_source_words)}`}
            note={state && !state.inside && state.overWords > 0 ? `${formatCount(state.overWords)} words over the limit.` : undefined}
          />
          <Meter
            label="PDF pages"
            value={usage.pages}
            limit={limits.max_pdf_pages}
            valueText={`${formatCount(usage.pages)} of ${formatCount(limits.max_pdf_pages)}`}
            note={state && state.overPages > 0 ? `${formatCount(state.overPages)} pages over the limit.` : undefined}
          />
        </div>
      ) : null}
      {state && !state.inside && scope !== undefined ? (
        <p className={styles.overNote} role="status">
          This choice is over the limit. Choose less to turn Generate on.
        </p>
      ) : null}
    </div>
  );
}

export { WHOLE_BOOK };
