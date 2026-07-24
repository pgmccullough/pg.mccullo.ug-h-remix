/**
 * Server-only OG title-card renderer.
 *
 * The `.server.ts` suffix is what tells React Router v7's Vite
 * plugin to strip this module from the client bundle entirely.
 * Route files can't have that suffix (they're wired up by name in
 * routes.ts), so anything touching node:fs / node:path / native
 * bindings has to live in a separate `.server.ts` helper.
 *
 * Rendering pipeline:
 *   1. Solid blue 1200x630 canvas created via Sharp.
 *   2. Three text runs (title, date, site label) rasterized via
 *      Sharp's Pango-backed `input.text` mode. Bundled Inter TTFs
 *      supply the glyphs — librsvg on Vercel's Lambda has no
 *      system fonts, so `fontfile:` pointing at the bundled TTF
 *      is the only reliable path.
 *   3. Text layers composited onto the canvas, encoded JPEG.
 *
 * Fonts are read once at module init. The readFileSync calls at
 * the top of the file are what @vercel/nft traces to include the
 * TTFs in the serverless function bundle.
 */

import sharp from "sharp";
import { readFileSync } from "node:fs";
import path from "node:path";

const WIDTH = 1200;
const HEIGHT = 630;
const BG = { r: 74, g: 108, b: 186 }; // #4A6CBA
const FG = "#ffffff";
const ACCENT = "#c7d3e8";
const SITE_LABEL = "pg.mccullo.ug";

const FONT_DIR = path.join(process.cwd(), "app/assets/fonts");
const FONT_BOLD_PATH = path.join(FONT_DIR, "Inter-Bold.ttf");
const FONT_REGULAR_PATH = path.join(FONT_DIR, "Inter-Regular.ttf");
// Read at module load — fails fast on cold start if either file is
// missing from the deployment, which is easier to debug than a
// per-request Sharp error deep in Pango.
readFileSync(FONT_BOLD_PATH);
readFileSync(FONT_REGULAR_PATH);

/**
 * Escape a string for embedding in Pango markup. Pango accepts the
 * same XML entity escapes as HTML.
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
 * Wraps the string in a `<span foreground="..." font_desc="Inter N">`
 * so text color + size travel through Pango markup — Sharp's text
 * input doesn't expose those directly.
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

export async function renderOgCard(args: {
  title: string;
  dateLabel: string;
}): Promise<Buffer> {
  // Render the three text runs in parallel — cheap and independent.
  const [titleLayer, dateLayer, siteLayer] = await Promise.all([
    renderText({
      text: args.title,
      fontfile: FONT_BOLD_PATH,
      fontSize: 52,
      color: FG,
      width: 1040,
      height: 460,
      wrap: true,
    }),
    renderText({
      text: args.dateLabel,
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

  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: BG,
    },
  })
    .composite([
      // Left accent stripe (subtle, semi-transparent)
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
}
