/**
 * GET /api/bible/state
 *
 * Full initial payload for the widget:
 *   - `current`: the canonical current chapter (from bibleState)
 *   - `displayed`: what to render first (starts equal to current)
 *   - all four stream positions (so client-side stream nav can
 *     jump straight to the target chapter without another lookup)
 *
 * Public — every visitor sees the same view. Only the mutation
 * endpoints are admin-guarded.
 */

import type { LoaderFunctionArgs } from "react-router";
import {
  getAdjacentChapter,
  getBibleState,
  getChapterText,
  getHighlights,
  getLatestNotes,
  type Stream,
} from "~/utils/bible.server";

async function buildDisplayed(stream: Stream, book: string, chapter: number) {
  const verses = getChapterText(book, chapter) ?? [];
  const notes = await getLatestNotes(book, chapter);
  const highlights = await getHighlights(book, chapter);
  const prevChapter = getAdjacentChapter("prev", stream, book, chapter);
  const nextChapter = getAdjacentChapter("next", stream, book, chapter);
  return {
    stream,
    book,
    chapter,
    verses,
    messages: notes?.messages ?? [],
    completed: !!notes?.completed,
    highlights,
    prevChapter,
    nextChapter,
  };
}

export const loader = async (_args: LoaderFunctionArgs) => {
  const state = await getBibleState();
  const pos = state.positions[state.currentStream];
  const displayed = await buildDisplayed(
    state.currentStream,
    pos.book,
    pos.chapter
  );
  return Response.json({
    current: {
      stream: state.currentStream,
      book: pos.book,
      chapter: pos.chapter,
    },
    positions: state.positions,
    displayed,
  });
};
