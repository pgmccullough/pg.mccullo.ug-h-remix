/**
 * Storage for federation interactions in both directions:
 *
 *   federation_my_reactions    — likes/boosts WE'VE done on remote Notes
 *                                (so the UI can show toggled state)
 *
 *   federation_notifications   — interactions OTHERS have done on OUR Notes
 *                                (likes, boosts, replies)
 */

import { clientPromise } from "~/lib/mongodb";

// ---------------------------------------------------------------------------
// federation_my_reactions
// ---------------------------------------------------------------------------

export type ReactionKind = "like" | "boost";

export interface MyReaction {
  noteUri: string;       // the remote post we reacted to
  kind: ReactionKind;
  activityId: string;    // the URI of the Like/Announce activity we sent (for Undo)
  createdAt: number;
}

async function myReactionsCol() {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const c = db.collection<MyReaction>("federation_my_reactions");
  try {
    await c.createIndex({ noteUri: 1, kind: 1 }, { unique: true });
  } catch {
    /* idempotent */
  }
  return c;
}

export async function recordMyReaction(r: MyReaction): Promise<void> {
  const c = await myReactionsCol();
  await c.updateOne(
    { noteUri: r.noteUri, kind: r.kind },
    { $set: r },
    { upsert: true }
  );
}

export async function removeMyReaction(
  noteUri: string,
  kind: ReactionKind
): Promise<MyReaction | null> {
  const c = await myReactionsCol();
  const doc = await c.findOneAndDelete({ noteUri, kind });
  return (doc as unknown as MyReaction) ?? null;
}

export async function findMyReaction(
  noteUri: string,
  kind: ReactionKind
): Promise<MyReaction | null> {
  const c = await myReactionsCol();
  return c.findOne({ noteUri, kind });
}

/** Get all reactions for a batch of notes (for rendering UI state). */
export async function getMyReactionsFor(
  noteUris: string[]
): Promise<Record<string, { like?: boolean; boost?: boolean }>> {
  if (!noteUris.length) return {};
  const c = await myReactionsCol();
  const docs = await c.find({ noteUri: { $in: noteUris } }).toArray();
  const out: Record<string, { like?: boolean; boost?: boolean }> = {};
  for (const d of docs) {
    out[d.noteUri] = out[d.noteUri] ?? {};
    out[d.noteUri][d.kind] = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
// federation_notifications
// ---------------------------------------------------------------------------

export type NotificationKind = "like" | "boost" | "reply";

export interface FederationNotification {
  kind: NotificationKind;
  sourceActorUri: string;     // who did the thing
  targetPostId: string;       // our post's Mongo _id (string)
  targetNoteUri: string;      // our post's AP URI
  replyNoteUri?: string;      // for replies: the reply note's URI
  receivedAt: number;
  readAt?: number;
}

async function notificationsCol() {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const c = db.collection<FederationNotification>("federation_notifications");
  try {
    await c.createIndex({ receivedAt: -1 });
    await c.createIndex(
      { kind: 1, sourceActorUri: 1, targetNoteUri: 1, replyNoteUri: 1 },
      { unique: true, sparse: true }
    );
  } catch {
    /* idempotent */
  }
  return c;
}

export async function storeNotification(
  n: FederationNotification
): Promise<void> {
  const c = await notificationsCol();
  try {
    await c.insertOne(n);
  } catch (err: any) {
    // Duplicate key — ignore. Some servers re-deliver activities.
    if (err?.code !== 11000) throw err;
  }
}

export async function removeNotification(
  kind: NotificationKind,
  sourceActorUri: string,
  targetNoteUri: string
): Promise<void> {
  const c = await notificationsCol();
  await c.deleteOne({ kind, sourceActorUri, targetNoteUri });
}

export async function listNotifications(opts: {
  limit?: number;
  beforeReceivedAt?: number;
}): Promise<{
  items: FederationNotification[];
  nextCursorMs: number | null;
}> {
  const limit = opts.limit ?? 50;
  const c = await notificationsCol();
  const filter: any = {};
  if (opts.beforeReceivedAt != null) {
    filter.receivedAt = { $lt: opts.beforeReceivedAt };
  }
  const items = await c
    .find(filter)
    .sort({ receivedAt: -1 })
    .limit(limit + 1)
    .toArray();
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;
  return {
    items: trimmed,
    nextCursorMs: hasMore ? trimmed[trimmed.length - 1].receivedAt : null,
  };
}

export async function countUnreadNotifications(): Promise<number> {
  const c = await notificationsCol();
  return c.countDocuments({ readAt: { $exists: false } });
}

export async function markAllNotificationsRead(): Promise<void> {
  const c = await notificationsCol();
  await c.updateMany(
    { readAt: { $exists: false } },
    { $set: { readAt: Date.now() } }
  );
}

/**
 * For our own posts, return per-post counts of likes/boosts/replies.
 * Returns a map keyed by targetNoteUri.
 */
export async function getReceivedCountsByNote(
  noteUris: string[]
): Promise<
  Record<string, { likes: number; boosts: number; replies: number }>
> {
  if (!noteUris.length) return {};
  const c = await notificationsCol();
  const agg = await c
    .aggregate([
      { $match: { targetNoteUri: { $in: noteUris } } },
      {
        $group: {
          _id: { uri: "$targetNoteUri", kind: "$kind" },
          n: { $sum: 1 },
        },
      },
    ])
    .toArray();
  const out: Record<string, { likes: number; boosts: number; replies: number }> = {};
  for (const uri of noteUris) {
    out[uri] = { likes: 0, boosts: 0, replies: 0 };
  }
  for (const row of agg as Array<{
    _id: { uri: string; kind: NotificationKind };
    n: number;
  }>) {
    const bucket = out[row._id.uri];
    if (!bucket) continue;
    if (row._id.kind === "like") bucket.likes = row.n;
    else if (row._id.kind === "boost") bucket.boosts = row.n;
    else if (row._id.kind === "reply") bucket.replies = row.n;
  }
  return out;
}
