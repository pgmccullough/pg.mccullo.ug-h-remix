/**
 * Dynamic OG title-card for text-only posts.
 *
 * Endpoint: GET /api/og/:postId → 1200x630 JPEG
 *
 * When a post has no attached image, the post's meta function points
 * <meta property="og:image"> here instead of falling back to the
 * icon-sized apple-touch-icon.png (which social platforms unfurl as
 * a sad little square). This produces a legible, branded landscape
 * card with the post's title/excerpt over a solid background.
 *
 * SVG → JPEG via Sharp — the same tool already handling media OG
 * crops elsewhere. On Vercel Lambda, librsvg finds DejaVu Sans /
 * Liberation Serif as system fallbacks so the font stack degrades
 * gracefully when 'PGM Sans' isn't installed on the server (which
 * it isn't — it's a webfont, not a system font).
 *
 * Cached aggressively at the edge — post titles rarely change, so
 * long TTLs are safe. If a post title changes, the cached image
 * will lag a day before Vercel re-fetches. Acceptable trade-off.
 */

import type { LoaderFunctionArgs } from "react-router";
import sharp from "sharp";
import { clientPromise, ObjectId } from "~/lib/mongodb";

const WIDTH = 1200;
const HEIGHT = 630;
const BG = "#4A6CBA";
const FG = "#ffffff";
const ACCENT = "#c7d3e8";
const SITE_LABEL = "pg.mccullo.ug";
const MAX_LINES = 5;
const CHARS_PER_LINE = 32;

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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Greedy word-wrapper: break text into lines of at most `maxChars`
 * characters, respecting word boundaries. Approximate — assumes
 * roughly uniform character width, which is a lie for proportional
 * fonts, but the display font is close enough that a slight over-
 * or under-fill on any given line doesn't look bad.
 */
function wrapText(text: string, maxChars: number, maxLines: number): {
  lines: string[];
  truncated: boolean;
} {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let idx = 0;
  for (; idx < words.length; idx++) {
    const w = words[idx];
    if (!current) {
      current = w;
      continue;
    }
    if (current.length + 1 + w.length <= maxChars) {
      current += " " + w;
    } else {
      lines.push(current);
      if (lines.length === maxLines) break;
      current = w;
    }
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  const truncated = idx < words.length - 1 || lines.length === maxLines && idx < words.length;

  if (truncated && lines.length) {
    const last = lines[lines.length - 1];
    const room = maxChars - 1;
    const clipped =
      last.length > room
        ? last.slice(0, room).replace(/[\s.,;:!?]+$/, "")
        : last.replace(/[\s.,;:!?]+$/, "");
    lines[lines.length - 1] = clipped + "…";
  }
  return { lines, truncated };
}

function buildSvg(args: { title: string; dateLabel: string }): string {
  const { lines } = wrapText(args.title, CHARS_PER_LINE, MAX_LINES);
  const lineHeight = 72;
  const blockHeight = lines.length * lineHeight;
  const startY =
    Math.round((HEIGHT - blockHeight) / 2) + lineHeight * 0.75;

  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="80" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  <rect x="0" y="0" width="12" height="${HEIGHT}" fill="${ACCENT}" opacity="0.6"/>
  <text
    font-family="Georgia, 'Liberation Serif', 'DejaVu Serif', serif"
    font-size="60"
    font-weight="700"
    fill="${FG}"
    letter-spacing="-0.5"
  >${tspans}</text>
  <text
    x="80" y="${HEIGHT - 60}"
    font-family="Verdana, 'DejaVu Sans', sans-serif"
    font-size="26"
    fill="${ACCENT}"
    letter-spacing="0.5"
  >${escapeXml(args.dateLabel)}</text>
  <text
    x="${WIDTH - 80}" y="${HEIGHT - 60}"
    font-family="Verdana, 'DejaVu Sans', sans-serif"
    font-size="26"
    text-anchor="end"
    fill="${ACCENT}"
    letter-spacing="0.5"
  >${escapeXml(SITE_LABEL)}</text>
</svg>`;
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
  // raw first N characters of the body. Fall back to stripped content.
  const rawTitle =
    (post as any)?.seoMeta?.description ||
    stripHtml(String(post.content ?? "")) ||
    "Untitled post";
  const title = rawTitle.slice(0, CHARS_PER_LINE * MAX_LINES);

  const dateLabel =
    typeof post.created === "number"
      ? new Date(post.created * 1000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";

  const svg = buildSvg({ title, dateLabel });

  try {
    const jpeg = await sharp(Buffer.from(svg))
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    return new Response(jpeg, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        // Long TTL — post titles rarely change. Vercel edge + browser
        // both cache. If a title does change, cached image lags 1 day.
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (err) {
    console.error("[api/og] Sharp render failed:", err);
    // On failure, fall back to the site's static icon so unfurlers
    // still get *something*. 302 keeps CDNs sane.
    return Response.redirect(
      "https://pg.mccullo.ug/apple-touch-icon.png",
      302
    );
  }
};
