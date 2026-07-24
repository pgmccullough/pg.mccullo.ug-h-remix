/**
 * Serves /sitemap.xml — enumerates every URL a search engine should
 * know about.
 *
 * Currently includes:
 *   - homepage (/h)
 *   - about page (/h/about)
 *   - every published, non-draft, non-scheduled Public post
 *   - one archive page per distinct tag (/h/tag/:tag)
 *
 * Uses each post's `lastEdited` timestamp for `<lastmod>` so search
 * engines can prioritize re-crawling posts you've edited. Tag pages
 * use their most-recent tagged post's timestamp so re-crawls follow
 * the archive's actual freshness.
 */

import type { LoaderFunctionArgs } from "react-router";
import { clientPromise } from "~/lib/mongodb";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = new URL(request.url).origin;
  const client = await clientPromise;
  const db = client.db("user_posts");

  // Only public posts, published (not draft or scheduled). Cap generous
  // enough for a personal site — bump if needed later.
  const posts = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
    })
    .project({ _id: 1, created: 1, lastEdited: 1, seoMeta: 1, tags: 1 })
    .sort({ created: -1 })
    .limit(5000)
    .toArray();

  const urls: Array<{ loc: string; lastmod?: string; priority?: string }> = [];

  urls.push({ loc: `${origin}/h`, priority: "1.0" });
  urls.push({ loc: `${origin}/h/about`, priority: "0.9" });
  urls.push({ loc: `${origin}/h/archive`, priority: "0.6" });

  // Track the most-recent post per tag AND per (year, month) bucket
  // so each archive/tag URL gets a sensible <lastmod>. Search engines
  // use lastmod as a hint on whether to re-crawl.
  const tagLastMod = new Map<string, number>();
  const monthLastMod = new Map<string, number>();  // key = "YYYY-MM"
  const yearLastMod = new Map<number, number>();

  for (const p of posts) {
    const id = String(p._id);
    const slug = (p as any)?.seoMeta?.slug;
    const permalink = slug
      ? `${origin}/h/post/${id}/${encodeURIComponent(slug)}`
      : `${origin}/h/post/${id}`;
    const ts = typeof p.lastEdited === "number"
      ? p.lastEdited
      : (typeof p.created === "number" ? p.created : null);
    urls.push({
      loc: permalink,
      lastmod: ts ? new Date(ts * 1000).toISOString() : undefined,
      priority: "0.7",
    });
    // Aggregate distinct tags along the way — one sort key traversal
    // handles both the post list and the tag index.
    const tags = Array.isArray((p as any).tags) ? (p as any).tags : [];
    for (const t of tags) {
      if (typeof t !== "string" || !t) continue;
      const prev = tagLastMod.get(t) ?? 0;
      if (ts && ts > prev) tagLastMod.set(t, ts);
    }
    // Aggregate distinct (year, month) buckets for the archive drill-
    // down index — one entry per bucket, lastmod tied to newest post
    // in that bucket. Same idea for year-only buckets.
    if (typeof ts === "number") {
      const d = new Date(ts * 1000);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const prevM = monthLastMod.get(key) ?? 0;
      if (ts > prevM) monthLastMod.set(key, ts);
      const prevY = yearLastMod.get(y) ?? 0;
      if (ts > prevY) yearLastMod.set(y, ts);
    }
  }

  // Emit one URL per distinct tag. Priority slightly below individual
  // posts — these are archive pages, useful but not the primary
  // destination we'd want a crawler ranking first.
  for (const [tag, ts] of tagLastMod.entries()) {
    urls.push({
      loc: `${origin}/h/tag/${encodeURIComponent(tag)}`,
      lastmod: ts ? new Date(ts * 1000).toISOString() : undefined,
      priority: "0.5",
    });
  }
  // Year drill-down index pages.
  for (const [year, ts] of yearLastMod.entries()) {
    urls.push({
      loc: `${origin}/h/archive/${year}`,
      lastmod: ts ? new Date(ts * 1000).toISOString() : undefined,
      priority: "0.5",
    });
  }
  // Month drill-down index pages — terminal archive pages, one per
  // month that has at least one post.
  for (const [key, ts] of monthLastMod.entries()) {
    const [year, month] = key.split("-");
    urls.push({
      loc: `${origin}/h/archive/${year}/${month}`,
      lastmod: ts ? new Date(ts * 1000).toISOString() : undefined,
      priority: "0.4",
    });
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => {
        const parts = [`  <url>`, `    <loc>${xmlEscape(u.loc)}</loc>`];
        if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
        if (u.priority) parts.push(`    <priority>${u.priority}</priority>`);
        parts.push(`  </url>`);
        return parts.join("\n");
      })
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
};
