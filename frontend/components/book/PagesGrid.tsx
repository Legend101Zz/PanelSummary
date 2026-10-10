"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadPage, type EditionDetail, type EditionPageSummary } from "@/lib/api";
import { useNearViewport } from "@/lib/hooks";
import { SvgPage } from "@/components/SvgPage";
import { Button, PageFrame, Switch } from "@/components/ui";
import { groupBySection, mangaRanges, pagesSummary, pdfRange } from "./bookLogic";
import styles from "./Book.module.css";

function usePageSvg(editionId: string, page: EditionPageSummary) {
  const [svg, setSvg] = useState<string | null>(null);
  const [ref, near] = useNearViewport<HTMLLIElement>("400px");
  const accepted = page.status === "accepted";
  useEffect(() => {
    if (!accepted || !near || svg) return;
    let live = true;
    loadPage(editionId, page.page_number)
      .then((p) => live && p.svg && setSvg(p.svg))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [accepted, near, svg, editionId, page.page_number]);
  return { ref, svg };
}

const hrefFor = (bookId: string, editionId: string, n: number) => `/books/${bookId}/read?edition=${editionId}&page=${n}`;

/** One page in the grid: the real page when drawn, a state frame otherwise. The state is said once above the grid, not on every cell. */
function PageCell({ bookId, editionId, page }: { bookId: string; editionId: string; page: EditionPageSummary }) {
  const { ref, svg } = usePageSvg(editionId, page);
  const n = page.page_number;
  const drawn = page.status === "accepted";
  const failed = page.status === "failed";
  const state = drawn ? (svg ? "drawn" : "waiting") : failed ? "failed" : page.status === "drawing" ? "drawing" : "waiting";
  const frame = (
    <PageFrame state={state} variant="thumbnail">
      {drawn && svg ? <SvgPage svg={svg} decorative /> : null}
    </PageFrame>
  );
  const word = drawn ? "" : failed ? ", could not be drawn" : page.status === "drawing" ? ", drawing" : ", waiting";
  return (
    <li ref={ref} className={styles.cell}>
      {drawn || failed ? (
        <Link href={hrefFor(bookId, editionId, n)} className={styles.cellLink} aria-label={`Page ${n}${word}`}>
          {frame}
        </Link>
      ) : (
        <div className={styles.cellLink} role="img" aria-label={`Page ${n}${word}`}>
          {frame}
        </div>
      )}
      <span className={styles.cellNum} aria-hidden="true">
        {n}
      </span>
    </li>
  );
}

function BeatRow({
  bookId,
  editionId,
  page,
  canRedraw,
  redrawing,
  onRedraw,
}: {
  bookId: string;
  editionId: string;
  page: EditionPageSummary;
  canRedraw: boolean;
  redrawing: boolean;
  onRedraw: (n: number) => void;
}) {
  const { ref, svg } = usePageSvg(editionId, page);
  const n = page.page_number;
  const drawn = page.status === "accepted";
  const failed = page.status === "failed";
  const state = drawn ? (svg ? "drawn" : "waiting") : failed ? "failed" : page.status === "drawing" ? "drawing" : "waiting";
  const thumb = (
    <PageFrame state={state} variant="thumbnail">
      {drawn && svg ? <SvgPage svg={svg} decorative /> : null}
    </PageFrame>
  );
  return (
    <li ref={ref} className={styles.beatRow}>
      <div className={styles.beatThumb}>
        {drawn || failed ? (
          <Link href={hrefFor(bookId, editionId, n)} aria-label={`Page ${n}${failed ? ", could not be drawn" : ""}`}>
            {thumb}
          </Link>
        ) : (
          thumb
        )}
        <span className={styles.cellNum} aria-hidden="true">
          {n}
        </span>
      </div>
      <div className={styles.beatBody}>
        <p>{page.beat || "No beat was recorded for this page."}</p>
        {!drawn && !failed ? <p className={styles.beatState}>{page.status === "drawing" ? "Drawing now." : "Waiting."}</p> : null}
        {failed ? <p className={styles.beatState}>This page could not be drawn.</p> : null}
        {drawn && canRedraw ? (
          <div className={styles.redraw}>
            <Button variant="secondary" size="sm" onClick={() => onRedraw(n)} loading={redrawing} accessibleName={`Draw page ${n} again`}>
              {redrawing ? "Drawing again" : "Draw this page again"}
            </Button>
            <span className={styles.redrawNote}>About $0.02 (estimate)</span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** D. The Pages grid. "Show page beats" turns it into a list with one beat for each page. */
export function PagesGrid({
  bookId,
  edition,
  sectionTitles,
  canRedraw,
  redrawing,
  onRedraw,
}: {
  bookId: string;
  edition: EditionDetail;
  sectionTitles: Record<string, string>;
  canRedraw: boolean;
  redrawing: number | null;
  onRedraw: (n: number) => void;
}) {
  const [beats, setBeats] = useState(false);
  const total = edition.page_total || edition.pages.length;
  if (edition.pages.length === 0) return null;
  const ranges = mangaRanges(edition.pages);
  return (
    <section className={styles.block} aria-labelledby="pages-title">
      <div className={styles.blockHead}>
        <h2 id="pages-title" className={styles.blockTitle}>
          Pages
        </h2>
        <p className={styles.blockMeta}>{pagesSummary(edition.pages, total)}</p>
        <div className={styles.beatSwitch}>
          <Switch label="Show page beats" checked={beats} onChange={(e) => setBeats(e.target.checked)} />
        </div>
      </div>
      {!beats ? (
        <ol className={styles.grid}>
          {edition.pages.map((p) => (
            <PageCell key={p.page_number} bookId={bookId} editionId={edition.id} page={p} />
          ))}
        </ol>
      ) : (
        <div className={styles.beats}>
          {groupBySection(edition.pages).map((g) => {
            const r = ranges.get(g.section_id);
            return (
              <section key={`${g.section_id}-${g.pages[0].page_number}`} aria-label={sectionTitles[g.section_id] ?? "Pages"}>
                <h3 className={styles.beatSection}>
                  {sectionTitles[g.section_id] ?? "Pages"}
                  {r ? <span> manga pages {pdfRange(r[0], r[1])}</span> : null}
                </h3>
                <ol className={styles.beatList2}>
                  {g.pages.map((p) => (
                    <BeatRow key={p.page_number} bookId={bookId} editionId={edition.id} page={p} canRedraw={canRedraw} redrawing={redrawing === p.page_number} onRedraw={onRedraw} />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
