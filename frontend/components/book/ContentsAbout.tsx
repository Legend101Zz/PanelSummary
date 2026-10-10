"use client";

import Link from "next/link";
import type { BookDetail, EditionDetail } from "@/lib/api";
import { plural, formatTokens, readableReason } from "@/lib/words";
import { Disclosure } from "@/components/ui";
import { mangaRanges, pdfRange } from "./bookLogic";
import styles from "./Book.module.css";

/** E. Contents: one row for each section, with its PDF pages and, once the plan exists, its manga pages. */
export function Contents({ bookId, book, edition }: { bookId: string; book: BookDetail; edition: EditionDetail | null }) {
  if (book.sections.length === 0) return null;
  const ranges = edition ? mangaRanges(edition.pages) : new Map<string, [number, number]>();
  // The plan names its own section ids (s1, s2 ...). They match the book's section ids when the run drew the whole book.
  return (
    <section className={styles.contents} aria-labelledby="contents-title">
      <div className={styles.contentsHead}>
        <h2 id="contents-title" className={styles.blockTitle}>
          Contents
        </h2>
        <p className={styles.blockMeta}>As found in the PDF</p>
      </div>
      <ol>
        {book.sections.map((s, i) => {
          const r = ranges.get(s.id);
          return (
            <li key={s.id}>
              <span className={styles.contentsNum}>{i + 1}</span>
              <span className={styles.contentsTitle}>{s.title}</span>
              <span className={styles.contentsLinks}>
                <Link className={styles.contentsLink} href={`/books/${bookId}/source?page=${s.page_start}`}>
                  PDF pages {pdfRange(s.page_start, s.page_end)}
                </Link>
                {r ? <span className={styles.contentsManga}>manga pages {pdfRange(r[0], r[1])}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** F. About this adaptation: coverage, the three lists and how it was made. Closed by default; shown after a run. */
export function About({ edition }: { edition: EditionDetail }) {
  const cov = edition.coverage ?? {};
  const claims = new Map((edition.book?.claims ?? []).map((c) => [c.id, c.text]));
  const total = cov.claims_total ?? 0;
  const conveyed = cov.conveyed?.length ?? 0;
  const text = (id: string) => claims.get(id) ?? "A key point of the book";
  const policy = edition.policy as Record<string, unknown>;
  const models = [...new Set([policy.understanding_model, policy.plan_model, policy.page_model].filter((m): m is string => typeof m === "string" && m !== ""))];
  const tokens = edition.totals.input_tokens + edition.totals.output_tokens;
  const omitted = cov.omitted_by_plan ?? [];
  const lost = cov.lost_to_failed_pages ?? [];
  const notPlanned = cov.not_planned ?? [];
  return (
    <section className={styles.about}>
      <Disclosure label="About this adaptation">
        <div className={styles.aboutBody}>
          <h3>Coverage</h3>
          {total > 0 ? (
            <p>
              The model marked {conveyed} of the {plural(total, "key point")} as shown on the pages.
            </p>
          ) : (
            <p>Coverage is reported when every page has been attempted.</p>
          )}
          {total > 0 ? (
            <>
              <h3>Left out on purpose</h3>
              {omitted.length ? (
                <ul>
                  {omitted.map((o) => (
                    <li key={o.claim}>
                      <strong>{text(o.claim)}</strong> <span>Reason: {o.reason ? readableReason(o.reason, claims) : "No reason was given."}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.none}>None.</p>
              )}
              <h3>Lost with the {lost.length === 1 ? "page" : "pages"} that could not be drawn</h3>
              {lost.length ? (
                <ul>
                  {lost.map((id) => (
                    <li key={id}>{text(id)}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.none}>None. Every page was drawn.</p>
              )}
              <h3>Not planned into any page</h3>
              {notPlanned.length ? (
                <ul>
                  {notPlanned.map((id) => (
                    <li key={id}>{text(id)}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.none}>None. Every key point was planned into a page or left out with a reason.</p>
              )}
            </>
          ) : null}
          <h3>How it was made</h3>
          <p>
            MiniMax{models.length ? ` (${models.join(", ")})` : ""} read the book, planned the pages and wrote the lettering. The PanelSummary renderer drew each page as SVG. No image-generation model was used.
            {tokens > 0 ? ` ${formatTokens(tokens)} tokens were used.` : ""}
          </p>
        </div>
      </Disclosure>
    </section>
  );
}
