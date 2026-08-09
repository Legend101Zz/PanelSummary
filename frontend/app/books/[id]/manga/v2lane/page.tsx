"use client";

/**
 * v2-architecture lane reader route (Session 6) — FLAG-GATED.
 *
 * `NEXT_PUBLIC_MANGA_V2_LANE_READER=1` enables it; default OFF renders an
 * explanatory panel and touches nothing. The legacy readers
 * (`/books/[id]/manga` and `/books/[id]/manga/v2`) are untouched — ADR-009:
 * v1 pages keep flowing through the legacy path, never auto-upgraded.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  isV2LaneReaderEnabled,
  listV2LanePages,
  type V2ReaderPage,
} from "@/lib/manga-v2-lane";
import { V2LaneReader } from "@/components/MangaReader/V2LaneReader";
import { listBookMangaProjects } from "@/lib/api";

export default function MangaV2LaneReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: bookId } = use(params);
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get("project");

  const enabled = isV2LaneReaderEnabled();
  const [pages, setPages] = useState<V2ReaderPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        let projectId = projectIdParam;
        if (!projectId) {
          const listed = await listBookMangaProjects(bookId);
          projectId = listed.projects[0]?.id ?? null;
        }
        if (!projectId) {
          throw new Error("No manga project found for this book");
        }
        const response = await listV2LanePages(projectId);
        if (!cancelled) setPages(response.pages);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, bookId, projectIdParam]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-zinc-100">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Manga reader — v2 lane</h1>
        <Link
          href={`/books/${bookId}/manga/v2`}
          className="text-sm text-zinc-400 underline hover:text-zinc-200"
        >
          Legacy reader
        </Link>
      </div>

      {!enabled ? (
        <div className="rounded-lg border border-zinc-700 p-8 text-sm text-zinc-400">
          The v2-lane reader is behind a flag. Set
          <code className="mx-1 rounded bg-zinc-800 px-1 py-0.5">
            NEXT_PUBLIC_MANGA_V2_LANE_READER=1
          </code>
          to enable it. The legacy reader keeps serving all v1 pages.
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-800 p-8 text-sm text-red-300">
          {error}
        </div>
      ) : pages === null ? (
        <div className="rounded-lg border border-zinc-700 p-8 text-sm text-zinc-400">
          Loading v2-lane pages…
        </div>
      ) : (
        <V2LaneReader pages={pages} />
      )}
    </main>
  );
}
