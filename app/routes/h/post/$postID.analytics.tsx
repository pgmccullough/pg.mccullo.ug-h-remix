/**
 * /h/post/:postID/analytics — admin-only per-post analytics dashboard.
 *
 * Answers: how many people looked at this post, when, where from, and
 * what did they do (reactions, comments, webmentions received). Data
 * comes from the same myVisitors collection the SiteActivity widget
 * uses; no new instrumentation required.
 *
 * Non-admins get redirected to the post's public permalink so this
 * URL isn't a data-leak surface if someone stumbles on it.
 */

import { Link, redirect, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { getUser } from "~/utils/session.server";
import { buildMeta } from "~/utils/seo";

interface DayBucket {
  day: string; // "YYYY-MM-DD"
  views: number;
  uniques: number;
}
interface ReferrerRow {
  referrer: string;
  views: number;
}
interface RecentVisit {
  when: number;
  path: string;
  referrer: string;
  city?: string;
  region?: string;
  country?: string;
  identity?: string;
}

const DAY_MS = 86400_000;
const CHART_DAYS = 60;

function utcDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const user = await getUser(request);
  const postId = String(params.postID ?? "");
  if (!ObjectId.isValid(postId)) {
    throw new Response("Not Found", { status: 404 });
  }
  if (!user || user.role !== "administrator") {
    // Bounce non-admins to the public permalink so the URL isn't a
    // fishing surface. 302 keeps it clear the redirect is per-user.
    return redirect(`/h/post/${postId}`);
  }

  const client = await clientPromise;
  const db = client.db("user_posts");
  const post = await db
    .collection("myPosts")
    .findOne(
      { _id: new ObjectId(postId) },
      { projection: { content: 1, created: 1, seoMeta: 1, feedback: 1, privacy: 1 } }
    );
  if (!post) {
    throw new Response("Not Found", { status: 404 });
  }

  // Visitors who hit any URL under this post's permalink (bare-id or
  // slug'd form). Regex is anchored + escaped so no injection.
  const pathRegex = new RegExp(
    `^/h/post/${postId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(/|$)`
  );
  const visitors = await db
    .collection("myVisitors")
    .find({ "history.path": pathRegex })
    .project({
      _id: 1,
      lastIpData: 1,
      lastUserName: 1,
      manualLabel: 1,
      user: 1,
      history: 1,
    })
    .toArray();

  // Walk each visitor's history once, collect only the entries that
  // touched this post. Aggregations we care about:
  //   - total views
  //   - unique visitors (count of docs contributing at least one hit)
  //   - daily buckets for the last CHART_DAYS days
  //   - referrer counts
  //   - recent-visits log (last ~30 hits with visitor identity)
  const now = Date.now();
  const chartStart = now - CHART_DAYS * DAY_MS;
  const dayBuckets = new Map<string, { views: number; uniques: Set<string> }>();
  const referrerCounts = new Map<string, number>();
  const recent: RecentVisit[] = [];
  let totalViews = 0;
  let uniqueVisitors = 0;

  for (const v of visitors as any[]) {
    const history: any[] = Array.isArray(v.history) ? v.history : [];
    let hitOnce = false;
    const geo = v.lastIpData ?? {};
    const identity =
      v.manualLabel ||
      v.lastUserName ||
      v.user?.find((u: any) => u?.user_name)?.user_name ||
      "anon";
    const vid = String(v._id);
    for (const h of history) {
      if (!h?.path || !pathRegex.test(h.path)) continue;
      hitOnce = true;
      totalViews++;
      const ts = Number(h.timestamp);
      if (Number.isFinite(ts)) {
        if (ts >= chartStart) {
          const key = utcDayKey(ts);
          let b = dayBuckets.get(key);
          if (!b) {
            b = { views: 0, uniques: new Set() };
            dayBuckets.set(key, b);
          }
          b.views++;
          b.uniques.add(vid);
        }
        recent.push({
          when: ts,
          path: h.path,
          referrer: String(h.referrer ?? ""),
          city: geo?.city,
          region: geo?.region_code,
          country: geo?.country_code,
          identity,
        });
      }
      // Referrer aggregation over ALL history (not just recent chart
      // window) — top-referrers is a lifetime signal.
      const ref = String(h.referrer ?? "").trim();
      const bucket = normalizeReferrer(ref);
      referrerCounts.set(bucket, (referrerCounts.get(bucket) ?? 0) + 1);
    }
    if (hitOnce) uniqueVisitors++;
  }

  // Build a dense daily series from chartStart → today so the chart
  // has bars for empty days too (visual honesty about traffic gaps).
  const days: DayBucket[] = [];
  for (let i = 0; i < CHART_DAYS; i++) {
    const ts = chartStart + i * DAY_MS;
    const key = utcDayKey(ts);
    const b = dayBuckets.get(key);
    days.push({
      day: key,
      views: b?.views ?? 0,
      uniques: b?.uniques.size ?? 0,
    });
  }

  const referrers: ReferrerRow[] = Array.from(referrerCounts.entries())
    .map(([referrer, views]) => ({ referrer, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 15);

  recent.sort((a, b) => b.when - a.when);

  // Webmentions received for this post.
  const webmentionCount = await db
    .collection("webmentions")
    .countDocuments({
      targetPostId: new ObjectId(postId),
      verified: true,
    })
    .catch(() => 0);

  const reactionsCount = Array.isArray((post as any)?.feedback?.likes)
    ? (post as any).feedback.likes.length
    : 0;
  const commentsCount = Array.isArray((post as any)?.feedback?.comments)
    ? (post as any).feedback.comments.length
    : 0;

  const excerpt = String(post.content ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  const canonicalPath = (post as any)?.seoMeta?.slug
    ? `/h/post/${postId}/${encodeURIComponent((post as any).seoMeta.slug)}`
    : `/h/post/${postId}`;

  return {
    postId,
    canonicalPath,
    excerpt,
    postCreated: post.created ?? null,
    totalViews,
    uniqueVisitors,
    days,
    referrers,
    recent: recent.slice(0, 30),
    webmentionCount,
    reactionsCount,
    commentsCount,
  };
};

// Group referrers by hostname so 12 different Google SERP paths don't
// dilute the "top referrers" table.
function normalizeReferrer(ref: string): string {
  if (!ref) return "(direct)";
  try {
    const u = new URL(ref);
    if (u.hostname === "pg.mccullo.ug") return "(internal)";
    return u.hostname;
  } catch {
    return ref.length > 40 ? ref.slice(0, 40) + "…" : ref;
  }
}

export const meta: MetaFunction = () =>
  buildMeta({
    title: "Analytics",
    description: "Per-post analytics dashboard (admin only).",
    path: "/h/post/analytics",
    appendSiteName: false,
  }).concat([{ name: "robots", content: "noindex, nofollow" }]);

export default function PostAnalytics() {
  const d = useLoaderData<typeof loader>();
  const maxViews = Math.max(1, ...d.days.map((b: DayBucket) => b.views));

  return (
    <div className="analytics">
      <div className="analytics__crumbs">
        <Link to={d.canonicalPath}>← Back to post</Link>
      </div>
      <h1 className="analytics__title">Post analytics</h1>
      <div className="analytics__excerpt">"{d.excerpt}"</div>

      <div className="analytics__cards">
        <div className="analytics__card">
          <div className="analytics__card-num">{d.totalViews}</div>
          <div className="analytics__card-label">Views</div>
        </div>
        <div className="analytics__card">
          <div className="analytics__card-num">{d.uniqueVisitors}</div>
          <div className="analytics__card-label">Unique visitors</div>
        </div>
        <div className="analytics__card">
          <div className="analytics__card-num">{d.reactionsCount}</div>
          <div className="analytics__card-label">Reactions</div>
        </div>
        <div className="analytics__card">
          <div className="analytics__card-num">{d.commentsCount}</div>
          <div className="analytics__card-label">Comments</div>
        </div>
        <div className="analytics__card">
          <div className="analytics__card-num">{d.webmentionCount}</div>
          <div className="analytics__card-label">Webmentions</div>
        </div>
      </div>

      <h2 className="analytics__section">Views, last {CHART_DAYS} days</h2>
      <div className="analytics__chart">
        {d.days.map((b: DayBucket) => (
          <div
            key={b.day}
            className="analytics__bar"
            style={{ height: `${(b.views / maxViews) * 100}%` }}
            title={`${b.day}: ${b.views} view${b.views === 1 ? "" : "s"} (${b.uniques} unique)`}
          />
        ))}
      </div>

      <h2 className="analytics__section">Top referrers</h2>
      {d.referrers.length === 0 ? (
        <div className="analytics__empty">No referrer data yet.</div>
      ) : (
        <table className="analytics__table">
          <thead>
            <tr>
              <th>Source</th>
              <th style={{ textAlign: "right" }}>Views</th>
            </tr>
          </thead>
          <tbody>
            {d.referrers.map((r: ReferrerRow) => (
              <tr key={r.referrer}>
                <td>{r.referrer}</td>
                <td style={{ textAlign: "right" }}>{r.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="analytics__section">Recent visits</h2>
      {d.recent.length === 0 ? (
        <div className="analytics__empty">No visits yet.</div>
      ) : (
        <table className="analytics__table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>From</th>
              <th>Referrer</th>
            </tr>
          </thead>
          <tbody>
            {d.recent.map((r: RecentVisit) => {
              const place =
                [r.city, r.region, r.country]
                  .filter((x) => x && String(x).length)
                  .join(", ") || "";
              const when = new Date(r.when).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <tr key={`${r.when}-${r.path}`}>
                  <td>{when}</td>
                  <td>{r.identity ?? "anon"}</td>
                  <td>{place}</td>
                  <td>{normalizeReferrer(r.referrer)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
