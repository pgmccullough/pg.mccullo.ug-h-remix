/**
 * /feed.json — JSON Feed 1.1 alongside the Atom feed.
 *
 * Modern feed readers (Reeder, NetNewsWire, some others) prefer this
 * over Atom/RSS. Serving both costs almost nothing and covers more
 * subscribers with zero extra work on their end.
 *
 * Spec: https://jsonfeed.org/version/1.1
 */

import type { LoaderFunctionArgs } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import { stripHtml, SEO_CONST } from "~/utils/seo";

export const loader = async (_args: LoaderFunctionArgs) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const posts = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
    })
    .project({ _id: 1, content: 1, created: 1, lastEdited: 1 })
    .sort({ created: -1 })
    .limit(50)
    .toArray();

  const site = SEO_CONST.SITE_URL;

  const items = posts.map((p) => {
    const id = String(p._id);
    const url = `${site}/h/post/${id}`;
    const html = String(p.content ?? "");
    const summary = stripHtml(html, 300);
    return {
      id: url,
      url,
      title: stripHtml(html, 70) || "Untitled",
      content_html: html,
      summary,
      date_published: typeof p.created === "number"
        ? new Date(p.created * 1000).toISOString()
        : undefined,
      date_modified: typeof p.lastEdited === "number"
        ? new Date(p.lastEdited * 1000).toISOString()
        : undefined,
      authors: [{ name: SEO_CONST.AUTHOR_NAME, url: site }],
    };
  });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: SEO_CONST.SITE_NAME,
    description: "Writing and dispatches from Patrick Glendon McCullough",
    home_page_url: `${site}/h`,
    feed_url: `${site}/feed.json`,
    language: "en",
    authors: [{ name: SEO_CONST.AUTHOR_NAME, url: site }],
    items,
  };

  return new Response(JSON.stringify(feed), {
    headers: {
      "Content-Type": "application/feed+json; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
};
