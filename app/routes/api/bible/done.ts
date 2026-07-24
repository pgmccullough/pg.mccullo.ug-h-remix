/**
 * POST /api/bible/done
 *
 * Admin-only. Marks the current chapter's active notes as
 * completed, advances that stream's position by one chapter, and
 * rotates the active stream to the next in the OT → PROV → PSALM →
 * NT cycle. Returns the fresh state so the widget renders the
 * next chapter without a follow-up loader hit.
 */

import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import {
  completeCurrentAndAdvance,
  getActiveNotes,
  getChapterText,
} from "~/utils/bible.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const state = await completeCurrentAndAdvance();
  const pos = state.positions[state.currentStream];
  const verses = getChapterText(pos.book, pos.chapter) ?? [];
  // After DONE + rotate, the new chapter is guaranteed to have no
  // active notes yet (this is the first time we're landing on it
  // in this cycle), but query anyway in case a stale doc exists.
  const notes = await getActiveNotes(pos.book, pos.chapter);

  return Response.json({
    ok: true,
    stream: state.currentStream,
    book: pos.book,
    chapter: pos.chapter,
    verses,
    messages: notes?.messages ?? [],
  });
};
