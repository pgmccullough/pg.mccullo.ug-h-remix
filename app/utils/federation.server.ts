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
  exportJwk,
  importJwk,
  generateCryptoKeyPair,
} from "@fedify/fedify";

import { clientPromise } from "~/lib/mongodb";

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
// Key management — RSA keypair per actor, persisted in Mongo
// ---------------------------------------------------------------------------

interface StoredKey {
  handle: string;
  privateKey: object; // JWK
  publicKey: object;  // JWK
  created: number;
}

async function loadOrCreateKeyPair(handle: string) {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const col = db.collection<StoredKey>("federation_keys");

  const existing = await col.findOne({ handle });
  if (existing) {
    const privateKey = await importJwk(existing.privateKey as any, "private");
    const publicKey = await importJwk(existing.publicKey as any, "public");
    return [{ privateKey, publicKey }];
  }

  const { privateKey, publicKey } = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
  await col.insertOne({
    handle,
    privateKey: await exportJwk(privateKey),
    publicKey: await exportJwk(publicKey),
    created: Date.now(),
  });
  return [{ privateKey, publicKey }];
}

// ---------------------------------------------------------------------------
// Actor dispatcher: who is this user?
// ---------------------------------------------------------------------------

federation
  .setActorDispatcher(`/users/{identifier}`, async (ctx, identifier) => {
    if (identifier !== PRIMARY_USERNAME) return null;

    // Pull profile data from Mongo (siteData lives on the admin user record).
    const client = await clientPromise;
    const db = client.db("user_posts");
    const [user] = await db
      .collection("myUsers")
      .find({ user_name: "PGMcCullough" })
      .toArray();

    if (!user) return null;

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
    });
  })
  .setKeyPairsDispatcher(async (_ctx, identifier) => {
    if (identifier !== PRIMARY_USERNAME) return [];
    return loadOrCreateKeyPair(identifier);
  });

// Absolute-URL-ify the protocol-relative or root-relative paths we sometimes
// store for images.
function absoluteUrl(maybePath: string): string {
  if (/^https?:\/\//.test(maybePath)) return maybePath;
  if (maybePath.startsWith("/")) return `https://${DOMAIN}${maybePath}`;
  return `https://${DOMAIN}/${maybePath}`;
}

// ---------------------------------------------------------------------------
// Stubs for inbox / outbox / followers / following.
// Phase A1 only needs them to *exist* so the actor document is valid.
// Phase A2 will fill in inbox handling; A3 the outbox + delivery.
// ---------------------------------------------------------------------------

federation.setInboxListeners(`/users/{identifier}/inbox`, `/inbox`);

federation
  .setOutboxDispatcher(
    `/users/{identifier}/outbox`,
    async (_ctx, _identifier, _cursor) => ({ items: [] })
  );

federation
  .setFollowersDispatcher(
    `/users/{identifier}/followers`,
    async (_ctx, _identifier, _cursor) => ({ items: [] })
  );

federation
  .setFollowingDispatcher(
    `/users/{identifier}/following`,
    async (_ctx, _identifier, _cursor) => ({ items: [] })
  );

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
