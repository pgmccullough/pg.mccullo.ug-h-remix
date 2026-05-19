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
