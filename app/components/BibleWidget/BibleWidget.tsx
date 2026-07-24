import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";

/**
 * BibleWidget — sidebar postcard for reading + notating the Bible
 * one chapter at a time, rotating through OT → Proverbs → Psalms →
 * NT. Public visitors see everything read-only.
 *
 * Two positions matter:
 *   - `current`  — the canonical chapter the server thinks we're
 *                  on right now (from bibleState). DONE advances.
 *   - `displayed`— what the widget is showing at the moment. Nav
 *                  chevrons change this; server state is unaffected.
 *
 * Compose/DONE only appear when displayed == current. Elsewhere the
 * widget is read-only (public and admin alike). If admin has typed
 * or received messages on the current chapter and hasn't hit DONE,
 * the chevrons disable to prevent an accidental context switch.
 *
 * Highlights are per-verse, admin-toggle-able on any chapter, and
 * visible to everyone. Toggling is optimistic (updates local state
 * before the server round-trip finishes).
 */

interface BibleMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

type Stream = "OT" | "PROV" | "PSALM" | "NT";

interface Position {
  book: string;
  chapter: number;
}

interface Displayed {
  stream: Stream;
  book: string;
  chapter: number;
  verses: string[];
  messages: BibleMessage[];
  completed: boolean;
  highlights: number[];
  prevChapter: Position | null;
  nextChapter: Position | null;
}

interface FullState {
  current: { stream: Stream; book: string; chapter: number };
  positions: Record<Stream, Position>;
  displayed: Displayed;
}

const STREAM_ORDER: Stream[] = ["OT", "PROV", "PSALM", "NT"];
const STREAM_LABEL: Record<Stream, string> = {
  OT: "Old Testament",
  PROV: "Proverbs",
  PSALM: "Psalms",
  NT: "New Testament",
};

function prevStreamOf(s: Stream): Stream {
  const i = STREAM_ORDER.indexOf(s);
  return STREAM_ORDER[(i - 1 + STREAM_ORDER.length) % STREAM_ORDER.length];
}
function nextStreamOf(s: Stream): Stream {
  const i = STREAM_ORDER.indexOf(s);
  return STREAM_ORDER[(i + 1) % STREAM_ORDER.length];
}

// ---------------------------------------------------------------------------
// KJV curly-brace parser (unchanged from previous version)
// ---------------------------------------------------------------------------

type VersePart =
  | { type: "text"; text: string }
  | { type: "italic"; text: string }
  | { type: "note"; text: string; note: string };

function parseVerse(raw: string): VersePart[] {
  const parts: VersePart[] = [];
  const braceRe = /\{([^}]*)\}/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = braceRe.exec(raw)) !== null) {
    if (m.index > cursor) {
      parts.push({ type: "text", text: raw.slice(cursor, m.index) });
    }
    const content = m[1];
    if (content.includes(":")) {
      const colonIdx = content.indexOf(":");
      const prefixRaw = content.slice(0, colonIdx);
      const note = content.slice(colonIdx + 1).trim();
      const key = prefixRaw.replace(/\.\.\./g, "").replace(/\s+/g, " ").trim();
      let placed = false;
      if (key) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          if (p.type !== "text") continue;
          let idx = p.text.lastIndexOf(key);
          if (idx < 0) {
            const lower = p.text.toLowerCase();
            idx = lower.lastIndexOf(key.toLowerCase());
          }
          if (idx < 0) continue;
          const before = p.text.slice(0, idx);
          const tail = p.text.slice(idx);
          const periodMatch = tail.match(/^[^.]*\.?/);
          const targetLen = periodMatch ? periodMatch[0].length : tail.length;
          const target = tail.slice(0, targetLen);
          const after = tail.slice(targetLen);
          parts.splice(
            i,
            1,
            { type: "text", text: before },
            { type: "note", text: target, note },
            { type: "text", text: after }
          );
          placed = true;
          break;
        }
      }
      if (!placed) {
        parts.push({ type: "italic", text: `[${note}]` });
      }
    } else {
      parts.push({ type: "italic", text: content });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < raw.length) {
    parts.push({ type: "text", text: raw.slice(cursor) });
  }
  return parts;
}

// ---------------------------------------------------------------------------

export const BibleWidget: React.FC = () => {
  const parent = useLoaderData<any>();
  const isAdmin = parent?.user?.role === "administrator";

  const stateFetcher = useFetcher<FullState>();
  const chapterFetcher = useFetcher<Displayed>();
  const messageFetcher = useFetcher<{
    messages: BibleMessage[];
    aiFailed?: boolean;
  }>();
  const doneFetcher = useFetcher<FullState>();
  const highlightFetcher = useFetcher<{ highlights: number[] }>();

  const [state, setState] = useState<FullState | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDone, setConfirmDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Bootstrap: load full state on first mount.
  useEffect(() => {
    if (stateFetcher.state === "idle" && !stateFetcher.data && state === null) {
      stateFetcher.load("/api/bible/state");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (stateFetcher.state === "idle" && stateFetcher.data) {
      setState(stateFetcher.data);
    }
  }, [stateFetcher.state, stateFetcher.data]);

  // Navigation: replace `displayed` with the chapter fetch response,
  // preserving current/positions from the last full state.
  useEffect(() => {
    if (chapterFetcher.state === "idle" && chapterFetcher.data) {
      setState((prev) =>
        prev ? { ...prev, displayed: chapterFetcher.data! } : prev
      );
    }
  }, [chapterFetcher.state, chapterFetcher.data]);

  // Send message: swap in the returned message list on the displayed
  // block. Only fires when displayed == current (guarded by the UI).
  useEffect(() => {
    if (messageFetcher.state === "idle" && messageFetcher.data?.messages) {
      setState((prev) =>
        prev
          ? {
              ...prev,
              displayed: {
                ...prev.displayed,
                messages: messageFetcher.data!.messages,
                completed: false,
              },
            }
          : prev
      );
      setDraft("");
    }
  }, [messageFetcher.state, messageFetcher.data]);

  // DONE: server returns the fresh full state; adopt wholesale.
  useEffect(() => {
    if (doneFetcher.state === "idle" && doneFetcher.data) {
      setState(doneFetcher.data);
      setConfirmDone(false);
      setDraft("");
    }
  }, [doneFetcher.state, doneFetcher.data]);

  // Highlight toggle: server returns authoritative list.
  useEffect(() => {
    if (highlightFetcher.state === "idle" && highlightFetcher.data?.highlights) {
      setState((prev) =>
        prev
          ? {
              ...prev,
              displayed: {
                ...prev.displayed,
                highlights: highlightFetcher.data!.highlights,
              },
            }
          : prev
      );
    }
  }, [highlightFetcher.state, highlightFetcher.data]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state?.displayed.messages.length]);

  // ------------------------------------------------------------------
  // Derived flags
  // ------------------------------------------------------------------

  const isCurrentDisplayed = useMemo(() => {
    if (!state) return true;
    const c = state.current;
    const d = state.displayed;
    return c.stream === d.stream && c.book === d.book && c.chapter === d.chapter;
  }, [state]);

  const hasInProgress = useMemo(() => {
    if (!state) return false;
    const { messages, completed } = state.displayed;
    return messages.length > 0 && !completed;
  }, [state]);

  // Nav is blocked only when the admin has an active conversation on
  // the *current* chapter — that's the state where a stray click
  // would abandon a thread they're actively writing. Elsewhere
  // (public visitors, non-current chapter, no messages, or already-
  // completed messages) nav flows freely.
  const navBlocked = isAdmin && isCurrentDisplayed && hasInProgress;

  const sending = messageFetcher.state !== "idle";
  const advancing = doneFetcher.state !== "idle";
  const loading =
    chapterFetcher.state !== "idle" || stateFetcher.state !== "idle";

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const goToChapter = useCallback(
    (stream: Stream, book: string, chapter: number) => {
      if (navBlocked) return;
      const params = new URLSearchParams({
        stream,
        book,
        chapter: String(chapter),
      });
      chapterFetcher.load(`/api/bible/chapter?${params.toString()}`);
    },
    [chapterFetcher, navBlocked]
  );

  const navPrevChapter = () => {
    if (!state?.displayed.prevChapter) return;
    const { book, chapter } = state.displayed.prevChapter;
    goToChapter(state.displayed.stream, book, chapter);
  };
  const navNextChapter = () => {
    if (!state?.displayed.nextChapter) return;
    const { book, chapter } = state.displayed.nextChapter;
    goToChapter(state.displayed.stream, book, chapter);
  };
  const navPrevStream = () => {
    if (!state) return;
    const target = prevStreamOf(state.displayed.stream);
    const pos = state.positions[target];
    goToChapter(target, pos.book, pos.chapter);
  };
  const navNextStream = () => {
    if (!state) return;
    const target = nextStreamOf(state.displayed.stream);
    const pos = state.positions[target];
    goToChapter(target, pos.book, pos.chapter);
  };

  const returnToCurrent = () => {
    if (!state) return;
    const { stream, book, chapter } = state.current;
    goToChapter(stream, book, chapter);
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || sending || !isCurrentDisplayed) return;
    const fd = new FormData();
    fd.set("message", text);
    messageFetcher.submit(fd, {
      method: "post",
      action: "/api/bible/message",
    });
  };

  const markDone = () => {
    if (advancing || !isCurrentDisplayed) return;
    const fd = new FormData();
    doneFetcher.submit(fd, { method: "post", action: "/api/bible/done" });
  };

  const toggleHighlight = (verseIdx: number) => {
    if (!isAdmin || !state) return;
    const verseNum = verseIdx + 1;
    // Optimistic: flip locally now, sync with server after.
    setState((prev) => {
      if (!prev) return prev;
      const set = new Set(prev.displayed.highlights);
      if (set.has(verseNum)) set.delete(verseNum);
      else set.add(verseNum);
      return {
        ...prev,
        displayed: {
          ...prev.displayed,
          highlights: Array.from(set).sort((a, b) => a - b),
        },
      };
    });
    const fd = new FormData();
    fd.set("book", state.displayed.book);
    fd.set("chapter", String(state.displayed.chapter));
    fd.set("verse", String(verseNum));
    highlightFetcher.submit(fd, {
      method: "post",
      action: "/api/bible/highlight",
    });
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const chapterTitle = state ? `${state.displayed.book} ${state.displayed.chapter}` : "";
  const streamLabel = state ? STREAM_LABEL[state.displayed.stream] : "Loading";
  const canPrevChapter = !!state?.displayed.prevChapter && !navBlocked;
  const canNextChapter = !!state?.displayed.nextChapter && !navBlocked;
  const canPrevStream = !!state && !navBlocked;
  const canNextStream = !!state && !navBlocked;
  const highlightSet = useMemo(
    () => new Set(state?.displayed.highlights ?? []),
    [state?.displayed.highlights]
  );

  return (
    <>
      <style>{`
        .bible-widget {
          margin-bottom: 10px;
          font-family: 'PGM Sans', sans-serif;
        }
        .bible-widget__header-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .bible-widget__chev {
          background: transparent;
          border: 0;
          padding: 2px 6px;
          height: auto;
          font-size: 16px;
          line-height: 1;
          color: #506982;
          cursor: pointer;
        }
        .bible-widget__chev:disabled {
          color: #ccc;
          cursor: not-allowed;
        }
        .bible-widget__stream {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #999;
          margin-bottom: 2px;
        }
        .bible-widget__title {
          font-size: 15px;
          font-weight: 700;
          color: #000;
          text-align: center;
        }
        .bible-widget__body {
          padding: 10px 12px;
          font-size: 13px;
          line-height: 1.5;
          color: #333;
        }
        .bible-widget__banner {
          background: #eef2f7;
          padding: 6px 10px;
          margin-bottom: 8px;
          font-size: 11px;
          color: #506982;
          text-align: center;
          border-radius: 3px;
        }
        .bible-widget__banner button {
          padding: 0 6px;
          height: auto;
          background: transparent;
          color: #4A6CBA;
          border: 0;
          cursor: pointer;
          font: 600 11px 'PGM Sans', sans-serif;
          text-decoration: underline;
        }
        .bible-widget__verses {
          max-height: 260px;
          overflow-y: auto;
          padding-right: 6px;
          margin-bottom: 12px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        .bible-widget__verse {
          margin-bottom: 5px;
          font-size: 15px;
          line-height: 1.5;
          padding: 2px 4px;
          border-radius: 3px;
          transition: background 0.15s ease;
        }
        .bible-widget__verse--highlighted {
          background: #fff59d;
        }
        [data-theme="dark"] .bible-widget__verse--highlighted {
          background: #7c6b1a;
          color: #fffdf3;
        }
        .bible-widget__verse--clickable {
          cursor: pointer;
        }
        .bible-widget__verse--clickable:hover {
          background: #f4f6f9;
        }
        .bible-widget__verse--clickable.bible-widget__verse--highlighted:hover {
          background: #fce987;
        }
        .bible-widget__verse-num {
          color: #888;
          font-size: 10px;
          font-weight: 700;
          vertical-align: super;
          margin-right: 3px;
        }
        .bible-widget__note {
          border-bottom: 1px dotted #999;
          cursor: help;
        }
        [data-theme="dark"] .bible-widget__note {
          border-bottom-color: #94a3b8;
        }
        .bible-widget__messages {
          max-height: 300px;
          overflow-y: auto;
          padding-right: 6px;
        }
        .bible-widget__msg {
          padding: 8px 10px;
          margin-bottom: 6px;
          border-radius: 6px;
          font-size: 12px;
          line-height: 1.45;
          white-space: pre-wrap;
        }
        .bible-widget__msg--user {
          background: #eef2f7;
          color: #333;
        }
        .bible-widget__msg--assistant {
          background: #f7f8fa;
          color: #444;
          border: 1px solid #eee;
        }
        .bible-widget__msg-role {
          font-size: 10px;
          text-transform: uppercase;
          color: #888;
          letter-spacing: 0.05em;
          margin-bottom: 3px;
          font-weight: 700;
        }
        .bible-widget__empty {
          font-size: 12px;
          color: #999;
          font-style: italic;
          padding: 6px 4px;
        }
        .bible-widget__compose {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 10px;
        }
        .bible-widget__textarea {
          width: 100%;
          box-sizing: border-box;
          min-height: 60px;
          font: 13px 'PGM Sans', sans-serif;
          padding: 8px 10px;
          border: 1px solid #979997;
          border-radius: 4px;
          background: #fff;
          color: #333;
          resize: vertical;
        }
        .bible-widget__actions {
          display: flex;
          gap: 6px;
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .bible-widget__actions button {
          padding: 4px 10px 2px;
          height: auto;
        }
        .bible-widget__done {
          background: #4a8c4a !important;
        }
        .bible-widget__done--confirm {
          background: #b53838 !important;
        }
        .bible-widget__thinking {
          font-size: 12px;
          color: #888;
          font-style: italic;
          padding: 6px 4px;
        }
        .bible-widget__loading {
          padding: 12px;
          font-size: 12px;
          color: #999;
          text-align: center;
        }
        [data-theme="dark"] .bible-widget__body { color: #e5e7eb; }
        [data-theme="dark"] .bible-widget__title { color: #e5e7eb; }
        [data-theme="dark"] .bible-widget__stream,
        [data-theme="dark"] .bible-widget__banner { color: #94a3b8; }
        [data-theme="dark"] .bible-widget__banner { background: #232b36; }
        [data-theme="dark"] .bible-widget__banner button { color: #a1b5c9; }
        [data-theme="dark"] .bible-widget__chev { color: #a1b5c9; }
        [data-theme="dark"] .bible-widget__chev:disabled { color: #3a4553; }
        [data-theme="dark"] .bible-widget__verses { border-bottom-color: #2a3543; }
        [data-theme="dark"] .bible-widget__verse--clickable:hover { background: #232b36; }
        [data-theme="dark"] .bible-widget__msg--user {
          background: #232b36; color: #e5e7eb;
        }
        [data-theme="dark"] .bible-widget__msg--assistant {
          background: #1a2028; color: #cbd5e1; border-color: #2a3543;
        }
        [data-theme="dark"] .bible-widget__msg-role,
        [data-theme="dark"] .bible-widget__empty,
        [data-theme="dark"] .bible-widget__thinking,
        [data-theme="dark"] .bible-widget__loading {
          color: #94a3b8;
        }
        [data-theme="dark"] .bible-widget__textarea {
          background: #1a2028; border-color: #2a3543; color: #e5e7eb;
        }
      `}</style>
      <article className="postcard--left bible-widget">
        <div className="postcard__time" style={{ display: "block", textAlign: "center" }}>
          <div className="bible-widget__header-row">
            <button
              type="button"
              className="bible-widget__chev"
              onClick={navPrevStream}
              disabled={!canPrevStream}
              aria-label="Previous stream"
              title={navBlocked ? "Finish or DONE your current thread first" : "Previous stream"}
            >‹</button>
            <div className="bible-widget__stream">{streamLabel}</div>
            <button
              type="button"
              className="bible-widget__chev"
              onClick={navNextStream}
              disabled={!canNextStream}
              aria-label="Next stream"
              title={navBlocked ? "Finish or DONE your current thread first" : "Next stream"}
            >›</button>
          </div>
          <div className="bible-widget__header-row">
            <button
              type="button"
              className="bible-widget__chev"
              onClick={navPrevChapter}
              disabled={!canPrevChapter}
              aria-label="Previous chapter"
              title={
                navBlocked
                  ? "Finish or DONE your current thread first"
                  : state?.displayed.prevChapter
                  ? `Previous: ${state.displayed.prevChapter.book} ${state.displayed.prevChapter.chapter}`
                  : "Start of stream"
              }
            >‹</button>
            <div className="bible-widget__title">{chapterTitle || "Bible"}</div>
            <button
              type="button"
              className="bible-widget__chev"
              onClick={navNextChapter}
              disabled={!canNextChapter}
              aria-label="Next chapter"
              title={
                navBlocked
                  ? "Finish or DONE your current thread first"
                  : state?.displayed.nextChapter
                  ? `Next: ${state.displayed.nextChapter.book} ${state.displayed.nextChapter.chapter}`
                  : "End of stream"
              }
            >›</button>
          </div>
        </div>
        <div className="postcard__content">
          <div className="bible-widget__body">
            {!state ? (
              <div className="bible-widget__loading">Loading…</div>
            ) : (
              <>
                {/* Off-current banner: gently reminds the reader
                    they're browsing, offers one-click back to
                    wherever the reading plan actually sits. */}
                {!isCurrentDisplayed ? (
                  <div className="bible-widget__banner">
                    Browsing — reading plan is on {STREAM_LABEL[state.current.stream]}{" "}
                    {state.current.book} {state.current.chapter}.{" "}
                    <button type="button" onClick={returnToCurrent}>
                      Return
                    </button>
                  </div>
                ) : null}

                {loading ? (
                  <div className="bible-widget__loading">Loading chapter…</div>
                ) : (
                  <>
                    <div className="bible-widget__verses">
                      {state.displayed.verses.map((verse, i) => {
                        const parts = parseVerse(verse);
                        const verseNum = i + 1;
                        const isHi = highlightSet.has(verseNum);
                        const classes = [
                          "bible-widget__verse",
                          isHi ? "bible-widget__verse--highlighted" : "",
                          isAdmin ? "bible-widget__verse--clickable" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <div
                            key={i}
                            className={classes}
                            onClick={
                              isAdmin ? () => toggleHighlight(i) : undefined
                            }
                            title={isAdmin ? "Click to toggle highlight" : undefined}
                          >
                            <span className="bible-widget__verse-num">
                              {verseNum}
                            </span>
                            {parts.map((p, j) => {
                              if (!p.text) return null;
                              if (p.type === "italic")
                                return <em key={j}>{p.text}</em>;
                              if (p.type === "note") {
                                return (
                                  <span
                                    key={j}
                                    className="bible-widget__note"
                                    title={p.note}
                                  >
                                    {p.text}
                                  </span>
                                );
                              }
                              return <span key={j}>{p.text}</span>;
                            })}
                          </div>
                        );
                      })}
                    </div>

                    <div className="bible-widget__messages">
                      {state.displayed.messages.length === 0 ? (
                        <div className="bible-widget__empty">
                          {isAdmin && isCurrentDisplayed
                            ? "No questions yet."
                            : isCurrentDisplayed
                            ? "No questions on this chapter yet."
                            : state.displayed.completed
                            ? "No preserved notes on this chapter."
                            : "No questions on this chapter yet."}
                        </div>
                      ) : (
                        state.displayed.messages.map((m, i) => (
                          <div
                            key={i}
                            className={`bible-widget__msg bible-widget__msg--${m.role}`}
                          >
                            <div className="bible-widget__msg-role">
                              {m.role === "user" ? "Patrick" : "Companion"}
                            </div>
                            {m.content}
                          </div>
                        ))
                      )}
                      {sending ? (
                        <div className="bible-widget__thinking">
                          Companion is thinking…
                        </div>
                      ) : null}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Compose + DONE only when the displayed chapter
                        is the canonical current one. Elsewhere the
                        widget is fully read-only. */}
                    {isAdmin && isCurrentDisplayed ? (
                      <div className="bible-widget__compose">
                        <textarea
                          className="bible-widget__textarea"
                          placeholder="Questions, thoughts, notes?"
                          value={draft}
                          disabled={sending || advancing}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                              e.preventDefault();
                              sendMessage();
                            }
                          }}
                        />
                        <div className="bible-widget__actions">
                          <button
                            type="button"
                            onClick={sendMessage}
                            disabled={sending || advancing || !draft.trim()}
                            title="Send (⌘/Ctrl+Enter)"
                          >
                            {sending ? "SENDING…" : "SEND"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirmDone) markDone();
                              else setConfirmDone(true);
                            }}
                            disabled={sending || advancing}
                            className={`bible-widget__done ${
                              confirmDone ? "bible-widget__done--confirm" : ""
                            }`}
                            title="Mark this chapter complete and rotate to the next stream"
                          >
                            {advancing
                              ? "SAVING…"
                              : confirmDone
                              ? "CONFIRM DONE"
                              : "DONE"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </article>
    </>
  );
};
