/**
 * /h/* catchall — friendly 404 page that recovers visitors instead
 * of dropping them. Fetches 8 recent public posts and offers them as
 * "here are some things you might like" options so a mistyped URL
 * or stale share still lands a visitor somewhere useful.
 *
 * Returns 404 status so search engines drop the missing URL from
 * their index, but the body is a real page (not a bare error).
 */

import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import { serializeDocs } from "~/utils/serialize.server";
import { buildMeta } from "~/utils/seo";

interface RecentPost {
  _id: string;
  content?: string;
  created?: number;
  seoMeta?: { slug?: string; description?: string };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const raw = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
    })
    .project({ _id: 1, content: 1, created: 1, seoMeta: 1 })
    .sort({ created: -1 })
    .limit(8)
    .toArray();
  const recent = serializeDocs(raw);
  const url = new URL(request.url);
  // The `?from=` param is set by the post loader when redirecting a
  // dead permalink here — use it so the "requested URL" line stays
  // meaningful even after the redirect.
  const from = url.searchParams.get("from");
  const missingPath = from || url.pathname;
  return { recent, missingPath };
};

// Send 404 as the response status so search engines drop the missing
// URL from their index, even though we return a rendered recovery page.
export function headers() {
  return { "X-Robots-Tag": "noindex, follow" };
}

export const meta: MetaFunction = () => {
  return buildMeta({
    title: "Page not found",
    description: "That page doesn't exist — here are some recent posts you might like instead.",
    path: "/h/404",
    // Discourage indexing of the 404 page itself.
  }).concat([{ name: "robots", content: "noindex, follow" }]);
};

function excerpt(html: string | undefined, max = 100): string {
  if (!html) return "Untitled";
  const s = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}
function fmtDate(unix?: number): string {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}
function permalink(p: RecentPost): string {
  const slug = p.seoMeta?.slug;
  return slug ? `/h/post/${p._id}/${encodeURIComponent(slug)}` : `/h/post/${p._id}`;
}

export default function NotFound() {
  const { recent = [], missingPath = "" } = useLoaderData<{
    recent: RecentPost[];
    missingPath: string;
  }>();
  return (
    <>
      <style>{`
        .nf { padding: 16px; font-family: 'PGM Sans', sans-serif; color: #333; }
        .nf h1 {
          font-size: 22px; color: #506982; margin: 0 0 6px;
        }
        .nf__meta { color: #888; font-size: 13px; margin-bottom: 20px; }
        .nf__meta code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: #f3f3f3; padding: 1px 6px; border-radius: 3px;
          color: #506982;
        }
        .nf__search {
          display: flex; gap: 8px; margin: 12px 0 20px;
        }
        .nf__search input {
          flex: 1;
          padding: 8px 12px;
          font: 14px 'PGM Sans', sans-serif;
          border: 1px solid #979997;
          border-radius: 4px;
          background: #fff;
          color: #333;
        }
        .nf__search button {
          padding: 8px 16px;
          background: #4A6CBA;
          color: #fff;
          border: 0;
          border-radius: 4px;
          cursor: pointer;
          font: 600 13px 'PGM Sans', sans-serif;
        }
        [data-theme="dark"] .nf__search input {
          background: #1a2028; border-color: #2a3543; color: #e5e7eb;
        }
        .nf h2 {
          font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase;
          color: #506982; margin: 16px 0 8px;
        }
        .nf__list {
          background: #fff; border: 1px solid #979997; border-radius: 4px;
          overflow: hidden;
        }
        .nf__item,
        .nf__item:visited {
          display: flex; gap: 12px; align-items: baseline;
          padding: 10px 14px; border-bottom: 1px solid #f0f0f0;
          text-decoration: none; color: inherit; font-size: 14px;
        }
        .nf__item:last-child { border-bottom: 0; }
        .nf__item:hover { background: #f8f8f8; }
        .nf__item__date {
          flex: 0 0 90px; color: #888; font-size: 12px; text-align: right;
        }
        .nf__item__excerpt { flex: 1; min-width: 0; }
        .nf__back,
        .nf__back:visited {
          display: inline-block; margin-top: 16px;
          color: #4A6CBA; font: 600 13px 'PGM Sans', sans-serif;
          text-decoration: none;
        }
        .nf__back:hover { text-decoration: underline; }
        [data-theme="dark"] .nf { color: #e5e7eb; }
        [data-theme="dark"] .nf h1 { color: #a1b5c9; }
        [data-theme="dark"] .nf h2 { color: #a1b5c9; }
        [data-theme="dark"] .nf__meta { color: #94a3b8; }
        [data-theme="dark"] .nf__meta code { background: #232b36; color: #a1b5c9; }
        [data-theme="dark"] .nf__list {
          background: #1a2028; border-color: #2a3543;
        }
        [data-theme="dark"] .nf__item {
          border-color: #232b36; color: #e5e7eb;
        }
        [data-theme="dark"] .nf__item:hover { background: #232b36; }
        [data-theme="dark"] .nf__item__date { color: #94a3b8; }
      `}</style>
      <section className="nf">
        <h1>That page doesn't exist</h1>
        {missingPath ? (
          <div className="nf__meta">
            Requested: <code>{missingPath}</code>. Maybe the URL is
            wrong, or the post was removed. Here's what's recent:
          </div>
        ) : (
          <div className="nf__meta">
            Here are some recent posts you might like instead:
          </div>
        )}

        {/* Search recovery: navigates to /h?q=<query>, which the feed
            loader turns into a search results page. Cheaper than
            reusing the full SearchBar (which is fetcher-based and
            wants callbacks for parent state we don't have here). */}
        <form className="nf__search" method="get" action="/h">
          <input
            type="text"
            name="q"
            placeholder="Search the archive…"
            aria-label="Search posts"
            autoFocus
          />
          <button type="submit">Search</button>
        </form>

        <h2>Recent posts</h2>
        <div className="nf__list">
          {recent.map((p) => (
            <Link key={p._id} to={permalink(p)} className="nf__item">
              <span className="nf__item__date">{fmtDate(p.created)}</span>
              <span className="nf__item__excerpt">{excerpt(p.content)}</span>
            </Link>
          ))}
        </div>

        <Link to="/h" className="nf__back">← Back to the home feed</Link>
      </section>
    </>
  );
}
