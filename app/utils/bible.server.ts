/**
 * Bible reading widget — server helper.
 *
 * Manages the four-stream rotation (OT → PROV → PSALM → NT → OT …),
 * exposes chapter text from the bundled KJV JSON, and persists
 * position + notes to Mongo.
 *
 * Stream cycle: after DONE on the current chapter, the active
 * stream's position advances by one chapter (wrapping at book end
 * to the next book, and at end-of-stream to the first book), then
 * the currentStream rotates to the next in STREAM_ORDER.
 *
 * OT rotation intentionally skips Psalms and Proverbs — those get
 * their own dedicated streams (per the reading plan).
 *
 * Collections:
 *   bibleState — one doc, tracks currentStream + per-stream position
 *   bibleNotes — one doc per (chapter, session), messages + completed
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { clientPromise } from "~/lib/mongodb";

const BIBLE_JSON_PATH = path.join(
  process.cwd(),
  "app/assets/bible/kjv.json"
);

export interface Book {
  abbrev: string;
  name: string;
  chapters: string[][]; // chapters[chapterIdx][verseIdx]
}

// Book indices in the KJV JSON (0-indexed).
const PSALMS_IDX = 18;
const PROVERBS_IDX = 19;
const NT_START_IDX = 39; // Matthew

// Load the whole bible once and hold in module scope. The file is
// ~4.5MB; parsing it once at cold start and keeping it in memory
// avoids per-request JSON.parse. The BOM (UTF-8 signature) some
// downloads include gets stripped before parsing.
let cachedBible: Book[] | null = null;
function loadBible(): Book[] {
  if (cachedBible) return cachedBible;
  // Strip UTF-8 BOM if present — many bible-JSON downloads ship
  // with one (﻿), which JSON.parse would otherwise reject.
  const raw = readFileSync(BIBLE_JSON_PATH, "utf8").replace(/^﻿/, "");
  cachedBible = JSON.parse(raw) as Book[];
  return cachedBible;
}

export type Stream = "OT" | "PROV" | "PSALM" | "NT";
export const STREAM_ORDER: Stream[] = ["OT", "PROV", "PSALM", "NT"];

/**
 * Books eligible for a given stream. Recomputed cheaply on each
 * call — slices are shallow, and the JSON reader is memoized.
 */
export function getStreamBooks(stream: Stream): Book[] {
  const bible = loadBible();
  switch (stream) {
    case "OT":
      return bible
        .slice(0, NT_START_IDX)
        .filter((_, i) => i !== PSALMS_IDX && i !== PROVERBS_IDX);
    case "PROV":
      return [bible[PROVERBS_IDX]];
    case "PSALM":
      return [bible[PSALMS_IDX]];
    case "NT":
      return bible.slice(NT_START_IDX);
  }
}

/**
 * Advance a stream's position by one chapter. Wraps to the next
 * book at end-of-book, and to the first book of the stream at
 * end-of-stream. Safe against corrupted state: if the stored book
 * isn't in the stream, resets to the first chapter of the first
 * book.
 */
export function advanceStream(
  stream: Stream,
  position: { book: string; chapter: number }
): { book: string; chapter: number } {
  const books = getStreamBooks(stream);
  const idx = books.findIndex((b) => b.name === position.book);
  if (idx < 0) {
    return { book: books[0].name, chapter: 1 };
  }
  const currentBook = books[idx];
  if (position.chapter < currentBook.chapters.length) {
    return { book: position.book, chapter: position.chapter + 1 };
  }
  const nextIdx = (idx + 1) % books.length;
  return { book: books[nextIdx].name, chapter: 1 };
}

export function nextStream(stream: Stream): Stream {
  const i = STREAM_ORDER.indexOf(stream);
  return STREAM_ORDER[(i + 1) % STREAM_ORDER.length];
}

export function prevStream(stream: Stream): Stream {
  const i = STREAM_ORDER.indexOf(stream);
  return STREAM_ORDER[(i - 1 + STREAM_ORDER.length) % STREAM_ORDER.length];
}

/**
 * Adjacent chapter within a stream, without wrapping.
 * Returns null at the boundary (first chapter of first book for "prev",
 * last chapter of last book for "next") so the widget can disable
 * the chevron. This is intentionally different from the DONE-driven
 * advance in `advanceStream`, which does wrap — DONE is "reading
 * plan" (infinite loop), while nav is "browsing" (finite range).
 */
export function getAdjacentChapter(
  direction: "prev" | "next",
  stream: Stream,
  book: string,
  chapter: number
): { book: string; chapter: number } | null {
  const books = getStreamBooks(stream);
  const idx = books.findIndex((b) => b.name === book);
  if (idx < 0) return null;
  if (direction === "next") {
    if (chapter < books[idx].chapters.length) {
      return { book, chapter: chapter + 1 };
    }
    if (idx + 1 < books.length) {
      return { book: books[idx + 1].name, chapter: 1 };
    }
    return null;
  } else {
    if (chapter > 1) {
      return { book, chapter: chapter - 1 };
    }
    if (idx > 0) {
      const prev = books[idx - 1];
      return { book: prev.name, chapter: prev.chapters.length };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Highlights collection: bibleHighlights.
//   - one doc per (book, chapter)
//   - verses[] = 1-indexed verse numbers currently highlighted
//   - admin can toggle; everyone reads
// ---------------------------------------------------------------------------

export async function getHighlights(
  book: string,
  chapter: number
): Promise<number[]> {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const key = `${book}::${chapter}`;
  const doc = await db
    .collection<{ _id: string; verses: number[] }>("bibleHighlights")
    .findOne({ _id: key });
  return Array.isArray(doc?.verses) ? doc!.verses : [];
}

/**
 * Toggle a verse's highlight status. Returns the updated verse list.
 * Adds if absent, removes if present. Persists.
 */
export async function toggleHighlight(
  book: string,
  chapter: number,
  verse: number
): Promise<number[]> {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const col = db.collection<{ _id: string; book: string; chapter: number; verses: number[]; updated: number }>(
    "bibleHighlights"
  );
  const key = `${book}::${chapter}`;
  const existing = await col.findOne({ _id: key });
  const current = Array.isArray(existing?.verses) ? existing!.verses : [];
  const has = current.includes(verse);
  const next = has ? current.filter((v) => v !== verse) : [...current, verse].sort((a, b) => a - b);
  const now = Math.floor(Date.now() / 1000);
  await col.updateOne(
    { _id: key },
    {
      $set: {
        book,
        chapter,
        verses: next,
        updated: now,
      },
      $setOnInsert: { _id: key },
    },
    { upsert: true }
  );
  return next;
}

/**
 * Fetch the *most recent* notes for a chapter — the active one if
 * one exists, else the most recently completed one. Used by
 * navigation so browsing to a chapter you've already worked on
 * shows your prior thoughts.
 */
export async function getLatestNotes(
  book: string,
  chapter: number
): Promise<BibleNotes | null> {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const active = await db
    .collection<BibleNotes>("bibleNotes")
    .findOne({ book, chapter, completed: false });
  if (active) return active;
  return await db
    .collection<BibleNotes>("bibleNotes")
    .find({ book, chapter, completed: true })
    .sort({ completedAt: -1 })
    .limit(1)
    .next();
}

/**
 * Return the verses of a specific chapter as a string array.
 * Returns null if the book or chapter doesn't exist — callers
 * should treat as "not found" (a state corruption or bad input).
 */
export function getChapterText(book: string, chapter: number): string[] | null {
  const bible = loadBible();
  const b = bible.find((bk) => bk.name === book);
  if (!b) return null;
  if (chapter < 1 || chapter > b.chapters.length) return null;
  return b.chapters[chapter - 1];
}

// ---------------------------------------------------------------------------
// State collection: bibleState (single-document, keyed by _id: "patrick").
// ---------------------------------------------------------------------------

export interface BibleState {
  _id: string;
  currentStream: Stream;
  positions: {
    OT: { book: string; chapter: number };
    PROV: { book: string; chapter: number };
    PSALM: { book: string; chapter: number };
    NT: { book: string; chapter: number };
  };
  updated: number;
}

const STATE_KEY = "patrick";
const DEFAULT_STATE: BibleState = {
  _id: STATE_KEY,
  currentStream: "OT",
  positions: {
    OT: { book: "Genesis", chapter: 1 },
    PROV: { book: "Proverbs", chapter: 1 },
    PSALM: { book: "Psalms", chapter: 1 },
    NT: { book: "Matthew", chapter: 1 },
  },
  updated: Math.floor(Date.now() / 1000),
};

export async function getBibleState(): Promise<BibleState> {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const doc = await db
    .collection<BibleState>("bibleState")
    .findOne({ _id: STATE_KEY });
  if (!doc) return DEFAULT_STATE;
  // Merge with defaults so a partial doc (e.g., added a new stream
  // later) doesn't crash the reader.
  return {
    _id: STATE_KEY,
    currentStream: doc.currentStream ?? DEFAULT_STATE.currentStream,
    positions: {
      OT: doc.positions?.OT ?? DEFAULT_STATE.positions.OT,
      PROV: doc.positions?.PROV ?? DEFAULT_STATE.positions.PROV,
      PSALM: doc.positions?.PSALM ?? DEFAULT_STATE.positions.PSALM,
      NT: doc.positions?.NT ?? DEFAULT_STATE.positions.NT,
    },
    updated: doc.updated ?? DEFAULT_STATE.updated,
  };
}

export async function saveBibleState(state: BibleState): Promise<void> {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const now = Math.floor(Date.now() / 1000);
  await db.collection<BibleState>("bibleState").updateOne(
    { _id: STATE_KEY },
    {
      $set: {
        currentStream: state.currentStream,
        positions: state.positions,
        updated: now,
      },
      $setOnInsert: { _id: STATE_KEY },
    },
    { upsert: true }
  );
}

// ---------------------------------------------------------------------------
// Notes collection: bibleNotes.
//   - one doc per (book, chapter, session)
//   - the *active* session is the doc where completed === false
//   - once DONE, completed flips true and a fresh doc is created
//     next time that chapter comes up in the rotation (rare — only
//     after wrapping around the whole stream)
// ---------------------------------------------------------------------------

export interface BibleMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface BibleNotes {
  _id?: any;
  stream: Stream;
  book: string;
  chapter: number;
  translation: string;
  messages: BibleMessage[];
  completed: boolean;
  completedAt: number | null;
  created: number;
  updated: number;
}

/**
 * The active (in-progress) notes for a chapter, or null if the
 * user hasn't started writing anything yet.
 */
export async function getActiveNotes(
  book: string,
  chapter: number
): Promise<BibleNotes | null> {
  const client = await clientPromise;
  const db = client.db("user_posts");
  return await db.collection<BibleNotes>("bibleNotes").findOne({
    book,
    chapter,
    completed: false,
  });
}

/**
 * Upsert the active notes doc for a chapter with a new message set.
 * Creates the doc on first message; updates in place afterward.
 */
export async function upsertActiveNotes(args: {
  stream: Stream;
  book: string;
  chapter: number;
  messages: BibleMessage[];
}): Promise<BibleNotes> {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const col = db.collection<BibleNotes>("bibleNotes");
  const now = Math.floor(Date.now() / 1000);
  await col.updateOne(
    { book: args.book, chapter: args.chapter, completed: false },
    {
      $set: {
        stream: args.stream,
        book: args.book,
        chapter: args.chapter,
        translation: "KJV",
        messages: args.messages,
        completed: false,
        completedAt: null,
        updated: now,
      },
      $setOnInsert: { created: now },
    },
    { upsert: true }
  );
  return (await col.findOne({
    book: args.book,
    chapter: args.chapter,
    completed: false,
  }))!;
}

/**
 * Mark the currently-active chapter's notes as completed, advance
 * that stream's position by one, and rotate to the next stream.
 * Returns the updated BibleState so the caller can immediately
 * render the next chapter.
 */
export async function completeCurrentAndAdvance(): Promise<BibleState> {
  const state = await getBibleState();
  const pos = state.positions[state.currentStream];

  const client = await clientPromise;
  const db = client.db("user_posts");
  const now = Math.floor(Date.now() / 1000);

  // Mark the active notes for this chapter completed (if any exist —
  // Patrick may DONE without writing anything, which is fine).
  await db.collection<BibleNotes>("bibleNotes").updateOne(
    { book: pos.book, chapter: pos.chapter, completed: false },
    { $set: { completed: true, completedAt: now, updated: now } }
  );

  // Advance this stream's position.
  const next = advanceStream(state.currentStream, pos);
  state.positions[state.currentStream] = next;
  // Rotate to next stream in the cycle.
  state.currentStream = nextStream(state.currentStream);

  await saveBibleState(state);
  return state;
}
