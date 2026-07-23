/**
 * Webmention helpers — receive-side verification + parse, and
 * send-side endpoint discovery.
 *
 * Kept dep-free: microformats and endpoint discovery are handled with
 * targeted regex parsing rather than pulling a full DOM library.
 * Enough for common IndieWeb setups + Bridgy's webmention shape.
 */

export interface WebmentionSourceMeta {
  title?: string;
  authorName?: string;
  authorUrl?: string;
  authorPhoto?: string;
  content?: string;
  publishedAt?: number; // unix ms
  type: "mention" | "reply" | "like" | "repost" | "bookmark";
}

const UA = "pg.mccullo.ug webmention agent";

/**
 * Fetch a URL with a sane User-Agent, timeout, and gzip acceptance.
 * Returns null on any failure.
 */
async function safeFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html, application/xhtml+xml, */*; q=0.8",
        ...(init.headers ?? {}),
      },
      redirect: "follow",
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify a webmention: fetch source HTML, confirm it links to target.
 * Returns the raw HTML on success so the caller can parse metadata
 * from it in the same pass.
 */
export async function verifyWebmention(args: {
  source: string;
  target: string;
}): Promise<{ ok: true; html: string } | { ok: false; reason: string }> {
  const res = await safeFetch(args.source);
  if (!res) return { ok: false, reason: "source fetch failed" };
  if (!res.ok) return { ok: false, reason: `source returned ${res.status}` };
  const contentType = res.headers.get("content-type") ?? "";
  if (!/text\/html|xhtml|xml/.test(contentType)) {
    return { ok: false, reason: "source is not HTML" };
  }
  const html = await res.text();
  // Confirm the target URL appears verbatim as an href in the HTML.
  // We check both the exact URL and — for canonicals ending with a
  // trailing slash — the variant. Deliberately strict per spec.
  const targetVariants = new Set<string>([args.target]);
  if (args.target.endsWith("/")) {
    targetVariants.add(args.target.replace(/\/+$/, ""));
  } else {
    targetVariants.add(args.target + "/");
  }
  let found = false;
  for (const t of targetVariants) {
    // Match href="target" or href='target' with any surrounding whitespace.
    const escaped = t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const re = new RegExp(`href\\s*=\\s*["']${escaped}["']`, "i");
    if (re.test(html)) {
      found = true;
      break;
    }
  }
  if (!found) return { ok: false, reason: "target link not found on source" };
  return { ok: true, html };
}

// ---------------------------------------------------------------------------
// Metadata extraction — h-entry microformats first, then OG/HTML fallbacks
// ---------------------------------------------------------------------------

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function attr(name: string, tag: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag);
  return m ? m[1] : undefined;
}

function pickMeta(html: string, ...keys: Array<{ prop?: string; name?: string }>): string | undefined {
  for (const k of keys) {
    if (k.prop) {
      const m = new RegExp(
        `<meta[^>]*property\\s*=\\s*["']${k.prop}["'][^>]*>`,
        "i"
      ).exec(html);
      if (m) {
        const c = attr("content", m[0]);
        if (c) return c;
      }
    }
    if (k.name) {
      const m = new RegExp(
        `<meta[^>]*name\\s*=\\s*["']${k.name}["'][^>]*>`,
        "i"
      ).exec(html);
      if (m) {
        const c = attr("content", m[0]);
        if (c) return c;
      }
    }
  }
  return undefined;
}

/**
 * Extract the smallest h-entry snippet from HTML that contains the
 * target URL — Mastodon / Bridgy / regular blog posts all emit this.
 * Falls back to whole document if no h-entry class is found.
 */
function findHEntry(html: string, target: string): string {
  // Match `<article class="... h-entry ...">...</article>` OR
  // `<div class="... h-entry ...">...</div>` non-greedy. Prefer the
  // one containing the target link.
  const re = /<(article|div|section)[^>]*class\s*=\s*["'][^"']*\bh-entry\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
  let best = html;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(html)) !== null) {
    if (hit[0].includes(target)) {
      best = hit[0];
      break;
    }
    best = hit[0]; // fall back to any h-entry
  }
  return best;
}

/**
 * Parse the source HTML for author / content / type / published.
 * Deliberately permissive — any missing field is fine, better a
 * lightweight mention than none.
 */
export function parseSourceMeta(
  html: string,
  target: string
): WebmentionSourceMeta {
  const entryHtml = findHEntry(html, target);

  // ---- type detection via u-in-reply-to / u-like-of / u-repost-of ----
  let type: WebmentionSourceMeta["type"] = "mention";
  const targetEsc = target.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const kinds: Array<[WebmentionSourceMeta["type"], string]> = [
    ["reply", "u-in-reply-to"],
    ["like", "u-like-of"],
    ["repost", "u-repost-of"],
    ["bookmark", "u-bookmark-of"],
  ];
  for (const [t, cls] of kinds) {
    const re = new RegExp(
      `<a[^>]*class\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*href\\s*=\\s*["']${targetEsc}["']`,
      "i"
    );
    if (re.test(entryHtml)) {
      type = t;
      break;
    }
  }

  // ---- author ----
  let authorName: string | undefined;
  let authorUrl: string | undefined;
  let authorPhoto: string | undefined;

  // h-card block: `<a class="p-author h-card" ...>NAME</a>` or with img.
  const hCardMatch = /<(a|div|span)[^>]*class\s*=\s*["'][^"']*\bp-author\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/i.exec(entryHtml);
  if (hCardMatch) {
    const block = hCardMatch[0];
    // Look for the u-url inside, or the first anchor's href.
    const urlM = /class\s*=\s*["'][^"']*\bu-url\b[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(block) ||
      /<a[^>]*href\s*=\s*["']([^"']+)["']/i.exec(block);
    if (urlM) authorUrl = urlM[1];
    const nameM = /class\s*=\s*["'][^"']*\bp-name\b[^"']*["'][^>]*>([^<]+)/i.exec(block);
    if (nameM) authorName = stripTags(nameM[1]);
    else authorName = stripTags(block);
    const imgM = /<img[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/i.exec(block);
    if (imgM) authorPhoto = imgM[1];
  }
  if (!authorName) authorName = pickMeta(html, { name: "author" }, { prop: "og:site_name" });
  if (!authorUrl) authorUrl = pickMeta(html, { prop: "og:url" });
  if (!authorPhoto) authorPhoto = pickMeta(html, { prop: "og:image" });

  // ---- content ----
  let content: string | undefined;
  const contentM =
    /<[^>]+class\s*=\s*["'][^"']*\b(e-content|p-content)\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i.exec(entryHtml);
  if (contentM) content = stripTags(contentM[2]);
  if (!content) content = pickMeta(html, { prop: "og:description" }, { name: "description" });

  // ---- title ----
  let title: string | undefined = pickMeta(html, { prop: "og:title" });
  if (!title) {
    const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
    if (t) title = stripTags(t[1]);
  }

  // ---- published ----
  let publishedAt: number | undefined;
  const timeM = /<time[^>]*(class\s*=\s*["'][^"']*\bdt-published\b[^"']*["'])[^>]*datetime\s*=\s*["']([^"']+)["']/i.exec(entryHtml) ||
    /<time[^>]*datetime\s*=\s*["']([^"']+)["']/i.exec(entryHtml);
  const iso = timeM ? (timeM[2] ?? timeM[1]) : undefined;
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) publishedAt = t;
  }
  if (!publishedAt) {
    const isoMeta = pickMeta(html, { prop: "article:published_time" });
    if (isoMeta) {
      const t = Date.parse(isoMeta);
      if (Number.isFinite(t)) publishedAt = t;
    }
  }

  // Cap content at a sane length so a long post excerpt doesn't
  // dominate the display area.
  if (content && content.length > 500) {
    content = content.slice(0, 499).trimEnd() + "…";
  }

  return {
    title,
    authorName,
    authorUrl,
    authorPhoto,
    content,
    publishedAt,
    type,
  };
}

// ---------------------------------------------------------------------------
// Send-side: endpoint discovery + delivery
// ---------------------------------------------------------------------------

/**
 * Discover a target's webmention endpoint per W3C spec:
 *  1. HEAD, check Link header for rel="webmention"
 *  2. Full GET, check Link header
 *  3. Parse <link rel="webmention"> and <a rel="webmention"> in HTML
 * Returns absolute endpoint URL or null.
 */
export async function discoverWebmentionEndpoint(target: string): Promise<string | null> {
  // Try HEAD first — it's cheap and many servers advertise via
  // Link header without needing the full body.
  const head = await safeFetch(target, { method: "HEAD" });
  if (head) {
    const fromLink = parseLinkHeader(head.headers.get("link"), target);
    if (fromLink) return fromLink;
  }
  // Full GET otherwise.
  const get = await safeFetch(target, { method: "GET" });
  if (!get) return null;
  const fromLink = parseLinkHeader(get.headers.get("link"), target);
  if (fromLink) return fromLink;
  const html = await get.text().catch(() => "");
  if (!html) return null;
  return parseWebmentionRelInHtml(html, target);
}

function parseLinkHeader(header: string | null, base: string): string | null {
  if (!header) return null;
  // Format: `<url>; rel="webmention", <url2>; rel="another"`
  const parts = header.split(",");
  for (const part of parts) {
    const m = /<([^>]+)>\s*;\s*rel\s*=\s*"?([^",;\s]+)"?/i.exec(part.trim());
    if (m && /(^|\s)webmention(\s|$)/.test(m[2])) {
      try {
        return new URL(m[1], base).toString();
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseWebmentionRelInHtml(html: string, base: string): string | null {
  // <link rel="webmention" href="..." /> or <a rel="webmention" href="...">
  const re = /<(link|a)[^>]*rel\s*=\s*["'][^"']*\bwebmention\b[^"']*["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = attr("href", m[0]);
    if (href) {
      try {
        return new URL(href, base).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Send a webmention to a discovered endpoint. Returns true on 2xx.
 */
export async function sendWebmention(args: {
  endpoint: string;
  source: string;
  target: string;
}): Promise<boolean> {
  try {
    const body = new URLSearchParams({
      source: args.source,
      target: args.target,
    });
    const res = await safeFetch(args.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}

/**
 * Extract external <a href="https://..."> URLs from a snippet of
 * post-content HTML. Skips same-origin links, mailto:, javascript:,
 * and #-only anchors. Returns unique URLs in document order.
 */
export function extractExternalLinks(html: string, sameOrigin: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  const sameHost = (() => {
    try { return new URL(sameOrigin).host; } catch { return ""; }
  })();
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!/^https?:\/\//i.test(raw)) continue;
    try {
      const u = new URL(raw);
      if (u.host === sameHost) continue;
      if (seen.has(u.toString())) continue;
      seen.add(u.toString());
      out.push(u.toString());
    } catch {
      continue;
    }
  }
  return out;
}
