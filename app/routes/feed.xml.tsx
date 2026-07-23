/**
 * /feed.xml — Atom feed of public posts.
 *
 * Atom (not RSS 2.0) because it has stricter semantics, better date
 * handling, and every serious feed reader supports it. Advertised in
 * <head> via <link rel="alternate" type="application/atom+xml">.
 */

import type { LoaderFunctionArgs } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import { stripHtml, SEO_CONST } from "~/utils/seo";

const AUTHOR = "Patrick Glendon McCullough";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const loader = async (_args: LoaderFunctionArgs) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const posts = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
    })
    .project({ _id: 1, content: 1, created: 1, lastEdited: 1, seoMeta: 1 })
    .sort({ created: -1 })
    .limit(50)
    .toArray();

  const site = SEO_CONST.SITE_URL;
  const nowIso = new Date().toISOString();
  const feedUpdated = posts[0]?.lastEdited
    ? new Date(posts[0].lastEdited * 1000).toISOString()
    : nowIso;

  const entries = posts
    .map((p) => {
      const id = String(p._id);
      const slug = (p as any)?.seoMeta?.slug;
      const url = slug
        ? `${site}/h/post/${id}/${encodeURIComponent(slug)}`
        : `${site}/h/post/${id}`;
      const excerpt = stripHtml(String(p.content ?? ""), 70) || "Untitled";
      const published = typeof p.created === "number"
        ? new Date(p.created * 1000).toISOString()
        : nowIso;
      const updated = typeof p.lastEdited === "number"
        ? new Date(p.lastEdited * 1000).toISOString()
        : published;
      return [
        `  <entry>`,
        `    <id>${esc(url)}</id>`,
        `    <title>${esc(excerpt)}</title>`,
        `    <link rel="alternate" type="text/html" href="${esc(url)}"/>`,
        `    <published>${published}</published>`,
        `    <updated>${updated}</updated>`,
        // content as HTML so readers can render it inline; also
        // duplicated as summary (plain text) for text-mode readers.
        `    <content type="html">${esc(String(p.content ?? ""))}</content>`,
        `    <summary>${esc(stripHtml(String(p.content ?? ""), 300))}</summary>`,
        `  </entry>`,
      ].join("\n");
    })
    .join("\n");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom">\n` +
    `  <id>${esc(site + "/")}</id>\n` +
    `  <title>${esc(SEO_CONST.SITE_NAME)}</title>\n` +
    `  <subtitle>Writing and dispatches from Patrick Glendon McCullough</subtitle>\n` +
    `  <link rel="alternate" type="text/html" href="${esc(site + "/h")}"/>\n` +
    `  <link rel="self" type="application/atom+xml" href="${esc(site + "/feed.xml")}"/>\n` +
    `  <updated>${feedUpdated}</updated>\n` +
    `  <author>\n    <name>${esc(AUTHOR)}</name>\n    <uri>${esc(site)}</uri>\n  </author>\n` +
    entries +
    `\n</feed>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
};
