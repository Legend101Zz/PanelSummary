"use client";

import Link from "next/link";
import { PageFrame, StatusBand } from "@/components/ui";
import { CoverSvg, useFirstPage } from "@/components/CoverArt";
import type { LibraryBook } from "@/lib/api";
import { bandForBook } from "./bandForBook";
import styles from "./shelf.module.css";

/**
 * One book on the shelf. The whole tile is one link. The cover is the first drawn page, or a plain sheet
 * with a 1 px edge and no text. The status band sits under the cover, never over the art.
 */
export function BookTile({ book }: { book: LibraryBook }) {
  const edition = book.latest_edition;
  const { ref, svg } = useFirstPage(edition?.id, !!edition && edition.pages_accepted > 0);
  const band = bandForBook(book);
  return (
    <li className={styles.tile} ref={ref}>
      <Link href={`/books/${book.id}`} className={styles.tileLink}>
        <PageFrame state={svg ? "drawn" : "blank"} variant="cover">
          {svg ? <CoverSvg svg={svg} /> : null}
        </PageFrame>
        <StatusBand family={band.family} text={band.text} fraction={band.fraction} />
        <span className={styles.tileTitle}>{book.title}</span>
        {book.author ? <span className={styles.tileAuthor}>{book.author}</span> : null}
        {book.is_sample ? <span className={styles.sampleMark}>Sample</span> : null}
      </Link>
    </li>
  );
}
