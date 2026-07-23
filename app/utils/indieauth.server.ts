/**
 * IndieAuth helpers — authorization-code signing (compact HMAC JWT),
 * PKCE verification, access-token issuance + lookup.
 *
 * We're a single-user site, so this is a minimal IndieAuth server:
 * the only identity being authorized is Patrick himself. Everyone
 * else gets redirected to login. Codes are stateless (signed) so
 * we don't need a Mongo TTL index; access tokens are persisted for
 * revocation.
 *
 * Spec: https://indieauth.spec.indieweb.org/
 * PKCE: RFC 7636 §4.6 (S256 method).
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { clientPromise } from "~/lib/mongodb";

const SIGNING_SECRET = process.env.INTERNAL_API_TOKEN ?? "";
const CODE_TTL_SECONDS = 60;
const TOKEN_BYTES = 32;
const TOKEN_COLLECTION = "micropub_tokens";

export const SITE_URL = "https://pg.mccullo.ug";

export interface CodePayload {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  me: string;
  iat: number;
  exp: number;
}

// ---------------------------------------------------------------------------
// base64url encoding (RFC 7515 §2)
// ---------------------------------------------------------------------------

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(s: string): Buffer {
  const pad = "===".slice((s.length + 3) % 4);
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(padded, "base64");
}

// ---------------------------------------------------------------------------
// Authorization code: signed as `body.sig` where body is base64url(JSON)
// and sig is base64url(hmac-sha256(body, SIGNING_SECRET)). Not a real
// JWT — no alg header, one algorithm supported. Small on the wire.
// ---------------------------------------------------------------------------

export function signCode(
  payload: Omit<CodePayload, "iat" | "exp">
): string {
  if (!SIGNING_SECRET) {
    throw new Error("INTERNAL_API_TOKEN must be set to sign IndieAuth codes");
  }
  const now = Math.floor(Date.now() / 1000);
  const full: CodePayload = {
    ...payload,
    iat: now,
    exp: now + CODE_TTL_SECONDS,
  };
  const body = base64url(Buffer.from(JSON.stringify(full)));
  const sig = base64url(
    createHmac("sha256", SIGNING_SECRET).update(body).digest()
  );
  return `${body}.${sig}`;
}

/**
 * Verify a code's HMAC signature (timing-safe) and expiration. Returns
 * the decoded payload on success, null on any failure. Note: the code
 * is single-use in practice — callers should reject a second exchange,
 * but with 60s TTL and PKCE binding, replay is already narrow.
 */
export function verifyCode(code: string): CodePayload | null {
  if (!SIGNING_SECRET) return null;
  const parts = code.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = base64url(
    createHmac("sha256", SIGNING_SECRET).update(body).digest()
  );
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  let payload: CodePayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString("utf-8"));
  } catch {
    return null;
  }
  if (typeof payload?.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ---------------------------------------------------------------------------
// PKCE (RFC 7636). Only S256 is supported — the spec allows "plain"
// but modern IndieAuth clients must use S256, and we shouldn't accept
// weaker challenges anyway.
// ---------------------------------------------------------------------------

export function verifyPkce(
  verifier: string,
  challenge: string,
  method: string
): boolean {
  if (method !== "S256") return false;
  if (typeof verifier !== "string" || verifier.length < 43 || verifier.length > 128) {
    return false;
  }
  const hash = createHash("sha256").update(verifier).digest();
  const computed = base64url(hash);
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Access tokens: Mongo-persisted so we can revoke. One collection,
// indexed on `token`. Empty scope means "identity-only" and produces
// no stored token (per IndieAuth spec — only `me` is returned).
// ---------------------------------------------------------------------------

export interface MicropubToken {
  token: string;
  me: string;
  client_id: string;
  scope: string;
  created: number;
  lastUsed: number;
  revoked?: boolean;
}

export async function issueToken(args: {
  me: string;
  client_id: string;
  scope: string;
}): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const client = await clientPromise;
  const db = client.db("user_posts");
  const now = Math.floor(Date.now() / 1000);
  await db.collection(TOKEN_COLLECTION).insertOne({
    token,
    me: args.me,
    client_id: args.client_id,
    scope: args.scope,
    created: now,
    lastUsed: now,
  });
  return token;
}

/**
 * Look up a bearer token. Bumps `lastUsed` on hit so we can see
 * activity on the tokens dashboard later. Returns null if the token
 * doesn't exist or has been revoked.
 */
export async function getToken(token: string): Promise<MicropubToken | null> {
  if (!token) return null;
  const client = await clientPromise;
  const db = client.db("user_posts");
  const doc = await db.collection(TOKEN_COLLECTION).findOneAndUpdate(
    { token, revoked: { $ne: true } },
    { $set: { lastUsed: Math.floor(Date.now() / 1000) } },
    { returnDocument: "after" }
  );
  // Driver v6 returns the document directly (not wrapped in `.value`).
  return doc ? (doc as unknown as MicropubToken) : null;
}

export async function revokeToken(token: string): Promise<boolean> {
  if (!token) return false;
  const client = await clientPromise;
  const db = client.db("user_posts");
  const res = await db
    .collection(TOKEN_COLLECTION)
    .updateOne({ token }, { $set: { revoked: true } });
  return res.matchedCount > 0;
}

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

export function extractBearer(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  // Some Micropub clients send the token in the form body under
  // access_token= — legal per an older draft. Not read here (we'd
  // need to consume the body). Callers can pass it in explicitly.
  return null;
}

export function scopeIncludes(scope: string, needed: string): boolean {
  return scope.split(/\s+/).includes(needed);
}
