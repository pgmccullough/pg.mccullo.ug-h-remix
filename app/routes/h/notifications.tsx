import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";

import { getUser } from "~/utils/session.server";
import {
  listNotifications,
  markAllNotificationsRead,
  type FederationNotification,
} from "~/utils/federation-interactions.server";
import {
  getRemoteActors,
  type RemoteActorCache,
} from "~/utils/federation-inbox-posts.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

interface PostStub {
  id: string;
  content: string;
  created: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    throw redirect("/h");
  }

  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const beforeMs = before ? Number(before) : undefined;

  const { items: notifications, nextCursorMs } = await listNotifications({
    limit: 50,
    beforeReceivedAt: Number.isFinite(beforeMs) ? beforeMs : undefined,
  });

  // Mark everything read on view.
  await markAllNotificationsRead();

  // Resolve actor profiles for the people who acted.
  const actorUris = Array.from(
    new Set(notifications.map((n) => n.sourceActorUri))
  );
  const actors = await getRemoteActors(actorUris);

  // Resolve our own posts that are targets.
  const postIds = Array.from(
    new Set(
      notifications
        .map((n) => n.targetPostId)
        .filter((id) => ObjectId.isValid(id))
    )
  );
  const client = await clientPromise;
  const posts = postIds.length
    ? await client
        .db("user_posts")
        .collection("myPosts")
        .find(
          { _id: { $in: postIds.map((id) => new ObjectId(id)) } },
          { projection: { content: 1, created: 1 } }
        )
        .toArray()
    : [];
  const postsById: Record<string, PostStub> = {};
  for (const p of posts) {
    postsById[String(p._id)] = {
      id: String(p._id),
      content: p.content ?? "",
      created: p.created ?? 0,
    };
  }

  return { notifications, actors, postsById, nextCursorMs };
};

type LoaderData = {
  notifications: FederationNotification[];
  actors: Record<string, RemoteActorCache>;
  postsById: Record<string, PostStub>;
  nextCursorMs: number | null;
};

function relative(ms: number): string {
  const diff = Date.now() - ms;
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.round(diff / min)}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 30 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function snippet(html: string, max = 100): string {
  const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function verb(kind: FederationNotification["kind"]): string {
  switch (kind) {
    case "like": return "liked your post";
    case "boost": return "boosted your post";
    case "reply": return "replied to your post";
  }
}

export default function Notifications() {
  const { notifications, actors, postsById, nextCursorMs } =
    useLoaderData<LoaderData>();

  return (
    <>
      <style>{`
        .notifs { padding: 1rem; }
        .notifs h2 {
          font: 600 1.1rem 'PGM Sans', sans-serif;
          color: #506982;
          margin: 0 0 1rem 0;
        }
        .notif {
          display: flex;
          gap: 12px;
          background: #fff;
          border: 1px solid #979997;
          border-radius: 4px;
          padding: 10px 12px;
          margin-bottom: 10px;
        }
        .notif__avatar {
          width: 36px; height: 36px; border-radius: 50%;
          background: #eee;
          flex: 0 0 36px;
          overflow: hidden;
        }
        .notif__avatar img { width: 100%; height: 100%; object-fit: cover; }
        .notif__body { flex: 1; font-size: 13px; line-height: 1.4; min-width: 0; }
        .notif__line1 { color: #333; }
        .notif__line1 strong { color: #506982; }
        .notif__line2 {
          color: #666; font-size: 12px; margin-top: 4px;
          overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
        .notif__when { color: #888; font-size: 11px; margin-top: 4px; }
        .notif__kind {
          display: inline-block;
          padding: 1px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          margin-right: 6px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .notif__kind--like { background: #fde4e4; color: #b03030; }
        .notif__kind--boost { background: #dff0e3; color: #297a3e; }
        .notif__kind--reply { background: #e2ebf8; color: #2f4e8a; }
      `}</style>

      <section className="notifs">
        <h2>Notifications</h2>
        {notifications.length === 0 ? (
          <div style={{ fontSize: 14, color: "#666" }}>
            No notifications yet.
          </div>
        ) : (
          notifications.map((n, i) => {
            const actor = actors[n.sourceActorUri];
            const name =
              actor?.displayName ||
              actor?.fqHandle ||
              n.sourceActorUri;
            const post = postsById[n.targetPostId];
            return (
              <div
                key={`${n.kind}-${n.sourceActorUri}-${n.targetNoteUri}-${i}`}
                className="notif"
              >
                <a
                  href={actor?.profileUrl || n.sourceActorUri}
                  target="_blank"
                  rel="noreferrer"
                  className="notif__avatar"
                  aria-label={name}
                >
                  {actor?.avatarUrl ? (
                    <img src={actor.avatarUrl} alt="" />
                  ) : null}
                </a>
                <div className="notif__body">
                  <div className="notif__line1">
                    <span className={`notif__kind notif__kind--${n.kind}`}>
                      {n.kind}
                    </span>
                    <strong>{name}</strong> {verb(n.kind)}
                    {post ? (
                      <>
                        : <a href={`/h/post/${post.id}`}>{snippet(post.content, 60)}</a>
                      </>
                    ) : null}
                  </div>
                  {n.kind === "reply" && n.replyNoteUri ? (
                    <div className="notif__line2">
                      <a href={n.replyNoteUri} target="_blank" rel="noreferrer">
                        View their reply →
                      </a>
                    </div>
                  ) : null}
                  <div className="notif__when">{relative(n.receivedAt)}</div>
                </div>
              </div>
            );
          })
        )}
        {nextCursorMs != null && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <a href={`/h/notifications?before=${nextCursorMs}`}>Older</a>
          </div>
        )}
      </section>
    </>
  );
}
