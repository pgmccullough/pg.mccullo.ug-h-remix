/**
 * /h/drafts — admin-only management page for drafts + scheduled posts.
 *
 * Lists everything whose `state` is "draft" or "scheduled", newest first.
 * Each row: a content excerpt, when it was last edited, when it's
 * scheduled to publish (if applicable), and per-row actions:
 *   - Publish now  → POST /api/post/publish/:postId
 *   - Delete       → POST /api/post/delete/:postId
 *
 * Edits still happen through the existing single-post admin page
 * (/h/post/:postID) via the edit-in-place flow, so we just link there.
 */

import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import {
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "react-router";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";
import { serializeDocs } from "~/utils/serialize.server";

interface DraftPost {
  _id: string;
  content?: string;
  state?: "draft" | "scheduled" | "published";
  scheduledFor?: number;
  created?: number;
  lastEdited?: number;
  privacy?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") throw redirect("/h");

  const client = await clientPromise;
  const db = client.db("user_posts");
  const raw = await db
    .collection("myPosts")
    .find({ state: { $in: ["draft", "scheduled"] } })
    .sort({ lastEdited: -1, scheduledFor: 1 })
    .limit(200)
    .toArray();
  const posts = serializeDocs(raw) as DraftPost[];
  return { posts };
};

function excerpt(html: string | undefined, n = 140): string {
  if (!html) return "";
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.length > n ? stripped.slice(0, n - 1) + "…" : stripped;
}

function fmt(ts?: number, unit: "seconds" | "ms" = "seconds"): string {
  if (!ts) return "";
  const ms = unit === "seconds" ? ts * 1000 : ts;
  return new Date(ms).toLocaleString();
}

export default function DraftsPage() {
  const { posts } = useLoaderData<{ posts: DraftPost[] }>();
  const publish = useFetcher<{ ok?: boolean; published?: boolean; error?: string }>();
  const del = useFetcher<{ postDeleted?: boolean; error?: string }>();
  const revalidator = useRevalidator();

  // When either publish or delete completes successfully, re-run the
  // loader so the just-touched row disappears from the list without
  // needing a manual refresh.
  useEffect(() => {
    if (publish.state === "idle" && publish.data?.ok) {
      revalidator.revalidate();
    }
  }, [publish.state, publish.data]);
  useEffect(() => {
    if (del.state === "idle" && del.data?.postDeleted) {
      revalidator.revalidate();
    }
  }, [del.state, del.data]);

  const drafts = posts.filter((p) => p.state === "draft");
  const scheduled = posts.filter((p) => p.state === "scheduled");
  const isBusy = publish.state !== "idle" || del.state !== "idle";

  return (
    <>
      <style>{`
        .drafts { padding: 16px; font-family: 'PGM Sans', sans-serif; color: #333; }
        .drafts h2 {
          font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;
          color: #506982; margin: 20px 0 8px;
        }
        .drafts__row {
          background: #fff;
          border: 1px solid #979997;
          border-radius: 4px;
          margin-bottom: 8px;
          padding: 12px 14px;
        }
        .drafts__row__meta {
          font-size: 12px; color: #888;
          display: flex; gap: 12px; flex-wrap: wrap;
          margin-bottom: 6px;
        }
        .drafts__row__meta strong { color: #506982; font-weight: 600; }
        .drafts__row__excerpt {
          font-size: 14px; line-height: 1.5; color: #333;
          margin-bottom: 10px;
          white-space: normal; word-break: break-word;
        }
        .drafts__row__actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .drafts__btn,
        .drafts__btn:visited {
          display: inline-block;
          padding: 6px 14px;
          background: #4A6CBA;
          color: #fff;
          font: 600 12px 'PGM Sans', sans-serif;
          border: 0;
          border-radius: 4px;
          text-decoration: none;
          cursor: pointer;
          height: auto;
          letter-spacing: 0.02em;
        }
        .drafts__btn:hover { background: #506982; box-shadow: 0 0 0 3px #ccc; }
        .drafts__btn--ghost {
          background: #fff; color: #4A6CBA; border: 1px solid #979997;
        }
        .drafts__btn--ghost:hover { color: #506982; }
        .drafts__btn--danger { background: #be0d0d; }
        .drafts__btn--danger:hover { background: #8a0909; }
        .drafts__empty {
          font-size: 13px; color: #888; padding: 8px 4px;
        }
      `}</style>
      <section className="drafts">
        <h2>Scheduled ({scheduled.length})</h2>
        {scheduled.length === 0 ? (
          <div className="drafts__empty">Nothing scheduled.</div>
        ) : (
          scheduled.map((p) => (
            <div key={p._id} className="drafts__row">
              <div className="drafts__row__meta">
                <span>
                  Scheduled for <strong>{fmt(p.scheduledFor)}</strong>
                </span>
                <span>
                  {p.privacy ?? "Public"}
                </span>
                {p.lastEdited ? (
                  <span>Edited {fmt(p.lastEdited)}</span>
                ) : null}
              </div>
              <div className="drafts__row__excerpt">
                {excerpt(p.content) || <em style={{ color: "#aaa" }}>(no text)</em>}
              </div>
              <div className="drafts__row__actions">
                <Link className="drafts__btn drafts__btn--ghost" to={`/h/post/${p._id}`}>
                  Edit
                </Link>
                <publish.Form
                  method="post"
                  action={`/api/post/publish/${p._id}`}
                  style={{ display: "inline" }}
                >
                  <button
                    type="submit"
                    className="drafts__btn"
                    disabled={isBusy}
                  >
                    {publish.state !== "idle" && publish.formAction?.includes(p._id)
                      ? "Publishing…"
                      : "Publish now"}
                  </button>
                </publish.Form>
                <del.Form
                  method="post"
                  action={`/api/post/delete/${p._id}`}
                  style={{ display: "inline" }}
                  onSubmit={(e) => {
                    if (!confirm("Delete this scheduled post?")) e.preventDefault();
                  }}
                >
                  <button type="submit" className="drafts__btn drafts__btn--danger">
                    Delete
                  </button>
                </del.Form>
              </div>
            </div>
          ))
        )}

        <h2>Drafts ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <div className="drafts__empty">No drafts yet.</div>
        ) : (
          drafts.map((p) => (
            <div key={p._id} className="drafts__row">
              <div className="drafts__row__meta">
                <span>{p.privacy ?? "Public"}</span>
                {p.lastEdited ? (
                  <span>Edited {fmt(p.lastEdited)}</span>
                ) : null}
              </div>
              <div className="drafts__row__excerpt">
                {excerpt(p.content) || <em style={{ color: "#aaa" }}>(no text)</em>}
              </div>
              <div className="drafts__row__actions">
                <Link className="drafts__btn drafts__btn--ghost" to={`/h/post/${p._id}`}>
                  Edit
                </Link>
                <publish.Form
                  method="post"
                  action={`/api/post/publish/${p._id}`}
                  style={{ display: "inline" }}
                >
                  <button
                    type="submit"
                    className="drafts__btn"
                    disabled={isBusy}
                  >
                    {publish.state !== "idle" && publish.formAction?.includes(p._id)
                      ? "Publishing…"
                      : "Publish now"}
                  </button>
                </publish.Form>
                <del.Form
                  method="post"
                  action={`/api/post/delete/${p._id}`}
                  style={{ display: "inline" }}
                  onSubmit={(e) => {
                    if (!confirm("Delete this draft?")) e.preventDefault();
                  }}
                >
                  <button type="submit" className="drafts__btn drafts__btn--danger">
                    Delete
                  </button>
                </del.Form>
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
