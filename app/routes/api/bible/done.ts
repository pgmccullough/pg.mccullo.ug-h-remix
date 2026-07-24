/**
 * POST /api/bible/done
 *
 * Admin-only. Marks the current chapter's active notes completed,
 * advances that stream's position by one, rotates the active stream
 * to the next in the OT → PROV → PSALM → NT cycle. Returns the same
 * full payload as /api/bible/state so the widget can swap in the
 * next chapter without a follow-up loader hit.
 */

import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import {
  completeCurrentAndAdvance,
  getAdjacentChapter,
  getChapterText,
  getHighlights,
  getLatestNotes,
} from "~/utils/bible.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const state = await completeCurrentAndAdvance();
  const pos = state.positions[state.currentStream];
  const verses = getChapterText(pos.book, pos.chapter) ?? [];
  const notes = await getLatestNotes(pos.book, pos.chapter);
  const highlights = await getHighlights(pos.book, pos.chapter);
  const prevChapter = getAdjacentChapter(
    "prev",
    state.currentStream,
    pos.book,
    pos.chapter
  );
  const nextChapter = getAdjacentChapter(
    "next",
    state.currentStream,
    pos.book,
    pos.chapter
  );

  return Response.json({
    ok: true,
    current: {
      stream: state.currentStream,
      book: pos.book,
      chapter: pos.chapter,
    },
    positions: state.positions,
    displayed: {
      stream: state.currentStream,
      book: pos.book,
      chapter: pos.chapter,
      verses,
      messages: notes?.messages ?? [],
      completed: !!notes?.completed,
      highlights,
      prevChapter,
      nextChapter,
    },
  });
};
