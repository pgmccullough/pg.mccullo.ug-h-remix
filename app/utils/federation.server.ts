/**
 * ActivityPub federation singleton.
 *
 * This is the brain of our Fediverse integration. Fedify handles the wire
 * protocol (HTTP signatures, content negotiation, activity dispatch, NodeInfo,
 * WebFinger). We tell it:
 *
 *   - which paths host which kinds of resource (actor / inbox / outbox / etc)
 *   - how to look up an actor given a handle
 *   - how to enumerate the actor's outbox
 *   - what to do with incoming activities (Phase A2+)
 *
 * Phase A1 only implements actor + WebFinger + NodeInfo dispatchers. The
 * inbox and outbox are wired up as stubs so the URLs exist in the actor
 * document but don't deliver yet.
 */

import {
  createFederation,
  MemoryKvStore,
  Person,
  Image,
  Endpoints,
  CryptographicKey,
  Multikey,
  Note,
  Follow,
  Undo,
  Accept,
  Reject,
  Create,
  Update,
  Delete,
  Announce,
  exportJwk,
  importJwk,
  generateCryptoKeyPair,
} from "@fedify/fedify";

import { clientPromise } from "~/lib/mongodb";
import {
  recordFollower,
  removeFollower,
  countFollowers,
  listFollowers,
} from "~/utils/federation-followers.server";
import {
  countPublicPosts,
  findPublicPostById,
  listPublicPosts,
  postToNote,
  postToCreate,
} from "~/utils/federation-posts.server";
import {
  markAcceptedByActor,
  markRejectedByActor,
  countFollowing,
  listFollowing,
} from "~/utils/federation-following.server";
import {
  storeInboxPost,
  updateInboxPost,
  softDeleteInboxPost,
  cacheRemoteActor,
} from "~/utils/federation-inbox-posts.server";
import type { InboxPost } from "~/utils/federation-inbox-posts.server";

// Hardcoded for now — single-user instance. Phase E (managed hosting) will
// look this up per request from the host header / Mongo.
const PRIMARY_USERNAME = "patrick";
const DOMAIN = "pg.mccullo.ug";

// ---------------------------------------------------------------------------
// Federation object
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __federation: ReturnType<typeof createFederation<void>> | undefined;
}

export const federation =
  globalThis.__federation ??
  (globalThis.__federation = createFederation<void>({
    // Memory KV for Phase A1. We persist the RSA keys directly to Mongo
    // ourselves below; Fedify only uses the KV for caches that are fine to
    // lose on cold start. We'll upgrade to a Mongo-backed KV later if needed.
    kv: new MemoryKvStore(),
    // Don't trust X-Forwarded-* unless we know what's setting them. Vercel
    // sets them correctly; if we ever deploy elsewhere this may need a
    // tweak.
    trailingSlashInsensitive: true,
  }));

// ---------------------------------------------------------------------------
// Key management — RSA + Ed25519 keypairs per actor, persisted in Mongo
// ---------------------------------------------------------------------------
//
// We generate TWO keypairs:
//   - RSASSA-PKCS1-v1_5: used by Mastodon for HTTP signature verification.
//     This is what shows up in the actor doc's legacy `publicKey` field.
//   - Ed25519: used for FEP-8b32 Data Integrity proofs (Multikey).
//     Shows up in `assertionMethod`. Newer/better, but not all servers
//     understand it yet.
//
// Returning both from setKeyPairsDispatcher means Fedify emits both forms,
// maximizing interop. The RSA one is the must-have for Mastodon.
//
// All key-loading errors are caught and logged so the dispatcher never
// throws — a thrown dispatcher would leave the actor doc with no key
// fields at all (which is what was happening before this fix).

type Algorithm = "RSASSA-PKCS1-v1_5" | "Ed25519";

interface StoredKey {
  handle: string;
  algorithm: Algorithm;
  privateKey: object; // JWK
  publicKey: object;  // JWK
  created: number;
}

const ALGORITHMS: Algorithm[] = ["RSASSA-PKCS1-v1_5", "Ed25519"];

async function loadOrCreateOneKeyPair(
  handle: string,
  algorithm: Algorithm
): Promise<CryptoKeyPair> {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const col = db.collection<StoredKey>("federation_keys");

  const existing = await col.findOne({ handle, algorithm });
  if (existing) {
    const privateKey = await importJwk(existing.privateKey as any, "private");
    const publicKey = await importJwk(existing.publicKey as any, "public");
    return { privateKey, publicKey };
  }

  const { privateKey, publicKey } = await generateCryptoKeyPair(algorithm);
  await col.insertOne({
    handle,
    algorithm,
    privateKey: await exportJwk(privateKey),
    publicKey: await exportJwk(publicKey),
    created: Date.now(),
  });
  return { privateKey, publicKey };
}

async function loadOrCreateKeyPairs(handle: string): Promise<CryptoKeyPair[]> {
  const pairs: CryptoKeyPair[] = [];
  for (const algorithm of ALGORITHMS) {
    try {
      pairs.push(await loadOrCreateOneKeyPair(handle, algorithm));
    } catch (err) {
      // Log but don't throw — we'd rather emit a partial actor doc with the
      // keys we do have than throw and emit nothing.
      console.error(
        `[federation] failed to load/create ${algorithm} keypair for ${handle}:`,
        err
      );
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Actor dispatcher: who is this user?
// ---------------------------------------------------------------------------

federation
  .setActorDispatcher(`/users/{identifier}`, async (ctx, identifier) => {
    console.log(`[federation] actor dispatcher CALLED for identifier=${identifier}`);
    if (identifier !== PRIMARY_USERNAME) return null;

    let user: any = null;
    try {
      const client = await clientPromise;
      const db = client.db("user_posts");
      [user] = await db
        .collection("myUsers")
        .find({ user_name: "PGMcCullough" })
        .toArray();
    } catch (err) {
      console.error(`[federation] actor dispatcher mongo lookup failed:`, err);
      return null;
    }

    if (!user) {
      console.error(`[federation] actor dispatcher: no user found for "PGMcCullough"`);
      return null;
    }

    // Eagerly load the keypairs so we can attach them to the Person object
    // directly. Belt-and-suspenders with setKeyPairsDispatcher — the latter
    // hasn't been reliably injecting publicKey in this Fedify version.
    const keyPairs = await loadOrCreateKeyPairs(identifier);
    console.log(`[federation] loaded ${keyPairs.length} keypair(s) for ${identifier}`);
    const rsaPair = keyPairs.find(
      (kp) => (kp.publicKey.algorithm as any)?.name === "RSASSA-PKCS1-v1_5"
    );
    const edPair = keyPairs.find(
      (kp) => (kp.publicKey.algorithm as any)?.name === "Ed25519"
    );
    const actorUri = ctx.getActorUri(identifier);
    const publicKey = rsaPair
      ? new CryptographicKey({
          id: new URL(`${actorUri.href}#main-key`),
          owner: actorUri,
          publicKey: rsaPair.publicKey,
        })
      : undefined;
    const assertionMethod = edPair
      ? [
          new Multikey({
            id: new URL(`${actorUri.href}#ed25519-key`),
            controller: actorUri,
            publicKey: edPair.publicKey,
          }),
        ]
      : undefined;

    const name =
      [user.first_name, user.last_name].filter(Boolean).join(" ") || "Patrick";
    const summary = stripHtml(user.site_description ?? "");

    // Strip HTML to plain text for the summary — Mastodon will re-wrap it.
    function stripHtml(s: string) {
      return s.replace(/<[^>]+>/g, "").trim();
    }

    return new Person({
      id: ctx.getActorUri(identifier),
      preferredUsername: identifier,
      name,
      summary,
      // Hosting both inbox/outbox on the pg.mccullo.ug domain.
      inbox: ctx.getInboxUri(identifier),
      outbox: ctx.getOutboxUri(identifier),
      followers: ctx.getFollowersUri(identifier),
      following: ctx.getFollowingUri(identifier),
      endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
      url: new URL(`https://${DOMAIN}/h`),
      icon: user.profile_image?.image
        ? new Image({ url: new URL(absoluteUrl(user.profile_image.image)) })
        : undefined,
      image: user.cover_image?.image
        ? new Image({ url: new URL(absoluteUrl(user.cover_image.image)) })
        : undefined,
      published: user.created ? new Date(user.created) : undefined,
      // Explicitly attach keys so they appear in the actor doc regardless
      // of whether setKeyPairsDispatcher auto-injection is working.
      publicKey,
      assertionMethods: assertionMethod,
    });
  })
  .setKeyPairsDispatcher(async (_ctx, identifier) => {
    console.log(`[federation] key dispatcher CALLED for identifier=${identifier}`);
    if (identifier !== PRIMARY_USERNAME) return [];
    try {
      const pairs = await loadOrCreateKeyPairs(identifier);
      console.log(`[federation] key dispatcher returning ${pairs.length} pair(s)`);
      return pairs;
    } catch (err) {
      console.error(`[federation] key dispatcher failed for ${identifier}:`, err);
      return [];
    }
  });

// Absolute-URL-ify the protocol-relative or root-relative paths we sometimes
// store for images.
function absoluteUrl(maybePath: string): string {
  if (/^https?:\/\//.test(maybePath)) return maybePath;
  if (maybePath.startsWith("/")) return `https://${DOMAIN}${maybePath}`;
  return `https://${DOMAIN}/${maybePath}`;
}

// ---------------------------------------------------------------------------
// Inbox handlers — A2: accept Follow / Undo Follow
// ---------------------------------------------------------------------------
//
// Fedify verifies HTTP signatures on incoming activities before invoking
// these handlers, so by the time we see a Follow we trust it's actually
// from the actor it claims to be from.

federation
  .setInboxListeners(`/users/{identifier}/inbox`, `/inbox`)
  .on(Follow, async (ctx, follow) => {
    console.log(`[federation] Follow received from ${follow.actorId?.href}`);

    // Defensive — the spec lets a Follow target any "object", we only accept
    // those targeting our actor.
    if (!follow.objectId || !follow.actorId) {
      console.warn(`[federation] Follow missing actor or object`);
      return;
    }
    // Validate that the target is one of our actors.
    const parsed = ctx.parseUri(follow.objectId);
    if (parsed?.type !== "actor" || parsed.identifier !== PRIMARY_USERNAME) {
      console.warn(
        `[federation] Follow targets ${follow.objectId.href}, not us — ignoring`
      );
      return;
    }

    // Look up the follower's actor doc to get their inbox URL.
    const follower = await follow.getActor(ctx);
    if (follower == null) {
      console.warn(`[federation] could not dereference follower actor`);
      return;
    }
    const inboxUri = follower.inboxId?.href;
    if (!inboxUri) {
      console.warn(`[federation] follower has no inbox`);
      return;
    }

    await recordFollower({
      handle: PRIMARY_USERNAME,
      actorUri: follow.actorId.href,
      inboxUri,
      sharedInboxUri: follower.endpoints?.sharedInbox?.href,
      followedAt: Date.now(),
    });

    // Send the Accept back. Fedify signs it with our key automatically.
    await ctx.sendActivity(
      { identifier: PRIMARY_USERNAME },
      follower,
      new Accept({ actor: follow.objectId, object: follow })
    );

    console.log(
      `[federation] accepted Follow from ${follow.actorId.href}, total followers: ${await countFollowers(
        PRIMARY_USERNAME
      )}`
    );
  })
  .on(Undo, async (ctx, undo) => {
    // Only Undo's that wrap a Follow targeting us are interesting.
    const inner = await undo.getObject(ctx);
    if (!(inner instanceof Follow)) return;
    if (!inner.objectId || !undo.actorId) return;

    const parsed = ctx.parseUri(inner.objectId);
    if (parsed?.type !== "actor" || parsed.identifier !== PRIMARY_USERNAME) {
      return;
    }
    await removeFollower(PRIMARY_USERNAME, undo.actorId.href);
    console.log(`[federation] removed follower ${undo.actorId.href}`);
  })
  // --- B1: responses to follows WE initiated ---
  .on(Accept, async (ctx, accept) => {
    // We only care about Accept(Follow) — confirmation a remote actor
    // accepted a Follow we sent.
    const inner = await accept.getObject(ctx);
    if (!(inner instanceof Follow)) return;
    if (!accept.actorId) return;
    await markAcceptedByActor(PRIMARY_USERNAME, accept.actorId.href);
    console.log(`[federation] Follow accepted by ${accept.actorId.href}`);
  })
  .on(Reject, async (ctx, reject) => {
    const inner = await reject.getObject(ctx);
    if (!(inner instanceof Follow)) return;
    if (!reject.actorId) return;
    await markRejectedByActor(PRIMARY_USERNAME, reject.actorId.href);
    console.log(`[federation] Follow rejected by ${reject.actorId.href}`);
  })
  // --- B2: posts arriving from accounts we follow ---
  .on(Create, async (ctx, create) => {
    const inner = await create.getObject(ctx);
    if (!(inner instanceof Note)) return;
    if (!inner.id || !create.actorId) return;

    // Cache the author so we can render their name/avatar later.
    const author = await create.getActor(ctx);
    if (author) {
      await cacheRemoteActor({
        actorUri: create.actorId.href,
        handle: author.preferredUsername?.toString() ?? undefined,
        fqHandle: author.preferredUsername
          ? `@${author.preferredUsername}@${new URL(create.actorId.href).host}`
          : undefined,
        displayName: author.name?.toString() ?? undefined,
        avatarUrl: author.iconId?.href,
        profileUrl: author.url instanceof URL ? author.url.href : undefined,
        updatedAt: Date.now(),
      });
    }

    const published = inner.published
      ? Number(inner.published.epochMilliseconds)
      : Date.now();
    const url = inner.url instanceof URL ? inner.url.href : undefined;

    const attachments: InboxPost["attachments"] = [];
    for await (const a of inner.getAttachments(ctx)) {
      const u = (a as any).url;
      const url = u instanceof URL ? u.href : typeof u === "string" ? u : null;
      if (!url) continue;
      const mediaType = (a as any).mediaType?.toString();
      let type: "Image" | "Video" | "Audio" | "Document" = "Document";
      const t = (a as any).constructor?.name;
      if (t === "Image" || mediaType?.startsWith("image/")) type = "Image";
      else if (t === "Video" || mediaType?.startsWith("video/")) type = "Video";
      else if (t === "Audio" || mediaType?.startsWith("audio/")) type = "Audio";
      attachments.push({ type, url, mediaType });
    }

    await storeInboxPost({
      noteUri: inner.id.href,
      authorActorUri: create.actorId.href,
      content: inner.content?.toString() ?? "",
      url,
      published,
      receivedAt: Date.now(),
      attachments: attachments.length ? attachments : undefined,
    });

    console.log(
      `[federation] stored incoming Note ${inner.id.href} from ${create.actorId.href}`
    );
  })
  .on(Update, async (ctx, update) => {
    const inner = await update.getObject(ctx);
    if (!(inner instanceof Note) || !inner.id) return;
    const patch: Partial<InboxPost> = {
      content: inner.content?.toString() ?? "",
    };
    if (inner.url instanceof URL) patch.url = inner.url.href;
    await updateInboxPost(inner.id.href, patch);
  })
  .on(Delete, async (_ctx, del) => {
    // Delete activities carry the tombstoned object's id in `objectId`.
    if (!del.objectId) return;
    await softDeleteInboxPost(del.objectId.href);
  })
  .on(Announce, async (ctx, announce) => {
    // Boost — the inner object is a Note already published elsewhere. We
    // store it as if it were a post from the announcer, but flag who
    // boosted it so the UI can show "Patrick boosted ..."
    const inner = await announce.getObject(ctx);
    if (!(inner instanceof Note) || !inner.id || !announce.actorId) return;
    const published = inner.published
      ? Number(inner.published.epochMilliseconds)
      : Date.now();
    await storeInboxPost({
      noteUri: inner.id.href,
      authorActorUri: inner.attributionId?.href ?? announce.actorId.href,
      content: inner.content?.toString() ?? "",
      url: inner.url instanceof URL ? inner.url.href : undefined,
      published,
      receivedAt: Date.now(),
      announcedBy: announce.actorId.href,
    });
  });

// ---------------------------------------------------------------------------
// Note object dispatcher — resolves /users/{identifier}/posts/{id}
// ---------------------------------------------------------------------------

federation.setObjectDispatcher(
  Note,
  `/users/{identifier}/posts/{id}`,
  async (ctx, { identifier, id }) => {
    if (identifier !== PRIMARY_USERNAME) return null;
    const post = await findPublicPostById(id);
    if (!post) return null;
    return postToNote(post, ctx);
  }
);

// ---------------------------------------------------------------------------
// Outbox dispatcher — A3: live listing of public posts as Create activities
// ---------------------------------------------------------------------------

federation
  .setOutboxDispatcher(
    `/users/{identifier}/outbox`,
    async (ctx, identifier, cursor) => {
      if (identifier !== PRIMARY_USERNAME) return null;
      const beforeCreated = cursor ? Number(cursor) : undefined;
      const { items, nextCursor } = await listPublicPosts({
        limit: 20,
        beforeCreated: Number.isFinite(beforeCreated)
          ? beforeCreated
          : undefined,
      });
      return {
        items: items.map((post) => postToCreate(post, ctx)),
        nextCursor: nextCursor != null ? String(nextCursor) : null,
      };
    }
  )
  .setCounter(async (_ctx, identifier) => {
    if (identifier !== PRIMARY_USERNAME) return null;
    return await countPublicPosts();
  });

// ---------------------------------------------------------------------------
// Followers dispatcher — A2: live from Mongo
// ---------------------------------------------------------------------------

federation
  .setFollowersDispatcher(
    `/users/{identifier}/followers`,
    async (_ctx, identifier, cursor) => {
      if (identifier !== PRIMARY_USERNAME) return null;
      const cursorMs = cursor ? Number(cursor) : undefined;
      const { items, nextCursorMs } = await listFollowers(identifier, {
        limit: 50,
        cursorMs: Number.isFinite(cursorMs) ? cursorMs : undefined,
      });
      return {
        items: items.map((f) => ({
          id: new URL(f.actorUri),
          inboxId: new URL(f.inboxUri),
          endpoints: f.sharedInboxUri
            ? { sharedInbox: new URL(f.sharedInboxUri) }
            : null,
        })),
        nextCursor: nextCursorMs != null ? String(nextCursorMs) : null,
      };
    }
  )
  .setCounter(async (_ctx, identifier) => {
    if (identifier !== PRIMARY_USERNAME) return null;
    return await countFollowers(identifier);
  });

// Following collection — live from Mongo, only accepted follows count.
federation
  .setFollowingDispatcher(
    `/users/{identifier}/following`,
    async (_ctx, identifier, cursor) => {
      if (identifier !== PRIMARY_USERNAME) return null;
      const cursorMs = cursor ? Number(cursor) : undefined;
      const { items, nextCursorMs } = await listFollowing(identifier, {
        limit: 50,
        cursorMs: Number.isFinite(cursorMs) ? cursorMs : undefined,
        status: "accepted",
      });
      return {
        items: items.map((f) => new URL(f.actorUri)),
        nextCursor: nextCursorMs != null ? String(nextCursorMs) : null,
      };
    }
  )
  .setCounter(async (_ctx, identifier) => {
    if (identifier !== PRIMARY_USERNAME) return null;
    return await countFollowing(identifier);
  });

// ---------------------------------------------------------------------------
// NodeInfo — tells crawlers what software we run.
// ---------------------------------------------------------------------------

federation.setNodeInfoDispatcher("/nodeinfo/2.1", async (_ctx) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const postCount = await db
    .collection("myPosts")
    .countDocuments({ privacy: "Public" });

  return {
    software: {
      name: "pgm",
      version: { major: 0, minor: 1, patch: 0 },
      repository: new URL("https://github.com/pgmccullough/pg.mccullo.ug-h-remix"),
    },
    protocols: ["activitypub"],
    services: { inbound: [], outbound: [] },
    openRegistrations: false,
    usage: {
      users: { total: 1, activeMonth: 1, activeHalfyear: 1 },
      localPosts: postCount,
    },
  };
});
