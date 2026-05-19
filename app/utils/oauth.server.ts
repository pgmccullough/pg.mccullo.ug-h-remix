/**
 * Shared infrastructure for the three OAuth providers (Google, GitHub,
 * Mastodon). Each provider has its own routes for the initiate + callback
 * dance, but they all share:
 *
 *   - state generation (CSRF protection)
 *   - a "find existing or create new" helper for users
 *
 * State is stored in a separate cookie session from the main user session
 * so it can't interfere with anything else (and it doesn't need to survive
 * past the callback — we throw it away once verified).
 */

import { createCookieSessionStorage, redirect } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import { createUserSession } from "~/utils/session.server";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

// Separate, short-lived cookie used only for the OAuth in-flight state.
const stateStorage = createCookieSessionStorage({
  cookie: {
    name: "oauthState",
    secure: process.env.NODE_ENV === "production",
    secrets: [sessionSecret],
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes — plenty for a normal sign-in flow
    httpOnly: true,
  },
});

export type OAuthProvider = "google" | "github" | "mastodon";

export async function newStateCookie(
  provider: OAuthProvider,
  extra: Record<string, string> = {}
): Promise<{ state: string; cookie: string }> {
  const state = crypto.randomUUID();
  const session = await stateStorage.getSession();
  session.set("provider", provider);
  session.set("state", state);
  for (const [k, v] of Object.entries(extra)) session.set(k, v);
  return {
    state,
    cookie: await stateStorage.commitSession(session),
  };
}

export async function readStateCookie(request: Request): Promise<{
  provider?: OAuthProvider;
  state?: string;
  extras: Record<string, string>;
  session: any;
}> {
  const session = await stateStorage.getSession(request.headers.get("Cookie"));
  const provider = session.get("provider") as OAuthProvider | undefined;
  const state = session.get("state") as string | undefined;
  const extras: Record<string, string> = {};
  for (const k of (session as any).data
    ? Object.keys((session as any).data)
    : []) {
    if (k !== "provider" && k !== "state") extras[k] = session.get(k);
  }
  return { provider, state, extras, session };
}

export async function destroyStateCookie(session: any): Promise<string> {
  return await stateStorage.destroySession(session);
}

// ---------------------------------------------------------------------------
// User lookup / creation
// ---------------------------------------------------------------------------

export interface OAuthIdentity {
  provider: OAuthProvider;
  externalId: string;        // their stable user id at the provider
  email?: string;
  displayName?: string;
  username?: string;         // their handle/login at the provider
  avatarUrl?: string;
  // Mastodon-specific extras
  mastodonAcct?: string;     // fully-qualified handle like user@instance.tld
  mastodonInstance?: string; // hostname only
}

/**
 * Find an existing local user matching this OAuth identity (by external id
 * or by email), or create a fresh one. Returns the user's local id.
 *
 * Order of matching:
 *   1. external_ids[provider] === externalId  — same person, same provider
 *   2. email matches (case-insensitive)        — same person, different provider
 *   3. nothing — create new user
 */
export async function findOrCreateOAuthUser(
  identity: OAuthIdentity
): Promise<string> {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const col = db.collection("myUsers");

  const extKey = `external_ids.${identity.provider}`;
  const extValue =
    identity.provider === "mastodon"
      ? identity.mastodonAcct ?? identity.externalId
      : identity.externalId;

  // 1. Match by external id.
  let user = await col.findOne({ [extKey]: extValue });

  // 2. Match by email (only if email present and not already linked).
  if (!user && identity.email) {
    user = await col.findOne({
      email: { $regex: `^${escapeRegex(identity.email)}$`, $options: "i" },
    });
    if (user) {
      await col.updateOne(
        { _id: user._id },
        {
          $set: {
            [extKey]: extValue,
            ...(identity.avatarUrl
              ? { profile_image: { image: identity.avatarUrl } }
              : {}),
          },
          $addToSet: { auth_providers: identity.provider as any },
        }
      );
    }
  }

  // 3. Create a new user.
  if (!user) {
    const userName =
      (identity.username && (await uniqueUsername(col, identity.username))) ||
      (identity.email
        ? await uniqueUsername(col, identity.email.split("@")[0])
        : await uniqueUsername(col, `user_${Date.now()}`));

    const [first_name, ...rest] = (identity.displayName ?? userName).split(" ");
    const last_name = rest.join(" ");

    const result = await col.insertOne({
      user_name: userName,
      email: identity.email?.toLowerCase() ?? null,
      first_name,
      last_name,
      role: "user",
      created: Date.now(),
      auth_providers: [identity.provider],
      external_ids: { [identity.provider]: extValue },
      profile_image: identity.avatarUrl
        ? { image: identity.avatarUrl }
        : undefined,
      // Mastodon-specific metadata
      ...(identity.mastodonAcct
        ? { mastodon_acct: identity.mastodonAcct }
        : {}),
      ...(identity.mastodonInstance
        ? { mastodon_instance: identity.mastodonInstance }
        : {}),
    } as any);

    return result.insertedId.toString();
  }

  return user._id.toString();
}

async function uniqueUsername(col: any, base: string): Promise<string> {
  const sanitized = base.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 28) || "user";
  // Try the base; if taken, append -2, -3, etc.
  let candidate = sanitized;
  for (let i = 2; i < 100; i++) {
    const exists = await col.findOne({
      user_name: { $regex: `^${escapeRegex(candidate)}$`, $options: "i" },
    });
    if (!exists) return candidate;
    candidate = `${sanitized}-${i}`;
  }
  // Fallback — collision-resistant
  return `${sanitized}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Convenience: complete an OAuth flow by finding/creating the user and
// returning a redirect response with the session cookie set.
// ---------------------------------------------------------------------------

export async function completeOAuthFlow(
  identity: OAuthIdentity,
  oauthSession: any,
  redirectTo: string = "/h"
) {
  const userId = await findOrCreateOAuthUser(identity);
  // Build the session-setting redirect, then layer the state-cookie
  // destruction Set-Cookie on top of it.
  const response = await createUserSession(userId, redirectTo);
  const destroyHeader = await destroyStateCookie(oauthSession);
  response.headers.append("Set-Cookie", destroyHeader);
  return response;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function callbackUrl(
  request: Request,
  provider: OAuthProvider
): string {
  return `${new URL(request.url).origin}/api/auth/${provider}/callback`;
}

export function badRequest(message: string) {
  return new Response(message, { status: 400 });
}
