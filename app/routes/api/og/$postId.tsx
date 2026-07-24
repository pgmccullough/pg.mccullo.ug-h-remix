/**
 * Dynamic OG title-card for text-only posts.
 *
 * Endpoint: GET /api/og/:postId → 1200x630 JPEG
 *
 * When a post has no attached image, the post's meta function points
 * <meta property="og:image"> here so social platforms unfurl a
 * branded landscape card instead of the icon-sized site fallback.
 *
 * Rendering pipeline:
 *   1. Sharp creates a solid blue 1200x630 base canvas.
 *   2. Sharp's `input.text` mode uses Pango to rasterize the post
 *      title, date, and site label from bundled Inter TTFs.
 *      Pango markup carries the text color (`<span foreground="#fff">`).
 *   3. Composites the rendered text layers onto the canvas, encodes JPEG.
 *
 * Fonts are bundled in the repo at app/assets/fonts/ and read once
 * at module init — the readFileSync(path.join(...)) call at the top
 * of the file is what @vercel/nft traces to include them in the
 * serverless function bundle.
 *
 * Long TTLs at the edge — the source (post title + date) rarely
 * changes; a title edit will lag a day.
 */

import type { LoaderFunctionArgs } from "react-router";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import path from "node:path";
import { clientPromise, ObjectId } from "~/lib/mongodb";

const WIDTH = 1200;
const HEIGHT = 630;
const BG = { r: 74, g: 108, b: 186 }; // #4A6CBA
const FG = "#ffffff";
const ACCENT = "#c7d3e8";
const SITE_LABEL = "pg.mccullo.ug";
const MAX_TITLE_CHARS = 200;

// Bundled Inter TTFs, read once at module init. Two weights:
// Bold for the display title, Regular for the meta line. Vercel's
// @vercel/nft traces this call and includes both files in the
// serverless bundle. Absolute paths matter — Sharp's Pango backend
// looks up the file by name.
const FONT_DIR = path.join(process.cwd(), "app/assets/fonts");
const FONT_BOLD_PATH = path.join(FONT_DIR, "Inter-Bold.ttf");
const FONT_REGULAR_PATH = path.join(FONT_DIR, "Inter-Regular.ttf");
// Read at module load — throws early on cold start if either file
// is missing from the deployment, which is easier to debug than a
// per-request Sharp error.
readFileSync(FONT_BOLD_PATH);
readFileSync(FONT_REGULAR_PATH);

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

/**
 * Escape a string for embedding in Pango markup. Pango uses
 * XML-style entities, same as HTML — reuse the standard escapes.
 */
function escapePango(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Rasterize a text run to a PNG buffer via Sharp's Pango backend.
 * Wraps the string in a `<span>` with foreground color and font size
 * so we can carry style through Pango markup rather than trying to
 * tint an alpha mask afterward.
 *
 * Sharp text sizes use Pango units where 1024 = 1 point. `fontSize`
 * here is in whole points (like CSS).
 */
async function renderText(args: {
  text: string;
  fontfile: string;
  fontSize: number;
  color: string;
  width: number;
  height: number;
  align?: "left" | "center" | "right";
  wrap?: boolean;
}): Promise<Buffer> {
  const escaped = escapePango(args.text);
  const markup = `<span foreground="${args.color}" font_desc="Inter ${args.fontSize}">${escaped}</span>`;
  return sharp({
    text: {
      text: markup,
      fontfile: args.fontfile,
      // `font` is required even when using Pango markup (backend uses
      // it as the default face resolution). Match the fontfile.
      font: "Inter",
      width: args.width,
      height: args.height,
      wrap: args.wrap ? "word" : "none",
      align: args.align ?? "left",
      rgba: true,
    },
  })
    .png()
    .toBuffer();
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
    // Render the three text runs in parallel — cheap and independent.
    const [titleLayer, dateLayer, siteLayer] = await Promise.all([
      renderText({
        text: title,
        fontfile: FONT_BOLD_PATH,
        fontSize: 52,
        color: FG,
        width: 1040,
        height: 460,
        wrap: true,
      }),
      renderText({
        text: dateLabel,
        fontfile: FONT_REGULAR_PATH,
        fontSize: 22,
        color: ACCENT,
        width: 500,
        height: 40,
      }),
      renderText({
        text: SITE_LABEL,
        fontfile: FONT_REGULAR_PATH,
        fontSize: 22,
        color: ACCENT,
        width: 500,
        height: 40,
        align: "right",
      }),
    ]);

    // Compose everything onto a solid-blue canvas. Layout matches
    // the SVG version: title centered vertically in the top ~80%,
    // date bottom-left, site label bottom-right, subtle accent bar
    // running down the left edge.
    const jpeg = await sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 3,
        background: BG,
      },
    })
      .composite([
        // Left accent stripe (subtle) — small semi-transparent overlay
        // rendered as a solid strip, alpha handled via `png()` layer.
        {
          input: {
            create: {
              width: 12,
              height: HEIGHT,
              channels: 4,
              background: { r: 199, g: 211, b: 232, alpha: 0.6 },
            },
          },
          top: 0,
          left: 0,
        },
        { input: titleLayer, top: 90, left: 80 },
        { input: dateLayer, top: HEIGHT - 60, left: 80 },
        { input: siteLayer, top: HEIGHT - 60, left: WIDTH - 500 - 80 },
      ])
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    return new Response(jpeg, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (err) {
    console.error("[api/og] Sharp render failed:", err);
    return Response.redirect(
      "https://pg.mccullo.ug/apple-touch-icon.png",
      302
    );
  }
};
