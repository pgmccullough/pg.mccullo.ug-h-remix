/**
 * Dynamic Open Graph image for a post.
 *
 * Rendered on demand at request time by @vercel/og (which wraps
 * satori). Returns a 1200x630 PNG with the post's excerpt + date,
 * suitable for og:image on the post's meta.
 *
 * Public route — no auth needed. Non-public posts return the fallback
 * card (the same design without a specific excerpt) so a broken or
 * private permalink still previews cleanly instead of 404'ing.
 */

import type { LoaderFunctionArgs } from "react-router";
import { clientPromise, ObjectId } from "~/lib/mongodb";

const WIDTH = 1200;
const HEIGHT = 630;
const SITE = "pg.mccullo.ug";

function stripHtml(input: string, max: number): string {
  const s = input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function fmtDate(unixSeconds?: number): string {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return "";
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { ImageResponse } = await import("@vercel/og");

  const { postId = "" } = params;
  let excerpt = "";
  let date = "";

  if (ObjectId.isValid(postId)) {
    try {
      const client = await clientPromise;
      const db = client.db("user_posts");
      const post = await db
        .collection("myPosts")
        .findOne({
          _id: new ObjectId(postId),
          privacy: "Public",
          state: { $nin: ["draft", "scheduled"] },
        });
      if (post) {
        excerpt = stripHtml(String(post.content ?? ""), 240);
        date = fmtDate(post.created);
      }
    } catch (err) {
      console.error("[api/og] db lookup failed:", err);
    }
  }

  // Fallback content when the post isn't public / doesn't exist —
  // still yields a clean card rather than a 404.
  if (!excerpt) {
    excerpt = "Patrick Glendon McCullough";
    date = "";
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          background: "#0f1419",
          color: "#e5e7eb",
          padding: 64,
          fontFamily: "sans-serif",
          justifyContent: "space-between",
        }}
      >
        <div style={{
          fontSize: 24,
          color: "#a1b5c9",
          letterSpacing: 2,
          textTransform: "uppercase",
          fontWeight: 600,
        }}>
          {SITE}
        </div>

        <div style={{
          fontSize: excerpt.length > 140 ? 40 : 52,
          lineHeight: 1.25,
          fontWeight: 600,
          color: "#ffffff",
        }}>
          {excerpt}
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid #2a3543",
          paddingTop: 24,
          fontSize: 22,
          color: "#94a3b8",
        }}>
          <div>Patrick Glendon McCullough</div>
          <div>{date}</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  );
};
