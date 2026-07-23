/**
 * IndieAuth token endpoint — /api/indieauth/token
 *
 * Exchanges an authorization code + PKCE verifier for a bearer access
 * token. Follows OAuth 2.0 token endpoint conventions with the
 * IndieAuth-specific `me` field in the response.
 *
 * Spec: https://indieauth.spec.indieweb.org/#access-token
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  extractBearer,
  getToken,
  issueToken,
  verifyCode,
  verifyPkce,
} from "~/utils/indieauth.server";

function errorResponse(
  error: string,
  description: string,
  status = 400
): Response {
  return Response.json(
    { error, error_description: description },
    { status }
  );
}

/**
 * GET can be used to introspect a bearer token — some Micropub
 * clients ping it to check whether their stored token still works.
 * Not part of the strict IndieAuth spec anymore (introspection got
 * split out), but zero-cost to support.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const token = extractBearer(request);
  if (!token) return errorResponse("invalid_token", "Missing bearer token", 401);
  const record = await getToken(token);
  if (!record) return errorResponse("invalid_token", "Unknown or revoked token", 401);
  return Response.json({
    me: record.me,
    client_id: record.client_id,
    scope: record.scope,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctype = (request.headers.get("content-type") ?? "").toLowerCase();
  if (
    !ctype.includes("application/x-www-form-urlencoded") &&
    !ctype.includes("multipart/form-data")
  ) {
    return errorResponse(
      "invalid_request",
      "Content-Type must be application/x-www-form-urlencoded"
    );
  }

  const form = await request.formData();

  // Support token revocation on the same endpoint per IndieAuth
  // convention (action=revoke, token=<token>).
  const rawAction = form.get("action")?.toString();
  if (rawAction === "revoke") {
    const t = form.get("token")?.toString() ?? "";
    // Revoke is silent — always 200 to avoid leaking whether the
    // token existed (mirrors RFC 7009).
    const { revokeToken } = await import("~/utils/indieauth.server");
    await revokeToken(t);
    return Response.json({ ok: true });
  }

  const grant_type = form.get("grant_type")?.toString();
  if (grant_type !== "authorization_code") {
    return errorResponse(
      "unsupported_grant_type",
      `Unsupported grant_type: ${grant_type ?? "(none)"}`
    );
  }

  const code = form.get("code")?.toString() ?? "";
  const client_id = form.get("client_id")?.toString() ?? "";
  const redirect_uri = form.get("redirect_uri")?.toString() ?? "";
  const code_verifier = form.get("code_verifier")?.toString() ?? "";

  const payload = verifyCode(code);
  if (!payload) {
    return errorResponse("invalid_grant", "Bad or expired authorization code");
  }
  if (payload.client_id !== client_id) {
    return errorResponse(
      "invalid_grant",
      "client_id does not match authorization request"
    );
  }
  if (payload.redirect_uri !== redirect_uri) {
    return errorResponse(
      "invalid_grant",
      "redirect_uri does not match authorization request"
    );
  }
  if (
    !verifyPkce(code_verifier, payload.code_challenge, payload.code_challenge_method)
  ) {
    return errorResponse("invalid_grant", "PKCE verification failed");
  }

  // Empty-scope requests are identity-only — return `me` without
  // issuing a token, per IndieAuth §5.6.
  if (!payload.scope.trim()) {
    return Response.json({ me: payload.me });
  }

  const token = await issueToken({
    me: payload.me,
    client_id: payload.client_id,
    scope: payload.scope,
  });

  return Response.json({
    access_token: token,
    token_type: "Bearer",
    scope: payload.scope,
    me: payload.me,
  });
};
