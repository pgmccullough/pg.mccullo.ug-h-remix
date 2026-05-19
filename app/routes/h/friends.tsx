import type { LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";

import { getUser } from "~/utils/session.server";
import {
  listInboxPosts,
  getRemoteActors,
  cacheRemoteActor,
  extractActorProfile,
} from "~/utils/federation-inbox-posts.server";
import type {
  InboxPost,
  RemoteActorCache,
} from "~/utils/federation-inbox-posts.server";
import { listFollowing } from "~/utils/federation-following.server";
import type { FollowingRecord } from "~/utils/federation-following.server";
import { federation } from "~/utils/federation.server";
import { lookupObject } from "@fedify/fedify";
import { getMyReactionsFor } from "~/utils/federation-interactions.server";

const PRIMARY_USERNAME = "patrick";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Admin-only for now. (Could open to any signed-in user later.)
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    throw redirect("/h");
  }

  const url = new URL(request.url);
  const beforePublishedRaw = url.searchParams.get("before");
  const beforePublished = beforePublishedRaw ? Number(beforePublishedRaw) : undefined;

  const { items: posts, nextCursorMs } = await listInboxPosts({
    limit: 25,
    beforePublished: Number.isFinite(beforePublished) ? beforePublished : undefined,
  });

  const authorUris = Array.from(new Set(posts.map((p) => p.authorActorUri)));
  const actors = await getRemoteActors(authorUris);

  // List who we're following (pending + accepted, so the UI can reflect pending state).
  const { items: followingItems } = await listFollowing(PRIMARY_USERNAME, {
    limit: 200,
  });
  let followingActors = await getRemoteActors(
    followingItems.map((f) => f.actorUri)
  );

  // Self-heal: if any follow we know about has no cached avatar (likely
  // because they were followed before the extractor was robust), refetch
  // the actor doc and cache it. Bounded: at most 5 per page render to
  // keep loads snappy.
  const needRefresh = followingItems
    .filter((f) => !followingActors[f.actorUri]?.avatarUrl)
    .slice(0, 5);
  if (needRefresh.length) {
    const ctx = federation.createContext(new URL(url.origin), undefined);
    await Promise.allSettled(
      needRefresh.map(async (f) => {
        try {
          const actor = await lookupObject(f.actorUri, {
            documentLoader: ctx.documentLoader,
          });
          if (actor && (actor as any).id) {
            await cacheRemoteActor({
              ...extractActorProfile(actor, f.actorUri),
              updatedAt: Date.now(),
            });
          }
        } catch (err) {
          console.error(
            `[friends] failed to refresh actor ${f.actorUri}:`,
            err
          );
        }
      })
    );
    // Re-read after the refresh writes.
    followingActors = await getRemoteActors(
      followingItems.map((f) => f.actorUri)
    );
  }

  // Lookup which posts we've liked/boosted so the UI can show toggled state.
  const myReactions = await getMyReactionsFor(posts.map((p) => p.noteUri));

  // Also need each post's author inbox URL (for reaction delivery). Pull
  // it from the followers/following caches we already have, falling back
  // to undefined (the react API will dereference if missing).
  const inboxByActor: Record<string, string | undefined> = {};
  for (const f of followingItems) {
    if (f.inboxUri) inboxByActor[f.actorUri] = f.inboxUri;
  }

  return {
    posts,
    actors,
    nextCursorMs,
    myReactions,
    inboxByActor,
    following: followingItems.map((f) => ({
      ...f,
      profile: followingActors[f.actorUri] ?? null,
    })),
  };
};

type LoaderData = {
  posts: InboxPost[];
  actors: Record<string, RemoteActorCache>;
  nextCursorMs: number | null;
  myReactions: Record<string, { like?: boolean; boost?: boolean }>;
  inboxByActor: Record<string, string | undefined>;
  following: Array<
    FollowingRecord & { profile: RemoteActorCache | null }
  >;
};

function formatWhen(ms: number): string {
  const diff = Date.now() - ms;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.round(diff / min)}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 30 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function Friends() {
  const { posts, actors, nextCursorMs, following, myReactions, inboxByActor } =
    useLoaderData<LoaderData>();
  const followForm = useFetcher<{ ok?: boolean; status?: string; error?: string }>();
  const unfollowForm = useFetcher();
  const [handleInput, setHandleInput] = useState("");
  // Which post (by noteUri) currently has its reply composer open.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  return (
    <>
      <style>{`
        .friends {
          padding: 1rem;
        }
        .friends h2 {
          font-family: 'PGM Sans', sans-serif;
          font-weight: 600;
          color: #506982;
          margin: 0 0 0.75rem 0;
        }
        .friends__btn,
        .friends__btn:visited {
          height: auto;
          margin: 0;
          display: inline-block;
          padding: 8px 16px;
          background: #4A6CBA;
          color: #fff;
          font: 600 14px 'PGM Sans', sans-serif;
          border: 0;
          border-radius: 4px;
          cursor: pointer;
        }
        .friends__btn:hover { background: #506982; box-shadow: 0 0 0 3px #ccc; }
        .friends__btn--ghost {
          background: #fff;
          color: #4A6CBA;
          border: 1px solid #979997;
        }
        .friends__btn--ghost:hover { color: #506982; }
        .friends__following {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 1.5rem;
        }
        .friends__following-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: #fff;
          border: 1px solid #979997;
          border-radius: 999px;
          font-size: 13px;
        }
        .friends__following-chip img {
          width: 18px; height: 18px; border-radius: 50%;
        }
        .friends__following-chip button {
          margin-left: 4px;
          background: transparent;
          border: 0;
          color: #888;
          cursor: pointer;
          height: auto;
          padding: 0 2px;
        }
        .friends__error {
          color: #be0d0d;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .friend-post {
          background: #fff;
          border: 1px solid #979997;
          border-radius: 4px;
          margin-bottom: 14px;
          overflow: hidden;
        }
        .friend-post__head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid #e6e6e6;
          background: #eee;
        }
        .friend-post__head img {
          width: 32px; height: 32px; border-radius: 50%;
        }
        .friend-post__name {
          font-weight: 600;
          color: #506982;
        }
        .friend-post__when {
          color: #888;
          font-size: 12px;
          margin-left: auto;
        }
        .friend-post__body {
          padding: 12px 14px;
          line-height: 1.5;
        }
        .friend-post__body img,
        .friend-post__body video {
          max-width: 100%;
          border-radius: 4px;
          margin-top: 8px;
        }
        .friend-post__footer {
          padding: 8px 14px;
          font-size: 12px;
          color: #666;
        }
        .friend-post__actions {
          display: flex;
          gap: 6px;
          padding: 6px 10px;
          border-top: 1px solid #eee;
          background: #fafafa;
        }
        .friend-post__action,
        .friend-post__action:visited {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: transparent;
          border: 1px solid transparent;
          padding: 4px 10px;
          border-radius: 999px;
          cursor: pointer;
          font: 600 12px 'PGM Sans', sans-serif;
          color: #888;
          line-height: 1.2;
          height: auto;
          margin: 0;
          transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .friend-post__action:hover {
          background: #fff;
          border-color: #ddd;
          color: #506982;
        }
        .friend-post__action--active--like {
          background: #fde4e4;
          color: #b03030;
          border-color: #f3c0c0;
        }
        .friend-post__action--active--boost {
          background: #dff0e3;
          color: #297a3e;
          border-color: #b8dfc1;
        }
        .reply-composer {
          padding: 8px 14px 14px;
          border-top: 1px solid #eee;
          background: #fafafa;
        }
        .reply-composer textarea {
          width: 100%;
          min-height: 70px;
          padding: 8px 10px;
          font: 14px 'PGM Sans', sans-serif;
          border: 1px solid #979997;
          border-radius: 4px;
          resize: vertical;
          box-sizing: border-box;
        }
        .reply-composer__row {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
          margin-top: 6px;
        }
      `}</style>

      <section className="friends">
        <followForm.Form
          method="post"
          action="/api/federation/follow"
          className="search"
          onSubmit={() => {
            // Clear after submit if it looks successful — best effort.
            setTimeout(() => setHandleInput(""), 100);
          }}
        >
          <input
            className="search__input"
            type="text"
            name="handle"
            placeholder="@user@server.tld  or  https://server.tld/users/user"
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
          />
          <button
            type="submit"
            className={`search__button${
              handleInput.length === 0 ? " search__button--disabled" : ""
            }`}
            disabled={handleInput.length === 0}
          >
            FOLLOW
          </button>
        </followForm.Form>
        {followForm.data?.error && (
          <div className="friends__error">{followForm.data.error}</div>
        )}
        {followForm.data?.ok && followForm.data.status === "pending" && (
          <div style={{ fontSize: 13, color: "#506982", marginBottom: 12 }}>
            Sent. Waiting for them to accept the follow.
          </div>
        )}

        {following.length > 0 && (
          <>
            <h2>Following ({following.filter((f) => f.status === "accepted").length})</h2>
            <div className="friends__following">
              {following.map((f) => (
                <span key={f.actorUri} className="friends__following-chip">
                  {f.profile?.avatarUrl ? (
                    <img src={f.profile.avatarUrl} alt="" />
                  ) : null}
                  <span>
                    {f.profile?.displayName ||
                      f.profile?.fqHandle ||
                      f.actorUri}
                  </span>
                  {f.status === "pending" && (
                    <em style={{ color: "#888", fontSize: 11 }}> (pending)</em>
                  )}
                  <unfollowForm.Form
                    method="post"
                    action="/api/federation/unfollow"
                    style={{ display: "inline" }}
                  >
                    <input type="hidden" name="actorUri" value={f.actorUri} />
                    <button type="submit" title="Unfollow">×</button>
                  </unfollowForm.Form>
                </span>
              ))}
            </div>
          </>
        )}

        <h2>Recent posts</h2>
        {posts.length === 0 ? (
          <div style={{ fontSize: 14, color: "#666" }}>
            Nothing here yet. Follow someone above, then wait for them to post.
          </div>
        ) : (
          posts.map((p) => {
            const author = actors[p.authorActorUri];
            const name =
              author?.displayName || author?.fqHandle || p.authorActorUri;
            return (
              <article className="friend-post" key={p.noteUri}>
                <header className="friend-post__head">
                  {author?.avatarUrl ? <img src={author.avatarUrl} alt="" /> : null}
                  <span className="friend-post__name">{name}</span>
                  {author?.fqHandle && author.fqHandle !== name && (
                    <span style={{ color: "#888", fontSize: 12 }}>
                      {author.fqHandle}
                    </span>
                  )}
                  <span className="friend-post__when">
                    {formatWhen(p.published)}
                  </span>
                </header>
                <div
                  className="friend-post__body"
                  dangerouslySetInnerHTML={{ __html: p.content }}
                />
                {p.attachments?.length ? (
                  <div className="friend-post__body" style={{ paddingTop: 0 }}>
                    {p.attachments.map((a) =>
                      a.type === "Image" ? (
                        <img key={a.url} src={a.url} alt="" />
                      ) : a.type === "Video" ? (
                        <video key={a.url} src={a.url} controls />
                      ) : a.type === "Audio" ? (
                        <audio key={a.url} src={a.url} controls />
                      ) : (
                        <a key={a.url} href={a.url} target="_blank" rel="noreferrer">
                          {a.url}
                        </a>
                      )
                    )}
                  </div>
                ) : null}
                <PostActions
                  post={p}
                  myReactions={myReactions[p.noteUri]}
                  authorInbox={inboxByActor[p.authorActorUri]}
                  onReplyToggle={() =>
                    setReplyingTo((cur) => (cur === p.noteUri ? null : p.noteUri))
                  }
                  isReplying={replyingTo === p.noteUri}
                />
                {replyingTo === p.noteUri && (
                  <ReplyComposer
                    post={p}
                    authorInbox={inboxByActor[p.authorActorUri]}
                    onDone={() => setReplyingTo(null)}
                  />
                )}
                {p.url && (
                  <footer className="friend-post__footer">
                    <a href={p.url} target="_blank" rel="noreferrer">
                      View original
                    </a>
                  </footer>
                )}
              </article>
            );
          })
        )}

        {nextCursorMs != null && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <a
              className="friends__btn friends__btn--ghost"
              href={`/h/friends?before=${nextCursorMs}`}
            >
              Older posts
            </a>
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components for actions + reply composer
// ---------------------------------------------------------------------------

const PostActions: React.FC<{
  post: InboxPost;
  myReactions?: { like?: boolean; boost?: boolean };
  authorInbox?: string;
  isReplying: boolean;
  onReplyToggle: () => void;
}> = ({ post, myReactions, authorInbox, isReplying, onReplyToggle }) => {
  const fetcher = useFetcher<{ ok?: boolean; status?: string; error?: string }>();
  // Optimistic state — derive from local fetcher submissions in-flight
  // so the button toggles instantly even before the round-trip resolves.
  const liked = fetcher.formData?.get("kind") === "like"
    ? fetcher.formData.get("undo") !== "1"
    : myReactions?.like;
  const boosted = fetcher.formData?.get("kind") === "boost"
    ? fetcher.formData.get("undo") !== "1"
    : myReactions?.boost;

  const submit = (kind: "like" | "boost", undo: boolean) => {
    const fd = new FormData();
    fd.set("noteUri", post.noteUri);
    fd.set("authorUri", post.authorActorUri);
    if (authorInbox) fd.set("inboxUri", authorInbox);
    fd.set("kind", kind);
    if (undo) fd.set("undo", "1");
    fetcher.submit(fd, { method: "post", action: "/api/federation/react" });
  };

  return (
    <div className="friend-post__actions">
      <button
        type="button"
        className={`friend-post__action${liked ? " friend-post__action--active--like" : ""}`}
        onClick={() => submit("like", !!liked)}
        title={liked ? "Unlike" : "Like"}
      >
        {liked ? "♥" : "♡"} Like
      </button>
      <button
        type="button"
        className={`friend-post__action${boosted ? " friend-post__action--active--boost" : ""}`}
        onClick={() => submit("boost", !!boosted)}
        title={boosted ? "Undo boost" : "Boost"}
      >
        🔁 {boosted ? "Boosted" : "Boost"}
      </button>
      <button
        type="button"
        className="friend-post__action"
        onClick={onReplyToggle}
        title="Reply"
      >
        💬 {isReplying ? "Cancel" : "Reply"}
      </button>
    </div>
  );
};

const ReplyComposer: React.FC<{
  post: InboxPost;
  authorInbox?: string;
  onDone: () => void;
}> = ({ post, authorInbox, onDone }) => {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [text, setText] = useState("");

  useEffect(() => {
    if (fetcher.data?.ok) {
      setText("");
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const submit = () => {
    if (!text.trim()) return;
    const fd = new FormData();
    fd.set("parentNoteUri", post.noteUri);
    fd.set("parentAuthorUri", post.authorActorUri);
    if (authorInbox) fd.set("parentInboxUri", authorInbox);
    // Wrap plain text in a <p> so the sanitizer + Mastodon render it
    // sensibly.
    fd.set("content", `<p>${escapeHtml(text)}</p>`);
    fetcher.submit(fd, { method: "post", action: "/api/federation/reply" });
  };

  return (
    <div className="reply-composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply..."
        autoFocus
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
        }}
      />
      {fetcher.data?.error && (
        <div style={{ color: "#be0d0d", fontSize: 12, marginTop: 4 }}>
          {fetcher.data.error}
        </div>
      )}
      <div className="reply-composer__row">
        <button
          type="button"
          className="friends__btn friends__btn--ghost"
          onClick={onDone}
        >
          Cancel
        </button>
        <button
          type="button"
          className="friends__btn"
          onClick={submit}
          disabled={!text.trim() || fetcher.state !== "idle"}
        >
          {fetcher.state !== "idle" ? "Sending…" : "Reply"}
        </button>
      </div>
    </div>
  );
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
