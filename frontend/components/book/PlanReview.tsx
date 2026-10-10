"use client";

import type { ReactNode } from "react";
import type { BookDetail, EditionDetail } from "@/lib/api";
import { plural, scopeLabel, stageLine } from "@/lib/words";
import { Button, Disclosure, Notice, RunCard, StepList, formatCount, formatUsd } from "@/components/ui";
import type { Pending } from "./RunPanel";
import styles from "./Book.module.css";

const money = (low: number, high: number) => (Math.abs(high - low) < 0.005 ? `about ${formatUsd(low)}` : `about ${formatUsd(low)} to ${formatUsd(high)}`);

/**
 * 6B, review the plan (#49). The run waits after the plan. The viewer sees the page count, what was spent, what drawing will cost,
 * the cast, one line per page and what the plan leaves out. "Draw the pages" starts the drawing; "Stop" ends the run.
 */
export function PlanReview({
  book,
  edition: e,
  pending,
  actionError,
  narrow,
  onApprove,
  onStop,
}: {
  book: BookDetail;
  edition: EditionDetail;
  pending: Pending;
  actionError: string | null;
  narrow: boolean;
  onApprove: () => void;
  onStop: () => void;
}) {
  const total = e.page_total || e.pages.length;
  const cast = e.book?.cast ?? [];
  const claims = new Map((e.book?.claims ?? []).map((c) => [c.id, c.text]));
  const omitted = e.plan_omitted ?? [];
  const spent = e.totals.cost_usd;
  const draw = e.draw_estimate_usd;
  const busy = pending === "approve";
  const approve = (
    <Button key="a" variant="primary" size="md" onClick={onApprove} loading={busy} disabled={pending === "cancel"}>
      {busy ? "Starting" : "Draw the pages"}
    </Button>
  );
  const stop = (
    <Button key="s" variant="secondary" size="md" onClick={onStop} loading={pending === "cancel"} disabled={busy}>
      {pending === "cancel" ? "Stopping" : "Stop"}
    </Button>
  );
  const details: ReactNode = (
    <div className={styles.review}>
      {cast.length > 0 ? (
        <section aria-labelledby="review-cast">
          <h3 id="review-cast" className={styles.reviewHead}>
            Cast
          </h3>
          <Disclosure label={`${formatCount(cast.length)} characters`} defaultOpen={cast.length <= 8}>
            <ul className={styles.castList}>
              {cast.map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong>
                  {c.role ? `: ${c.role}` : ""}
                </li>
              ))}
            </ul>
          </Disclosure>
        </section>
      ) : null}

      <section aria-labelledby="review-pages">
        <h3 id="review-pages" className={styles.reviewHead}>
          Pages
        </h3>
        <ol className={styles.beatList}>
          {e.pages.map((p) => (
            <li key={p.page_number}>
              <span className={styles.beatNum}>{p.page_number}</span>
              <span>{p.beat}</span>
            </li>
          ))}
        </ol>
      </section>

      {omitted.length > 0 ? (
        <section aria-labelledby="review-omitted">
          <h3 id="review-omitted" className={styles.reviewHead}>
            Left out on purpose
          </h3>
          <ul className={styles.omittedList}>
            {omitted.map((o) => (
              <li key={o.claim}>
                <strong>{claims.get(o.claim) ?? "A key point of the book"}</strong>
                <span>Reason: {o.reason || "No reason was given."}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
  const info: ReactNode = (
    <div className={styles.review}>
      <p className={styles.reviewLead}>
        <strong>{plural(total, "page")}</strong> are planned. Nothing is drawn yet.
      </p>
      <dl className={styles.reviewCosts}>
        <div>
          <dt>Spent so far</dt>
          <dd>about {formatUsd(spent)} (estimate)</dd>
        </div>
        {draw ? (
          <div>
            <dt>To draw the pages</dt>
            <dd>{money(draw.low, draw.high)} (estimate)</dd>
          </div>
        ) : null}
      </dl>

    </div>
  );

  return (
    <RunCard
      eyebrow={scopeLabel(e.scope, book.sections.length) ?? undefined}
      headline={stageLine("awaiting_plan_review", e.pages, total)}
      notice={actionError ? <Notice tone="needs" inCard role="alert">{actionError}</Notice> : undefined}
      steps={<StepList steps={["Reading the book", "Planning the pages", "Checking the plan", "Drawing the pages"].map((label) => ({ label }))} current={2} />}
      actions={narrow ? stop : <>{approve}{stop}</>}
      notes={details}
    >
      {info}
    </RunCard>
  );
}

/** The one primary action of the review on a phone, for the bottom bar. */
export function PlanReviewBarButton({ pending, onApprove }: { pending: Pending; onApprove: () => void }) {
  const busy = pending === "approve";
  return (
    <Button variant="primary" size="lg" fullWidth onClick={onApprove} loading={busy} disabled={pending === "cancel"}>
      {busy ? "Starting" : "Draw the pages"}
    </Button>
  );
}
