import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";

/**
 * BibleWidget — sidebar postcard for reading + notating the Bible
 * one chapter at a time, rotating through OT → Proverbs → Psalms →
 * NT. Public visitors see the chapter text + the ongoing thread of
 * questions and AI responses; admin gets the textarea, Send, and
 * DONE controls.
 *
 * Data flow:
 *   - On mount, GET /api/bible/state (public) → chapter + thread.
 *   - Admin sends a message → POST /api/bible/message returns the
 *     full updated thread; local state swaps in.
 *   - Admin hits DONE → POST /api/bible/done returns the next
 *     chapter's state; local state swaps in without a reload.
 */

interface BibleMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface BibleData {
  stream: "OT" | "PROV" | "PSALM" | "NT";
  book: string;
  chapter: number;
  verses: string[];
  messages: BibleMessage[];
}

const STREAM_LABEL: Record<BibleData["stream"], string> = {
  OT: "Old Testament",
  PROV: "Proverbs",
  PSALM: "Psalms",
  NT: "New Testament",
};

export const BibleWidget: React.FC = () => {
  // Root loader gives us `user` — used to gate the admin controls.
  // The widget is rendered from Sidebar which is rendered from
  // h.tsx, so useLoaderData here reads Sidebar's parent (h.tsx)
  // loader shape. Fall back defensively.
  const parent = useLoaderData<any>();
  const isAdmin = parent?.user?.role === "administrator";

  const stateFetcher = useFetcher<BibleData>();
  const messageFetcher = useFetcher<{ messages: BibleMessage[]; aiFailed?: boolean }>();
  const doneFetcher = useFetcher<BibleData>();

  const [data, setData] = useState<BibleData | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [confirmDone, setConfirmDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch on mount. Idle after first response.
  useEffect(() => {
    if (stateFetcher.state === "idle" && !stateFetcher.data && data === null) {
      stateFetcher.load("/api/bible/state");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adopt fetcher payloads into local state so subsequent mutations
  // (send message, DONE) can update the view without another loader
  // roundtrip.
  useEffect(() => {
    if (stateFetcher.state === "idle" && stateFetcher.data) {
      setData(stateFetcher.data);
    }
  }, [stateFetcher.state, stateFetcher.data]);

  useEffect(() => {
    if (messageFetcher.state === "idle" && messageFetcher.data?.messages) {
      setData((prev) =>
        prev ? { ...prev, messages: messageFetcher.data!.messages } : prev
      );
      setDraft("");
    }
  }, [messageFetcher.state, messageFetcher.data]);

  useEffect(() => {
    if (doneFetcher.state === "idle" && doneFetcher.data) {
      setData(doneFetcher.data);
      setConfirmDone(false);
      setDraft("");
    }
  }, [doneFetcher.state, doneFetcher.data]);

  // Auto-scroll the messages area on new content.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data?.messages.length]);

  const sending = messageFetcher.state !== "idle";
  const advancing = doneFetcher.state !== "idle";

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || sending) return;
    const fd = new FormData();
    fd.set("message", text);
    messageFetcher.submit(fd, {
      method: "post",
      action: "/api/bible/message",
    });
  };

  const markDone = () => {
    if (advancing) return;
    const fd = new FormData();
    doneFetcher.submit(fd, {
      method: "post",
      action: "/api/bible/done",
    });
  };

  // The verse column and the message column can each get long;
  // wrap in scrollable regions so the widget doesn't push the rest
  // of the sidebar off-screen.
  const chapterTitle = useMemo(() => {
    if (!data) return "";
    return `${data.book} ${data.chapter}`;
  }, [data]);

  return (
    <>
      <style>{`
        .bible-widget {
          margin-bottom: 10px;
          font-family: 'PGM Sans', sans-serif;
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
        }
        .bible-widget__verse-num {
          color: #888;
          font-size: 10px;
          font-weight: 700;
          vertical-align: super;
          margin-right: 3px;
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
        [data-theme="dark"] .bible-widget__stream { color: #94a3b8; }
        [data-theme="dark"] .bible-widget__verses { border-bottom-color: #2a3543; }
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
          <div className="bible-widget__stream">
            {data ? STREAM_LABEL[data.stream] : "Loading"}
          </div>
          <div className="bible-widget__title">{chapterTitle || "Bible"}</div>
        </div>
        <div className="postcard__content">
          <div className="bible-widget__body">
            {!data ? (
              <div className="bible-widget__loading">Loading…</div>
            ) : (
              <>
                <div className="bible-widget__verses">
                  {data.verses.map((verse, i) => (
                    <div key={i} className="bible-widget__verse">
                      <span className="bible-widget__verse-num">{i + 1}</span>
                      {verse}
                    </div>
                  ))}
                </div>

                <div className="bible-widget__messages">
                  {data.messages.length === 0 ? (
                    <div className="bible-widget__empty">
                      {isAdmin
                        ? "No questions yet."
                        : "Patrick hasn't written any questions on this chapter yet."}
                    </div>
                  ) : (
                    data.messages.map((m, i) => (
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
                    <div className="bible-widget__thinking">Companion is thinking…</div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>

                {isAdmin ? (
                  <div className="bible-widget__compose">
                    <textarea
                      className="bible-widget__textarea"
                      placeholder="Questions, thoughts, notes?"
                      value={draft}
                      disabled={sending || advancing}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        // Cmd/Ctrl+Enter sends. Keeps normal Enter
                        // available for line breaks so long notes
                        // stay readable.
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
                        className={`bible-widget__done ${confirmDone ? "bible-widget__done--confirm" : ""}`}
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
          </div>
        </div>
      </article>
    </>
  );
};
