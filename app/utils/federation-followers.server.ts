/**
 * Storage layer for ActivityPub followers.
 *
 * One Mongo collection, `federation_followers`. Each document represents a
 * remote actor following one of our local actors.
 *
 * Schema:
 *   handle           — which of our actors they follow (currently always "patrick")
 *   actorUri         — the remote actor's id URL
 *   inboxUri         — where to deliver activities for this follower
 *   sharedInboxUri   — optional shared inbox URL (preferred for fan-out)
 *   followedAt       — ms since epoch when we recorded the Follow
 *
 * The unique compound index on (handle, actorUri) means re-follows from the
 * same actor are no-ops (insertion fails harmlessly).
 */

import { clientPromise } from "~/lib/mongodb";

export interface FollowerRecord {
  handle: string;
  actorUri: string;
  inboxUri: string;
  sharedInboxUri?: string;
  followedAt: number;
}

async function col() {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const c = db.collection<FollowerRecord>("federation_followers");
  // createIndex is idempotent — safe to call on every access.
  try {
    await c.createIndex({ handle: 1, actorUri: 1 }, { unique: true });
  } catch {
    /* already exists with different opts, ignore */
  }
  return c;
}

export async function recordFollower(record: FollowerRecord): Promise<void> {
  const c = await col();
  try {
    await c.updateOne(
      { handle: record.handle, actorUri: record.actorUri },
      { $set: record },
      { upsert: true }
    );
  } catch (err) {
    console.error(`[federation] recordFollower failed:`, err);
    throw err;
  }
}

export async function removeFollower(
  handle: string,
  actorUri: string
): Promise<void> {
  const c = await col();
  await c.deleteOne({ handle, actorUri });
}

export async function countFollowers(handle: string): Promise<number> {
  const c = await col();
  return c.countDocuments({ handle });
}

/**
 * Page through followers in followedAt descending order. Used by the
 * federation outbox/followers dispatcher.
 */
export async function listFollowers(
  handle: string,
  opts: { limit?: number; cursorMs?: number } = {}
): Promise<{ items: FollowerRecord[]; nextCursorMs: number | null }> {
  const limit = opts.limit ?? 50;
  const c = await col();
  const filter: any = { handle };
  if (opts.cursorMs != null) {
    filter.followedAt = { $lt: opts.cursorMs };
  }
  const items = await c
    .find(filter)
    .sort({ followedAt: -1 })
    .limit(limit + 1)
    .toArray();
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;
  const nextCursorMs = hasMore ? trimmed[trimmed.length - 1].followedAt : null;
  return { items: trimmed, nextCursorMs };
}
