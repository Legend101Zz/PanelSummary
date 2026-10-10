"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getEdition, isActive, listBooks, type LibraryBook } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { Button, Notice, Skeleton, UploadIcon } from "@/components/ui";
import { SHELF_LEDE, SHELF_LOAD_ERROR, limitsSentence } from "@/lib/words";
import { BookTile } from "./BookTile";
import { FirstRun } from "./FirstRun";
import { OfflineGate } from "./OfflineGate";
import { useServerStatus } from "./useServerStatus";
import styles from "./shelf.module.css";

/** The shelf at /. With no books it is the first run (same route, a page, not a redirect). */
export function ShelfScreen() {
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);
  const { status, refresh } = useServerStatus();

  const load = useCallback(async () => {
    try {
      const list = await listBooks();
      // latest_edition.pages_accepted is only written when a run finishes, so count the drawn pages of editions that still run
      const live = await Promise.all(list.map((b) => (b.latest_edition && isActive(b.latest_edition.status) ? getEdition(b.latest_edition.id).catch(() => null) : null)));
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
      setError({ message: SHELF_LOAD_ERROR, offline: e instanceof ApiError && e.status === 0 });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const busy = !!books?.some((b) => b.status === "uploaded" || b.status === "parsing" || isActive(b.latest_edition?.status));
  // keep polling while the server cannot be reached: the band goes by itself when the next request works
  usePoll(load, 4000, busy || !!error?.offline);

  if (books && books.length === 0) return <FirstRun status={status} onRefresh={refresh} />;

  return (
    <main id="main" className={styles.main}>
      {error?.offline ? <OfflineGate onRetry={load} /> : null}
      <h1 className={styles.h1}>Your shelf</h1>
      <p className={styles.lede}>{SHELF_LEDE}</p>

      {error && !error.offline ? (
        <div className={styles.block}>
          <Notice tone="needs" role="alert" title={error.message} />
          <Button variant="secondary" size="sm" onClick={load}>
            Try again
          </Button>
        </div>
      ) : null}

      {books === null && !error ? (
        <div role="status" aria-label="Loading your shelf">
          <ul className={styles.grid} aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className={styles.tile}>
                <Skeleton shape="cover" />
                <Skeleton shape="line" width="70%" />
                <Skeleton shape="line" width="45%" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {books && books.length > 0 ? (
        <ul className={styles.grid}>
          {books.map((book) => (
            <BookTile key={book.id} book={book} />
          ))}
          <li className={styles.tile}>
            <Link href="/upload" className={styles.addTile}>
              <UploadIcon size={24} />
              <span className={styles.addTitle}>Add a book</span>
              <span className={styles.addHint}>{limitsSentence(status?.limits)}</span>
            </Link>
          </li>
        </ul>
      ) : null}
    </main>
  );
}
