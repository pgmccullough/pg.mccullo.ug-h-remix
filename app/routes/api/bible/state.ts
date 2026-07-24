/**
 * GET /api/bible/state
 *
 * Returns the current chapter under the active reading stream,
 * plus the in-progress notes (if any). Public — every visitor sees
 * the same view. Only the mutation endpoints are admin-guarded.
 */

import type { LoaderFunctionArgs } from "react-router";
import {
  getActiveNotes,
  getBibleState,
  getChapterText,
} from "~/utils/bible.server";

export const loader = async (_args: LoaderFunctionArgs) => {
  const state = await getBibleState();
  const pos = state.positions[state.currentStream];
  const verses = getChapterText(pos.book, pos.chapter) ?? [];
  const notes = await getActiveNotes(pos.book, pos.chapter);

  return Response.json({
    stream: state.currentStream,
    book: pos.book,
    chapter: pos.chapter,
    verses,
    messages: notes?.messages ?? [],
  });
};
