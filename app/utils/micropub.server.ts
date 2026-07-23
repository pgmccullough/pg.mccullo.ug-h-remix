/**
 * Micropub parser + property mapper.
 *
 * Accepts both encodings defined in the Micropub spec §3.3:
 *   - application/json         (Microformats2 shape: type/properties)
 *   - application/x-www-form-urlencoded / multipart/form-data
 *
 * Normalizes to a single MicropubEntry so the route handler doesn't
 * care which format the client used.
 *
 * Spec: https://www.w3.org/TR/micropub/
 */

const DOMAIN = "pg.mccullo.ug";

/**
 * Normalized post shape after parsing. Only h-entry is supported
 * (Phase 1); other Microformats2 types would 400 in the route.
 */
export interface MicropubEntry {
  contentHtml?: string;      // final HTML, already wrapped if plaintext
  category?: string[];       // → post.tags
  inReplyTo?: string;
  slug?: string;             // → post.seoMeta.slug
  publishedSeconds?: number; // → post.created (unix seconds)
  photoUrls?: string[];      // URLs, already-hosted
  visibility?: "public" | "private";
  syndicateTo?: string[];    // mp-syndicate-to values
}

export interface ParsedMicropub {
  entry?: MicropubEntry;
  action?: "create" | "update" | "delete";
  targetUrl?: string;
  photoFiles?: File[];       // multipart file uploads, if any
  videoFiles?: File[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Body parsing — dispatch by content type
// ---------------------------------------------------------------------------

export async function parseMicropubBody(request: Request): Promise<ParsedMicropub> {
  const ctype = (request.headers.get("content-type") ?? "").toLowerCase();

  if (ctype.includes("application/json")) {
    return parseJsonBody(request);
  }
  // Both application/x-www-form-urlencoded and multipart/form-data go
  // through Web's built-in formData(). Files come back as File objects.
  return parseFormBody(request);
}

async function parseJsonBody(request: Request): Promise<ParsedMicropub> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return { errors: ["invalid JSON"] };
  }

  // Action requests (update/delete) share a shape distinct from
  // creates — no properties, just {action, url, ...ops}.
  if (typeof body?.action === "string") {
    const action = body.action;
    if (action !== "update" && action !== "delete") {
      return { errors: [`unsupported action: ${action}`] };
    }
    return { action, targetUrl: String(body.url ?? ""), errors: [] };
  }

  const type = Array.isArray(body?.type) ? body.type[0] : body?.type;
  if (type !== "h-entry") {
    return { errors: [`unsupported type: ${type ?? "(none)"}`] };
  }

  const p = body.properties ?? {};
  const rawContent = p.content;
  return {
    action: "create",
    entry: {
      contentHtml: extractContent(rawContent),
      category: arrayOfStrings(p.category),
      inReplyTo: firstString(p["in-reply-to"]),
      slug: firstString(p["mp-slug"]) ?? firstString(p.slug),
      publishedSeconds: parsePublished(firstString(p.published)),
      photoUrls: arrayOfStrings(p.photo).filter((u) => /^https?:\/\//.test(u)),
      visibility:
        firstString(p.visibility) === "private" ? "private" : "public",
      syndicateTo: arrayOfStrings(p["mp-syndicate-to"]),
    },
    errors: [],
  };
}

async function parseFormBody(request: Request): Promise<ParsedMicropub> {
  const form = await request.formData();
  const action = form.get("action")?.toString();
  if (action === "update" || action === "delete") {
    return {
      action,
      targetUrl: form.get("url")?.toString() ?? "",
      errors: [],
    };
  }

  const h = form.get("h")?.toString();
  if (h !== "entry") {
    return { errors: [`unsupported h type: ${h ?? "(none)"}`] };
  }

  const photoFiles: File[] = [];
  const videoFiles: File[] = [];
  const photoUrls: string[] = [];
  const categories: string[] = [];
  const syndicateTo: string[] = [];

  // Form-encoded Micropub uses either `key=value` or `key[]=value`
  // for repeatable properties. Walk all entries once and route by key.
  for (const [k, v] of form.entries()) {
    const key = k.replace(/\[\]$/, "");
    if (key === "photo") {
      if (v instanceof File) {
        photoFiles.push(v);
      } else if (typeof v === "string" && /^https?:\/\//.test(v)) {
        photoUrls.push(v);
      }
    } else if (key === "video") {
      if (v instanceof File) videoFiles.push(v);
    } else if (key === "category") {
      if (typeof v === "string" && v) categories.push(v);
    } else if (key === "mp-syndicate-to") {
      if (typeof v === "string" && v) syndicateTo.push(v);
    }
  }

  const contentRaw = form.get("content")?.toString();
  return {
    action: "create",
    entry: {
      contentHtml: contentRaw ? textToHtml(contentRaw) : undefined,
      category: categories.length ? categories : undefined,
      inReplyTo: form.get("in-reply-to")?.toString() || undefined,
      slug:
        form.get("mp-slug")?.toString() ||
        form.get("slug")?.toString() ||
        undefined,
      publishedSeconds: parsePublished(form.get("published")?.toString()),
      photoUrls,
      visibility:
        form.get("visibility")?.toString() === "private" ? "private" : "public",
      syndicateTo: syndicateTo.length ? syndicateTo : undefined,
    },
    photoFiles,
    videoFiles,
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Content shape handling: Micropub allows `content` as:
//   - a string (plain text — we wrap into <p>)
//   - an object {html: "..."} (raw HTML — pass through)
//   - an array of either (concatenated)
// ---------------------------------------------------------------------------

function extractContent(raw: any): string | undefined {
  if (raw == null) return undefined;
  const items = Array.isArray(raw) ? raw : [raw];
  const chunks: string[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      chunks.push(textToHtml(item));
    } else if (item && typeof item === "object" && typeof item.html === "string") {
      chunks.push(item.html);
    } else if (item && typeof item === "object" && typeof item.value === "string") {
      chunks.push(textToHtml(item.value));
    }
  }
  return chunks.length ? chunks.join("\n") : undefined;
}

/**
 * Wrap plaintext in HTML paragraphs. Double-newline splits into
 * paragraphs; single newlines become <br/>. Matches the shape the
 * TextEditor produces so PostCard's e-content renders identically.
 */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return "";
      const escaped = escapeHtml(trimmed).replace(/\n/g, "<br/>");
      return `<p>${escaped}</p>`;
    })
    .filter(Boolean)
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Primitive coercion helpers
// ---------------------------------------------------------------------------

function firstString(v: any): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length && typeof v[0] === "string") return v[0];
  return undefined;
}

function arrayOfStrings(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x: any) => typeof x === "string");
  if (typeof v === "string") return [v];
  return [];
}

function parsePublished(s?: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return undefined;
  return Math.floor(t / 1000);
}

// ---------------------------------------------------------------------------
// Photo URL handling: our media proxy serves files at
// /api/media/<kind>/<basename>. When a Micropub client sends a URL
// pointing at our own media proxy (i.e., a file uploaded via
// /api/upload/presign first), we extract the basename so it slots
// into post.media.images the way the rest of the app expects.
// External URLs are dropped in Phase 1 — a future media endpoint
// will let clients upload directly and receive local URLs.
// ---------------------------------------------------------------------------

export function basenameFromMediaUrl(
  url: string,
  kind: "images" | "videos"
): string | null {
  try {
    const u = new URL(url);
    const okHost =
      u.hostname === DOMAIN || u.hostname.endsWith(".vercel.app");
    if (!okHost) return null;
    const m = u.pathname.match(new RegExp(`/api/media/${kind}/([^/?#]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tag normalization: same rules the LLM sanitizer uses, so tags coming
// from Micropub clients land in the same shape as auto-generated ones.
// ---------------------------------------------------------------------------

export function normalizeTag(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const t = raw
    .toLowerCase()
    .replace(/[‘’“”"']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!t || t.length < 2 || t.length > 32) return null;
  if (/^[0-9-]+$/.test(t)) return null;
  return t;
}
