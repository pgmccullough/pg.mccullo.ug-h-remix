/**
 * /video-sitemap.xml — Video sitemap per Google's spec.
 *
 * Enumerates every public+published post that has at least one entry
 * on `media.videos`. Uses the video: namespace so Google Video search
 * knows about them. Referenced from robots.txt alongside the main
 * sitemap. Cached for 30 minutes.
 *
 * https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps
 */

import type { LoaderFunctionArgs } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import { stripHtml } from "~/utils/seo";

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

  // Only posts with actual video attachments.
  const posts = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
      "media.videos.0": { $exists: true },
    })
    .project({ _id: 1, content: 1, created: 1, media: 1, seoMeta: 1 })
    .sort({ created: -1 })
    .limit(2000)
    .toArray();

  const entries: string[] = [];
  for (const p of posts) {
    const id = String(p._id);
    const slug = (p as any)?.seoMeta?.slug;
    const permalink = slug
      ? `${origin}/h/post/${id}/${encodeURIComponent(slug)}`
      : `${origin}/h/post/${id}`;
    const title = stripHtml(String(p.content ?? ""), 90) || "Untitled";
    const description = stripHtml(String(p.content ?? ""), 200) || title;
    const publishedIso = typeof p.created === "number"
      ? new Date(p.created * 1000).toISOString()
      : undefined;
    // First image on the post makes a decent thumbnail fallback. If
    // none, Google will grab a video frame itself.
    const firstImg = Array.isArray(p.media?.images) ? p.media.images[0] : undefined;
    const thumbnailUrl = typeof firstImg === "string" && firstImg
      ? `${origin}/api/media/images/${firstImg}?og=1`
      : `${origin}/apple-touch-icon.png`;

    const videos: any[] = Array.isArray(p.media?.videos) ? p.media.videos : [];
    for (const v of videos) {
      const filename = typeof v === "string" ? v : v?.url || v?.file;
      if (typeof filename !== "string" || !filename.length) continue;
      const contentLoc = `${origin}/api/media/videos/${filename}`;
      entries.push(
        [
          `  <url>`,
          `    <loc>${xmlEscape(permalink)}</loc>`,
          `    <video:video>`,
          `      <video:title>${xmlEscape(title)}</video:title>`,
          `      <video:description>${xmlEscape(description)}</video:description>`,
          `      <video:thumbnail_loc>${xmlEscape(thumbnailUrl)}</video:thumbnail_loc>`,
          `      <video:content_loc>${xmlEscape(contentLoc)}</video:content_loc>`,
          ...(publishedIso ? [`      <video:publication_date>${publishedIso}</video:publication_date>`] : []),
          `      <video:family_friendly>yes</video:family_friendly>`,
          `    </video:video>`,
          `  </url>`,
        ].join("\n")
      );
    }
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n` +
    entries.join("\n") +
    (entries.length ? "\n" : "") +
    `</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
};
