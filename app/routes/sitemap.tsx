/**
 * Serves /sitemap.xml — enumerates every URL a search engine should
 * know about.
 *
 * Currently includes:
 *   - homepage (/h)
 *   - every published, non-draft, non-scheduled Public post
 *   - the "We Die In Every War" essay page
 *
 * Uses each post's `lastEdited` timestamp for `<lastmod>` so search
 * engines can prioritize re-crawling posts you've edited.
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
    .project({ _id: 1, created: 1, lastEdited: 1, seoMeta: 1 })
    .sort({ created: -1 })
    .limit(5000)
    .toArray();

  const urls: Array<{ loc: string; lastmod?: string; priority?: string }> = [];

  urls.push({ loc: `${origin}/h`, priority: "1.0" });
  urls.push({ loc: `${origin}/h/writing/we-die-in-every-war`, priority: "0.8" });

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
