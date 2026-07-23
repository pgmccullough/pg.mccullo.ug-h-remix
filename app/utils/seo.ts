/**
 * SEO helpers — build meta descriptors that cover title, description,
 * Open Graph, Twitter Card, canonical link, and JSON-LD structured
 * data in one call. Used from route `meta` exports so every public
 * page can present rich metadata to crawlers + social unfurlers.
 */

const DOMAIN = "pg.mccullo.ug";
const SITE_URL = `https://${DOMAIN}`;
const SITE_NAME = "Patrick Glendon McCullough";
const AUTHOR_NAME = "Patrick Glendon McCullough";
const DEFAULT_OG_IMAGE = `${SITE_URL}/apple-touch-icon.png`;

interface BuildMetaArgs {
  title: string;
  description?: string;
  path: string;               // e.g. "/h/post/xyz"
  image?: string;             // absolute URL preferred; will be resolved if relative
  ogType?: "website" | "article";
  publishedTime?: string;     // ISO 8601 for og:article:published_time
  modifiedTime?: string;      // ISO 8601 for og:article:modified_time
  jsonLd?: Record<string, any>;
  /** Append " — Patrick Glendon McCullough" to the title. Default
   *  true, but article pages usually want to skip this since
   *  og:site_name carries site attribution separately, and the
   *  combined string tends to blow past Google + X title limits. */
  appendSiteName?: boolean;
}

function toAbs(u?: string): string | undefined {
  if (!u) return undefined;
  if (/^https?:\/\//.test(u)) return u;
  if (u.startsWith("/")) return `${SITE_URL}${u}`;
  return `${SITE_URL}/${u}`;
}

/**
 * Word count of a stripped-HTML body. Cheap and generous with word
 * boundaries so weird formatting (line breaks, punctuation) doesn't
 * throw it off dramatically.
 */
export function wordCount(html?: string): number {
  if (!html) return 0;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

/**
 * "N min read" style estimate. 220 wpm is a common blog-reading
 * baseline used across Medium, Substack, and similar tools.
 */
export function readingTimeLabel(html?: string): string {
  const n = wordCount(html);
  if (!n) return "";
  const min = Math.max(1, Math.round(n / 220));
  return `${min} min read`;
}

export function stripHtml(input?: string, max = 220): string {
  if (!input) return "";
  const stripped = input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > max ? stripped.slice(0, max - 1).trimEnd() + "…" : stripped;
}

/**
 * Build the meta descriptors array RR v7's `meta` export expects.
 * Includes title, description, canonical, OG, Twitter Card, and
 * optional JSON-LD blob. All URLs get normalized to absolute.
 */
export function buildMeta(args: BuildMetaArgs): Array<Record<string, any>> {
  const url = toAbs(args.path)!;
  const image = toAbs(args.image ?? DEFAULT_OG_IMAGE)!;
  // 125-char cap keeps us safely inside mobile social preview truncation
  // as well as Google SERP + X limits. One length that works everywhere
  // is easier than juggling per-tag caps.
  const rawDescription = args.description ?? "";
  const description = rawDescription.length > 125
    ? rawDescription.slice(0, 124).trimEnd() + "…"
    : rawDescription;
  const ogType = args.ogType ?? "website";
  const appendSite = args.appendSiteName ?? true;
  const fullTitle =
    args.title.includes(SITE_NAME) || !appendSite
      ? args.title
      : `${args.title} — ${SITE_NAME}`;

  const out: Array<Record<string, any>> = [
    { title: fullTitle },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },

    // Open Graph — covers Bluesky / Mastodon / Slack / iMessage / LI
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: ogType },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:image", content: image },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];

  if (ogType === "article") {
    if (args.publishedTime) {
      out.push({ property: "article:published_time", content: args.publishedTime });
    }
    if (args.modifiedTime) {
      out.push({ property: "article:modified_time", content: args.modifiedTime });
    }
    out.push({ property: "article:author", content: AUTHOR_NAME });
  }

  if (args.jsonLd) {
    // RR v7 supports "script:ld+json" descriptor for JSON-LD blobs.
    out.push({ "script:ld+json": args.jsonLd });
  }

  return out;
}

/**
 * Build a BlogPosting JSON-LD blob for an article/post page. Renders
 * as rich results in Google when the post has clear headline/date/image.
 */
export function blogPostingJsonLd(args: {
  title: string;
  description: string;
  url: string;
  image?: string;
  publishedIso?: string;
  modifiedIso?: string;
  wordCount?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: args.title,
    description: args.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": toAbs(args.url) },
    url: toAbs(args.url),
    image: toAbs(args.image ?? DEFAULT_OG_IMAGE),
    author: {
      "@type": "Person",
      name: AUTHOR_NAME,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Person",
      name: AUTHOR_NAME,
      url: SITE_URL,
    },
    ...(args.publishedIso ? { datePublished: args.publishedIso } : {}),
    ...(args.modifiedIso ? { dateModified: args.modifiedIso } : {}),
    ...(args.wordCount && args.wordCount > 0 ? { wordCount: args.wordCount } : {}),
  };
}

export const SEO_CONST = {
  DOMAIN,
  SITE_URL,
  SITE_NAME,
  AUTHOR_NAME,
  DEFAULT_OG_IMAGE,
};
