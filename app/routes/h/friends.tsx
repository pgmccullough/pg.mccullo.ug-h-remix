import type { LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { TextEditor } from "~/components/TextEditor/TextEditor";
import { stampToTime } from "~/functions/functions";

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
import { clientPromise } from "~/lib/mongodb";
import { fetchBlueskyTimeline, blueskyEnabled } from "~/utils/bluesky.server";

const PRIMARY_USERNAME = "patrick";

// Both Mastodon-inbox posts and Bluesky timeline posts get normalized
// into this shape so the friends-feed UI renders them uniformly.
type UnifiedPost = {
  source: "mastodon" | "bluesky";
  noteUri: string;
  authorActorUri: string;
  content: string;
  url?: string;
  published: number;
  attachments?: Array<{
    type: "Image" | "Video" | "Audio" | "Document";
    url: string;
    mediaType?: string;
  }>;
  inReplyTo?: string;
  announcedBy?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Admin-only for now. (Could open to any signed-in user later.)
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    throw redirect("/h");
  }

  const url = new URL(request.url);
  const beforePublishedRaw = url.searchParams.get("before");
  const beforePublished = beforePublishedRaw ? Number(beforePublishedRaw) : undefined;

  const { items: inboxPosts, nextCursorMs } = await listInboxPosts({
    limit: 25,
    beforePublished: Number.isFinite(beforePublished) ? beforePublished : undefined,
  });

  // Pull Bluesky timeline alongside if credentials are configured.
  // (Bluesky fetch only when on the first page; pagination not wired yet.)
  let blueskyPosts: Awaited<ReturnType<typeof fetchBlueskyTimeline>> = [];
  if (blueskyEnabled() && beforePublished === undefined) {
    try {
      blueskyPosts = await fetchBlueskyTimeline({ limit: 25 });
    } catch (err) {
      console.error("[friends] Bluesky fetch failed:", err);
    }
  }

  // Normalize both sources into one shape the UI can render uniformly.
  const unifiedFromMastodon: UnifiedPost[] = inboxPosts.map((p) => ({
    source: "mastodon",
    noteUri: p.noteUri,
    authorActorUri: p.authorActorUri,
    content: p.content,
    url: p.url,
    published: p.published,
    attachments: p.attachments,
    inReplyTo: p.inReplyTo,
    announcedBy: p.announcedBy,
  }));

  const unifiedFromBluesky: UnifiedPost[] = blueskyPosts.map((p) => ({
    source: "bluesky",
    noteUri: p.uri,
    // Treat the at:// "did:.../app.bsky..." chain as the "actor uri".
    // We also pass extra-typed fields separately via the actors lookup
    // below so the existing renderer can pull a name/avatar.
    authorActorUri: `bsky:${p.authorDid}`,
    content: `<p>${escapeHtml(p.text).replace(/\n/g, "<br/>")}</p>`,
    url: p.webUrl,
    published: p.publishedMs,
    attachments: p.images.length
      ? p.images.map((img) => ({
          type: "Image" as const,
          url: img.url,
        }))
      : undefined,
  }));

  // Merge by timestamp, newest first.
  const posts = [...unifiedFromMastodon, ...unifiedFromBluesky].sort(
    (a, b) => b.published - a.published
  );

  // Build author cache. Mastodon authors come from getRemoteActors;
  // Bluesky authors we synthesize from the timeline data itself.
  const authorUris = Array.from(new Set(unifiedFromMastodon.map((p) => p.authorActorUri)));
  const actors: Record<string, any> = await getRemoteActors(authorUris);
  for (const p of blueskyPosts) {
    const key = `bsky:${p.authorDid}`;
    actors[key] = {
      actorUri: key,
      handle: p.authorHandle,
      fqHandle: `@${p.authorHandle}`,
      displayName: p.authorDisplayName,
      avatarUrl: p.authorAvatarUrl,
      profileUrl: `https://bsky.app/profile/${p.authorHandle}`,
      updatedAt: Date.now(),
    };
  }

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

  // Pull replies threaded under any of the visible posts.
  //   - Our own replies live in myPosts where inReplyTo matches
  //   - Others' replies live in federation_inbox_posts where inReplyTo matches
  const visibleNoteUris = posts.map((p) => p.noteUri);
  const repliesByParent: Record<
    string,
    Array<{
      kind: "mine" | "remote";
      content: string;
      authorActorUri: string;
      timestampMs: number;
      noteUri: string;
      url?: string;
    }>
  > = {};
  if (visibleNoteUris.length) {
    const mongoClient = await clientPromise;
    const db = mongoClient.db("user_posts");
    const myActorUri = `https://pg.mccullo.ug/users/${PRIMARY_USERNAME}`;

    const [mineRaw, inboxRaw] = await Promise.all([
      db
        .collection("myPosts")
        .find({ inReplyTo: { $in: visibleNoteUris } })
        .sort({ created: -1 })
        .toArray(),
      db
        .collection("federation_inbox_posts")
        .find({
          inReplyTo: { $in: visibleNoteUris },
          deleted: { $ne: true },
        })
        .sort({ published: -1 })
        .toArray(),
    ]);

    for (const p of mineRaw as any[]) {
      const key = p.inReplyTo as string;
      (repliesByParent[key] ??= []).push({
        kind: "mine",
        content: p.content ?? "",
        authorActorUri: myActorUri,
        timestampMs:
          typeof p.created === "number" ? p.created * 1000 : Date.now(),
        noteUri: `${myActorUri}/posts/${p._id.toString()}`,
        url: `https://pg.mccullo.ug/h/post/${p._id.toString()}`,
      });
    }
    for (const p of inboxRaw as any[]) {
      const key = p.inReplyTo as string;
      (repliesByParent[key] ??= []).push({
        kind: "remote",
        content: p.content ?? "",
        authorActorUri: p.authorActorUri,
        timestampMs: p.published ?? Date.now(),
        noteUri: p.noteUri,
        url: p.url,
      });
    }

    // Sort each thread oldest → newest (conversation reads top to bottom).
    for (const k of Object.keys(repliesByParent)) {
      repliesByParent[k].sort((a, b) => a.timestampMs - b.timestampMs);
    }

    // Also pull author profile data for any remote-reply authors we don't
    // already have cached.
    const remoteAuthorUris = Array.from(
      new Set(
        Object.values(repliesByParent)
          .flat()
          .filter((r) => r.kind === "remote")
          .map((r) => r.authorActorUri)
      )
    );
    const missingAuthorUris = remoteAuthorUris.filter((u) => !actors[u]);
    if (missingAuthorUris.length) {
      const moreActors = await getRemoteActors(missingAuthorUris);
      for (const [k, v] of Object.entries(moreActors)) actors[k] = v;
    }
  }

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
    repliesByParent,
    following: followingItems.map((f) => ({
      ...f,
      profile: followingActors[f.actorUri] ?? null,
    })),
  };
};

type ThreadedReply = {
  kind: "mine" | "remote";
  content: string;
  authorActorUri: string;
  timestampMs: number;
  noteUri: string;
  url?: string;
};

type LoaderData = {
  posts: UnifiedPost[];
  actors: Record<string, RemoteActorCache>;
  nextCursorMs: number | null;
  myReactions: Record<string, { like?: boolean; boost?: boolean }>;
  inboxByActor: Record<string, string | undefined>;
  repliesByParent: Record<string, ThreadedReply[]>;
  following: Array<
    FollowingRecord & { profile: RemoteActorCache | null }
  >;
};

// formatWhen removed — friend posts now use stampToTime from the rest of
// the site so timestamps match the home feed exactly.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function Friends() {
  const { posts, actors, nextCursorMs, following, myReactions, inboxByActor, repliesByParent } =
    useLoaderData<LoaderData>();
  const followForm = useFetcher<{ ok?: boolean; status?: string; error?: string }>();
  const unfollowForm = useFetcher();
  const [handleInput, setHandleInput] = useState("");

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
        /* Author header above the postcard body — mirrors the home feed's
           on-this-day strip visually but identifies the friend who posted. */
        .friend-author {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: #eee;
          border: 1px solid #979997;
          border-bottom: 0;
          border-radius: 4px 4px 0 0;
          font-size: 13px;
          color: #555;
        }
        .friend-author img {
          width: 28px; height: 28px; border-radius: 50%;
        }
        .friend-author__name { font-weight: 600; color: #506982; }
        .friend-author__handle { color: #888; font-size: 12px; }
        .friend-author__via {
          margin-left: auto; font-size: 11px; color: #888;
        }
        .friend-author + .postcard { margin-top: 0; }
        .friend-author + .postcard .postcard__time {
          border-top: 0;
          border-radius: 0;
        }

        /* Threaded replies under a friend post — visual rhyme with the
           home-feed Comments component. */
        .friend-replies {
          margin-top: 12px;
          border-top: 1px solid #eee;
          padding-top: 8px;
        }
        .friend-reply {
          display: flex;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid #f3f3f3;
        }
        .friend-reply:last-child { border-bottom: 0; }
        .friend-reply__avatar {
          width: 32px; height: 32px; border-radius: 50%;
          object-fit: cover;
          background: #ddd;
        }
        .friend-reply__avatar--placeholder { background: #4A6CBA; }
        .friend-reply__body { flex: 1; min-width: 0; }
        .friend-reply__head {
          display: flex; align-items: baseline; gap: 8px;
          font-size: 13px;
        }
        .friend-reply__name { font-weight: 600; color: #506982; }
        .friend-reply__handle { color: #888; font-size: 12px; }
        .friend-reply__when {
          margin-left: auto; color: #888; font-size: 11px;
        }
        .friend-reply__content {
          font-size: 14px; line-height: 1.4; margin-top: 2px;
        }
        .friend-reply__content p { margin: 0.3rem 0; }

        /* Heart-only React popup — same chrome as EmojiReact, single emoji. */
        .heart-react__pop {
          display: none;
          position: absolute;
          background: #fff;
          border: 1px solid #ccc;
          border-radius: 999px;
          padding: 6px 10px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.08);
          z-index: 10;
          margin-top: 4px;
        }
        .heart-react__pop--open { display: inline-flex; gap: 4px; }
        .heart-react__pop button {
          background: transparent; border: 0; cursor: pointer;
          font-size: 22px; height: auto; padding: 0 4px;
          line-height: 1;
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
          posts.map((p) => (
            <FriendPostCard
              key={p.noteUri}
              post={p}
              author={actors[p.authorActorUri]}
              authorInbox={inboxByActor[p.authorActorUri]}
              myReactions={myReactions[p.noteUri]}
              replies={repliesByParent[p.noteUri] ?? []}
              actorsLookup={actors}
            />
          ))
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
// FriendPostCard — renders a remote post in the same chrome as the home-feed
// PostCard, with a heart-only React popup and the Lexical comment editor.
// ---------------------------------------------------------------------------

const FriendPostCard: React.FC<{
  post: UnifiedPost;
  author?: RemoteActorCache;
  authorInbox?: string;
  myReactions?: { like?: boolean; boost?: boolean };
  replies?: ThreadedReply[];
  actorsLookup?: Record<string, RemoteActorCache>;
}> = ({ post, author, authorInbox, myReactions, replies, actorsLookup }) => {
  const reactFetcher = useFetcher<{ ok?: boolean }>();
  const replyFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [popOpen, setPopOpen] = useState(false);
  const [replyHtml, setReplyHtml] = useState("");
  const [clearContent, setClearContent] = useState(false);

  // Optimistic like state: when a submit is in-flight, reflect its intent.
  const liked = reactFetcher.formData
    ? reactFetcher.formData.get("undo") !== "1"
    : !!myReactions?.like;

  const toggleHeart = () => {
    const fd = new FormData();
    fd.set("noteUri", post.noteUri);
    fd.set("authorUri", post.authorActorUri);
    if (authorInbox) fd.set("inboxUri", authorInbox);
    fd.set("kind", "like");
    if (liked) fd.set("undo", "1");
    reactFetcher.submit(fd, { method: "post", action: "/api/federation/react" });
    setPopOpen(false);
  };

  const submitReply = () => {
    const trimmed = replyHtml.replace(/<[^>]+>/g, "").trim();
    if (!trimmed) return;
    const fd = new FormData();
    fd.set("parentNoteUri", post.noteUri);
    fd.set("parentAuthorUri", post.authorActorUri);
    if (authorInbox) fd.set("parentInboxUri", authorInbox);
    fd.set("content", replyHtml);
    replyFetcher.submit(fd, { method: "post", action: "/api/federation/reply" });
  };

  useEffect(() => {
    if (replyFetcher.data?.ok) {
      setReplyHtml("");
      setClearContent(true);
    }
  }, [replyFetcher.data]);

  useEffect(() => {
    if (clearContent) setClearContent(false);
  }, [replyHtml, clearContent]);

  const name = author?.displayName || author?.fqHandle || post.authorActorUri;

  return (
    <>
      {/* Author strip — sits above the postcard, identifies who posted. */}
      <div className="friend-author">
        {author?.avatarUrl ? <img src={author.avatarUrl} alt="" /> : null}
        <span className="friend-author__name">{name}</span>
        {author?.fqHandle && author.fqHandle !== name && (
          <span className="friend-author__handle">{author.fqHandle}</span>
        )}
        <span
          className="friend-author__source"
          title={post.source === "bluesky" ? "From Bluesky" : "From Mastodon"}
          style={{ marginLeft: 6 }}
        >
          {post.source === "bluesky" ? "🦋" : "🐘"}
        </span>
        {post.url ? (
          <a
            className="friend-author__via"
            href={post.url}
            target="_blank"
            rel="noreferrer"
          >
            view original
          </a>
        ) : null}
      </div>
      <article className="postcard">
        <div className="postcard__time">
          <div className="postcard__time__link">
            <time dateTime={String(post.published / 1000)}>
              {stampToTime(post.published / 1000)}
            </time>
          </div>
        </div>
        <div className="postcard__content">
          {post.attachments?.length ? (
            <div className="postcard__content__media">
              <figure className="postcard__content__media__slider">
                {post.attachments.map((a) =>
                  a.type === "Image" ? (
                    <img key={a.url} src={a.url} alt="" style={{ maxWidth: "100%" }} />
                  ) : a.type === "Video" ? (
                    <video key={a.url} src={a.url} controls style={{ maxWidth: "100%" }} />
                  ) : a.type === "Audio" ? (
                    <audio key={a.url} src={a.url} controls />
                  ) : (
                    <a key={a.url} href={a.url} target="_blank" rel="noreferrer">
                      {a.url}
                    </a>
                  )
                )}
              </figure>
            </div>
          ) : null}
          <div className="postcard__content__text">
            <div className="fake-p" dangerouslySetInnerHTML={{ __html: post.content }} />
          </div>
          <div className="postcard__content__meta">
            {/* Heart-only react button, visually matches EmojiReact. */}
            <div className="emoji-parent" style={{ display: "inline-block", position: "relative" }}>
              <button
                className="react-button"
                onClick={() => setPopOpen((v) => !v)}
                style={{ display: "inline-flex", alignItems: "center" }}
              >
                {liked ? "❤️" : "😀"} REACT
              </button>
              <div className={`heart-react__pop${popOpen ? " heart-react__pop--open" : ""}`}>
                <button
                  type="button"
                  onClick={toggleHeart}
                  title={liked ? "Remove heart" : "Send heart"}
                >
                  ❤️
                </button>
              </div>
              {liked && (
                <div className="emoji-votes" style={{ display: "inline-flex", marginLeft: 8 }}>
                  <div className="emoji-vote emoji-vote--mine">
                    <div className="emoji-vote-emoji">❤️</div>
                    <div className="emoji-vote-count">1</div>
                  </div>
                </div>
              )}
            </div>
            {/* Threaded replies — your own (from myPosts) + others
                received via federation_inbox_posts. */}
            {replies && replies.length > 0 && (
              <div className="friend-replies">
                {replies.map((r) => {
                  const ra = actorsLookup?.[r.authorActorUri];
                  const isMine = r.kind === "mine";
                  const displayName = isMine
                    ? "You"
                    : ra?.displayName || ra?.fqHandle || r.authorActorUri;
                  return (
                    <div key={r.noteUri} className="friend-reply">
                      <div className="friend-reply__poster">
                        {!isMine && ra?.avatarUrl ? (
                          <img
                            className="friend-reply__avatar"
                            src={ra.avatarUrl}
                            alt=""
                          />
                        ) : (
                          <div className="friend-reply__avatar friend-reply__avatar--placeholder" />
                        )}
                      </div>
                      <div className="friend-reply__body">
                        <div className="friend-reply__head">
                          <span className="friend-reply__name">{displayName}</span>
                          {!isMine && ra?.fqHandle && ra.fqHandle !== displayName && (
                            <span className="friend-reply__handle">
                              {ra.fqHandle}
                            </span>
                          )}
                          <span className="friend-reply__when">
                            {stampToTime(r.timestampMs / 1000)}
                          </span>
                        </div>
                        <div
                          className="friend-reply__content fake-p"
                          dangerouslySetInnerHTML={{ __html: r.content }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reply via the same Lexical editor the home-feed Comments use. */}
            <div style={{ marginTop: 12 }}>
              <TextEditor
                contentStateSetter={setReplyHtml}
                clearContent={clearContent}
                placeholderText="Reply..."
                styleClass="comment__input"
              />
              {replyFetcher.data?.error && (
                <div style={{ color: "#be0d0d", fontSize: 12, margin: "4px 0" }}>
                  {replyFetcher.data.error}
                </div>
              )}
              <button onClick={submitReply} disabled={replyFetcher.state !== "idle"}>
                {replyFetcher.state !== "idle" ? "SENDING…" : "SUBMIT"}
              </button>
            </div>
          </div>
        </div>
      </article>
    </>
  );
};
