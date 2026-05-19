import type { LoaderFunctionArgs } from "react-router";
import {
  callbackUrl,
  completeOAuthFlow,
  readStateCookie,
  badRequest,
} from "~/utils/oauth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return badRequest("GitHub OAuth env vars are not set.");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return badRequest(`GitHub rejected: ${oauthError}`);
  if (!code || !returnedState) return badRequest("Missing code/state.");

  const { provider, state, session } = await readStateCookie(request);
  if (provider !== "github" || !state || state !== returnedState) {
    return badRequest("State mismatch.");
  }

  // Exchange code for access token.
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl(request, "github"),
      }),
    }
  );
  if (!tokenRes.ok) {
    console.error(
      "[oauth/github] token exchange failed:",
      tokenRes.status,
      await tokenRes.text()
    );
    return badRequest("GitHub token exchange failed.");
  }
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenData.access_token) {
    return badRequest(`GitHub token error: ${tokenData.error ?? "unknown"}`);
  }

  // Fetch user profile.
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "pg.mccullo.ug",
    },
  });
  if (!userRes.ok) {
    return badRequest("Couldn't fetch GitHub user.");
  }
  const profile = (await userRes.json()) as {
    id: number;
    login: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string;
  };

  // GitHub omits email from /user if the user has it set to private.
  // /user/emails returns all their addresses with primary/verified flags.
  let email = profile.email ?? undefined;
  if (!email) {
    try {
      const emailRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "pg.mccullo.ug",
        },
      });
      if (emailRes.ok) {
        const emails = (await emailRes.json()) as Array<{
          email: string;
          primary?: boolean;
          verified?: boolean;
        }>;
        email =
          emails.find((e) => e.primary && e.verified)?.email ||
          emails.find((e) => e.verified)?.email ||
          emails[0]?.email;
      }
    } catch {
      /* no-op — email isn't strictly required */
    }
  }

  return completeOAuthFlow(
    {
      provider: "github",
      externalId: String(profile.id),
      email,
      displayName: profile.name ?? profile.login,
      username: profile.login,
      avatarUrl: profile.avatar_url,
    },
    session,
    "/h"
  );
};
