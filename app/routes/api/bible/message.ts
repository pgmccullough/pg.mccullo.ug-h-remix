/**
 * POST /api/bible/message
 *
 * Admin-only. Appends a user message to the current chapter's
 * active notes, calls the AI companion for a reply, appends the
 * reply, persists. Returns the updated message thread so the
 * widget can render it without a follow-up loader hit.
 *
 * Body: `message` (form field, plain text).
 *
 * Failure modes:
 *   - not logged in as admin → 401
 *   - empty message → 400
 *   - AI call fails → still persists the user message; returns
 *     the thread with an assistant "sorry" note so the UI
 *     doesn't lose the user's typed content.
 */

import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import {
  getBibleState,
  getChapterText,
  getActiveNotes,
  upsertActiveNotes,
  type BibleMessage,
} from "~/utils/bible.server";
import { bibleChat } from "~/utils/openai.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const message = form.get("message")?.toString().trim();
  if (!message) {
    return Response.json({ error: "empty message" }, { status: 400 });
  }

  const state = await getBibleState();
  const pos = state.positions[state.currentStream];
  const verses = getChapterText(pos.book, pos.chapter);
  if (!verses) {
    return Response.json(
      { error: "chapter not found in KJV" },
      { status: 500 }
    );
  }

  // Fetch or start the active notes doc for this chapter.
  const existing = await getActiveNotes(pos.book, pos.chapter);
  const now = Math.floor(Date.now() / 1000);

  const priorMessages: BibleMessage[] = existing?.messages ?? [];
  const withUser: BibleMessage[] = [
    ...priorMessages,
    { role: "user", content: message, timestamp: now },
  ];

  // Persist the user message immediately so it isn't lost if the
  // AI call fails or times out.
  await upsertActiveNotes({
    stream: state.currentStream,
    book: pos.book,
    chapter: pos.chapter,
    messages: withUser,
  });

  // Call the AI companion. Pass only role+content — the timestamp
  // isn't part of the OpenAI message shape.
  const reply = await bibleChat({
    book: pos.book,
    chapter: pos.chapter,
    verses,
    messages: withUser.map((m) => ({ role: m.role, content: m.content })),
  });

  const withReply: BibleMessage[] = reply
    ? [
        ...withUser,
        {
          role: "assistant",
          content: reply,
          timestamp: Math.floor(Date.now() / 1000),
        },
      ]
    : [
        ...withUser,
        {
          role: "assistant",
          content:
            "Sorry — the AI companion didn't respond just now. Try sending again.",
          timestamp: Math.floor(Date.now() / 1000),
        },
      ];

  // Persist the full thread including the assistant reply.
  await upsertActiveNotes({
    stream: state.currentStream,
    book: pos.book,
    chapter: pos.chapter,
    messages: withReply,
  });

  return Response.json({
    ok: true,
    messages: withReply,
    aiFailed: reply === null,
  });
};
