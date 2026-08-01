/**
 * Automatic internal backlinks.
 *
 * For any URL on the site (a post permalink, /h/now, /h/about, etc.),
 * find every published Public post whose HTML content contains a link
 * to it. Renders as a "Referenced by" section under the target.
 *
 * Implementation: a regex scan over the `content` field of the
 * myPosts collection. Cheap at personal-blog scale (hundreds of
 * posts, each a few KB) BUT the regex is unindexable, so under any
 * shared-tier Mongo contention it can be slow enough to bring the
 * whole pageview down. Wrapped in a per-instance in-memory cache
 * with a short TTL to keep it survivable during noisy-neighbor
 * events on Atlas M0. First request after cold start pays the
 * lookup; subsequent requests for the same path within the TTL
 * window get an instant response.
 */

import { clientPromise, ObjectId } from "~/lib/mongodb";
import { serializeDocs } from "~/utils/serialize.server";

const DOMAIN = "pg.mccullo.ug";
const MAX_BACKLINKS = 20;

// Cache TTL — long enough to absorb bursts and slow-Mongo periods,
// short enough that a newly-linked post shows up as a backlink
// within a few minutes of publish. Cache lives per Vercel function
// instance; multiple instances each maintain their own.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  backlinks: Backlink[];
  expires: number;
}
const backlinkCache = new Map<string, CacheEntry>();

export interface Backlink {
  _id: string;
  content?: string;
  created?: number;
  seoMeta?: { slug?: string };
}

/**
 * Escape a string for use inside a RegExp source. Standard escape
 * of the special regex metacharacters.
 */
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a regex that matches any HTML `href` pointing at `targetPath`
 * on this site. Accepts:
 *   - href="/h/now"                 (root-relative, exact)
 *   - href="/h/now/anything"        (with continuation — post slugs)
 *   - href="https://pg.mccullo.ug/h/now"      (absolute)
 *   - href="https://pg.mccullo.ug/h/now/foo"  (absolute + slug)
 *
 * Rejects `/h/now-other-thing` because the trailing group requires
 * either a slash or the closing quote, not any other character.
 */
function hrefRegex(targetPath: string): RegExp {
  const escaped = reEscape(targetPath);
  return new RegExp(
    `href=["'](?:https?:\\/\\/${reEscape(DOMAIN)})?${escaped}(?:[/?#][^"']*)?["']`,
    "i"
  );
}

/**
 * Fetch backlinks whose HTML content links to the given path.
 * Skips the post identified by `excludePostId` so a post's own
 * self-references (e.g. a "previously" note in the same post)
 * don't inflate its own backlinks list.
 */
export async function findBacklinksToPath(
  targetPath: string,
  opts: { excludePostId?: string } = {}
): Promise<Backlink[]> {
  const cacheKey = `${targetPath}::${opts.excludePostId ?? ""}`;
  const cached = backlinkCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.backlinks;
  }

  const client = await clientPromise;
  const db = client.db("user_posts");
  const filter: any = {
    privacy: "Public",
    state: { $nin: ["draft", "scheduled"] },
    content: { $regex: hrefRegex(targetPath) },
  };
  if (opts.excludePostId && ObjectId.isValid(opts.excludePostId)) {
    filter._id = { $ne: new ObjectId(opts.excludePostId) };
  }
  const raw = await db
    .collection("myPosts")
    .find(filter)
    .project({ _id: 1, content: 1, created: 1, seoMeta: 1 })
    .sort({ created: -1 })
    .limit(MAX_BACKLINKS)
    .toArray();
  const backlinks = serializeDocs(raw) as unknown as Backlink[];
  backlinkCache.set(cacheKey, {
    backlinks,
    expires: Date.now() + CACHE_TTL_MS,
  });
  return backlinks;
}

/**
 * Convenience wrapper for post → post backlinks. The excludePostId
 * default prevents a post from citing itself in its own backlinks
 * list (would be visually confusing).
 */
export async function findBacklinksToPost(postId: string): Promise<Backlink[]> {
  return findBacklinksToPath(`/h/post/${postId}`, { excludePostId: postId });
}
