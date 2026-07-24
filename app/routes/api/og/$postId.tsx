/**
 * Dynamic OG title-card for text-only posts.
 *
 * Endpoint: GET /api/og/:postId → 1200x630 JPEG
 *
 * When a post has no attached image, the post's meta function
 * points <meta property="og:image"> here so social platforms
 * unfurl a branded landscape card instead of the icon-sized site
 * fallback.
 *
 * The heavy lifting (font loading, Sharp/Pango rasterization,
 * compositing) lives in ~/utils/og-render.server so this file
 * itself has zero node-builtin imports — Vite's client bundle
 * splitter is happy to leave this route alone, and the .server
 * suffix on the helper is what stops fs/path/native-Sharp code
 * from ever landing in a browser chunk.
 *
 * Cached aggressively at the edge — post titles rarely change,
 * so an edit lags a day before Vercel re-fetches. Acceptable.
 */

import type { LoaderFunctionArgs } from "react-router";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { renderOgCard } from "~/utils/og-render.server";

const MAX_TITLE_CHARS = 200;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const postId = String(params.postId ?? "");
  if (!ObjectId.isValid(postId)) {
    return new Response("Bad postId", { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db("user_posts");
  const post = await db.collection("myPosts").findOne(
    { _id: new ObjectId(postId) },
    {
      projection: {
        content: 1,
        seoMeta: 1,
        created: 1,
        privacy: 1,
        state: 1,
      },
    }
  );

  if (
    !post ||
    post.privacy !== "Public" ||
    (post.state && post.state !== "published")
  ) {
    return new Response("Not Found", { status: 404 });
  }

  // Prefer the LLM-generated description (a real summary) over the
  // stripped first N chars of the body. Fall back to "Untitled" so
  // the render never fails on missing content.
  const rawTitle =
    (post as any)?.seoMeta?.description ||
    stripHtml(String(post.content ?? "")) ||
    "Untitled post";
  const title = rawTitle.slice(0, MAX_TITLE_CHARS);

  const dateLabel =
    typeof post.created === "number"
      ? new Date(post.created * 1000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";

  try {
    const jpeg = await renderOgCard({ title, dateLabel });
    return new Response(jpeg, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (err) {
    console.error("[api/og] Sharp render failed:", err);
    // On failure, redirect to the static site icon so unfurlers
    // still receive *something*. 302 keeps CDNs sane.
    return Response.redirect(
      "https://pg.mccullo.ug/apple-touch-icon.png",
      302
    );
  }
};
