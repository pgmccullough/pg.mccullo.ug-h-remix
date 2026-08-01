/**
 * In-memory cache for the "all embedded posts" list used by the
 * related-posts ranker on post permalinks.
 *
 * The ranker fetches every public+published post's embedding vector
 * to compute cosine similarity against the current post. At personal-
 * blog scale that's ~1-2MB of data per query — normally fast, but
 * a full-collection projection under Atlas M0 noisy-neighbor slowdowns
 * is enough to time the whole loader out. Caching amortizes the fetch
 * across many pageviews and keeps the ranker responsive during
 * shared-tier contention.
 *
 * Cache scope: per Vercel function instance. Each cold-started
 * instance pays the first fetch; subsequent requests within the TTL
 * are in-memory. When embeddings change (new post published,
 * backfill runs), stale caches expire naturally within the window.
 * If instant freshness ever matters, add an explicit invalidateAll()
 * call to publishSideEffects / generate-embedding.
 */

import { clientPromise } from "~/lib/mongodb";
import { serializeDocs } from "~/utils/serialize.server";

export interface EmbeddedPost {
  _id: string;
  content?: string;
  created?: number;
  seoMeta?: { slug?: string };
  embedding: number[];
}

// 15 min — embeddings change infrequently (only on publish +
// backfill). A stale-by-15-minutes related-posts ranker is fine.
const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  posts: EmbeddedPost[];
  expires: number;
}
let cached: CacheEntry | null = null;

/**
 * Return all published Public posts that have an embedding vector,
 * projecting only the fields the ranker needs. Cached in-memory
 * for CACHE_TTL_MS.
 */
export async function getAllEmbeddedPosts(): Promise<EmbeddedPost[]> {
  if (cached && cached.expires > Date.now()) {
    return cached.posts;
  }
  const client = await clientPromise;
  const db = client.db("user_posts");
  const raw = await db
    .collection("myPosts")
    .find({
      privacy: "Public",
      state: { $nin: ["draft", "scheduled"] },
      embedding: { $exists: true, $type: "array" },
    })
    .project({ _id: 1, content: 1, created: 1, seoMeta: 1, embedding: 1 })
    .toArray();
  const posts = serializeDocs(raw) as unknown as EmbeddedPost[];
  cached = { posts, expires: Date.now() + CACHE_TTL_MS };
  return posts;
}

/**
 * Force-expire the cache. Call from any code path that just
 * published or backfilled an embedding if you want the ranker to
 * see the new vector immediately instead of waiting for the TTL.
 */
export function invalidateEmbeddedPosts(): void {
  cached = null;
}
