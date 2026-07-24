/**
 * GET /api/bible/chapter?stream=&book=&chapter=
 *
 * Return the displayed-chapter payload for an arbitrary chapter
 * (not necessarily the current one). Used by the widget's nav
 * chevrons — the client already knows what stream/book/chapter it
 * wants, we just supply the verses + notes + highlights + adjacent-
 * chapter hints in one round trip.
 *
 * Public. Bounds-checked: unknown book or out-of-range chapter → 404.
 */

import type { LoaderFunctionArgs } from "react-router";
import {
  getAdjacentChapter,
  getChapterText,
  getHighlights,
  getLatestNotes,
  STREAM_ORDER,
  type Stream,
} from "~/utils/bible.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const stream = url.searchParams.get("stream") as Stream | null;
  const book = url.searchParams.get("book") ?? "";
  const chapter = Number(url.searchParams.get("chapter") ?? "");
  if (!stream || !STREAM_ORDER.includes(stream)) {
    return Response.json({ error: "invalid stream" }, { status: 400 });
  }
  if (!book || !Number.isFinite(chapter) || chapter < 1) {
    return Response.json({ error: "invalid book/chapter" }, { status: 400 });
  }
  const verses = getChapterText(book, chapter);
  if (!verses) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const notes = await getLatestNotes(book, chapter);
  const highlights = await getHighlights(book, chapter);
  const prevChapter = getAdjacentChapter("prev", stream, book, chapter);
  const nextChapter = getAdjacentChapter("next", stream, book, chapter);
  return Response.json({
    stream,
    book,
    chapter,
    verses,
    messages: notes?.messages ?? [],
    completed: !!notes?.completed,
    highlights,
    prevChapter,
    nextChapter,
  });
};
