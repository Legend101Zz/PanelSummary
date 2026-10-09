"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getEdition, isActive, listBooks, type LibraryBook } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { shelfStatus } from "@/lib/words";
import { SiteHeader } from "@/components/SiteHeader";
import { Cover, Obi, Sheet } from "@/components/Paper";
import { CoverSvg, useFirstPage } from "@/components/CoverArt";
import styles from "./library.module.css";

export default function LibraryPage() {
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listBooks();
      // latest_edition.pages_accepted is only written when a run finishes, so
      // count the drawn pages of editions that are still running
      const live = await Promise.all(
        list.map((b) => (b.latest_edition && isActive(b.latest_edition.status) ? getEdition(b.latest_edition.id).catch(() => null) : null)),
      );
      setBooks(
        list.map((b, i) => {
          const detail = live[i];
          if (!detail || !b.latest_edition) return b;
          return {
            ...b,
            latest_edition: {
              ...b.latest_edition,
              status: detail.status,
              page_total: detail.page_total || detail.pages.length,
              pages_accepted: detail.pages.filter((p) => p.status === "accepted").length,
            },
          };
        }),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The shelf could not be loaded.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const busy = !!books?.some((b) => b.status === "uploaded" || b.status === "parsing" || isActive(b.latest_edition?.status));
  usePoll(load, 4000, busy);

  return (
    <>
      <SiteHeader
        action={
          books && books.length > 0 ? (
            <Link href="/upload" className="btn btn-ink">
              Add a book
            </Link>
          ) : null
        }
      />
      <main id="main" className="page-main">
        <div className={styles.intro}>
          <h1 className="page-title">Your shelf</h1>
          <p className={styles.lede}>Books you have added, and the manga drawn from them.</p>
        </div>

        {error ? (
          <div className="notice" role="alert">
            {error}{" "}
            <button type="button" className="btn btn-quiet" onClick={load}>
              Try again
            </button>
          </div>
        ) : null}

        {books === null && !error ? (
          <ul className={styles.shelf} aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className={styles.placeholder}>
                <Sheet />
              </li>
            ))}
          </ul>
        ) : null}

        {books && books.length === 0 ? <EmptyShelf /> : null}

        {books && books.length > 0 ? (
          <ul className={styles.shelf}>
            {books.map((book) => (
              <ShelfBook key={book.id} book={book} />
            ))}
          </ul>
        ) : null}
      </main>
    </>
  );
}

function ShelfBook({ book }: { book: LibraryBook }) {
  const edition = book.latest_edition;
  const { ref, svg } = useFirstPage(edition?.id, !!edition && edition.pages_accepted > 0);
  const status = shelfStatus(book);
  const progress = edition && isActive(edition.status) && edition.page_total > 0 ? edition.pages_accepted / edition.page_total : undefined;
  return (
    <li className={styles.book} ref={ref}>
      <Link href={`/books/${book.id}`} className={styles.bookLink}>
        <Cover
          title={book.title}
          author={book.author}
          art={svg ? <CoverSvg svg={svg} /> : undefined}
          obi={
            <Obi tone={status.tone} progress={progress}>
              {status.text}
            </Obi>
          }
        />
        <span className={styles.bookTitle}>{book.title}</span>
      </Link>
      {book.author ? <span className={styles.bookAuthor}>{book.author}</span> : null}
    </li>
  );
}

function EmptyShelf() {
  return (
    <div className={styles.empty}>
      <Sheet className={styles.emptySheet} />
      <div className={styles.emptyText}>
        <h2 className="section-title">Nothing on the shelf yet</h2>
        <p className="muted">
          Add a book as a PDF with selectable text. PanelSummary reads its chapters, and you choose when to draw it as manga.
        </p>
        <Link href="/upload" className="btn btn-ink">
          Add a book
        </Link>
      </div>
    </div>
  );
}
