/**
 * IndieAuth authorization endpoint — /api/indieauth/authorize
 *
 * GET: validates the client's authorization request, ensures the
 *      requester is logged in as admin (Patrick), renders a consent
 *      page describing which app is asking for what scopes.
 * POST: on approve, mints a signed authorization code and redirects
 *      back to the client. On deny, redirects with error=access_denied.
 *
 * Spec: https://indieauth.spec.indieweb.org/#authorization-request
 */

import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getUser } from "~/utils/session.server";
import { signCode, SITE_URL } from "~/utils/indieauth.server";

interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  me: string;
}

function requireParams(
  url: URL
): { ok: true; params: AuthorizeParams } | { ok: false; error: string } {
  const required = [
    "client_id",
    "redirect_uri",
    "response_type",
    "state",
    "code_challenge",
    "code_challenge_method",
    "me",
  ];
  const missing = required.filter((k) => !url.searchParams.get(k));
  if (missing.length) {
    return { ok: false, error: `Missing required parameters: ${missing.join(", ")}` };
  }
  const response_type = url.searchParams.get("response_type")!;
  if (response_type !== "code") {
    return { ok: false, error: `Unsupported response_type: ${response_type}` };
  }
  const method = url.searchParams.get("code_challenge_method")!;
  if (method !== "S256") {
    return {
      ok: false,
      error: `Unsupported code_challenge_method: ${method} (only S256)`,
    };
  }
  const meRaw = url.searchParams.get("me")!;
  let me: URL;
  try {
    me = new URL(meRaw);
  } catch {
    return { ok: false, error: "Invalid me URL" };
  }
  if (me.hostname !== "pg.mccullo.ug") {
    return {
      ok: false,
      error: `Not the identity server for ${meRaw}`,
    };
  }
  return {
    ok: true,
    params: {
      client_id: url.searchParams.get("client_id")!,
      redirect_uri: url.searchParams.get("redirect_uri")!,
      response_type,
      scope: url.searchParams.get("scope") ?? "",
      state: url.searchParams.get("state")!,
      code_challenge: url.searchParams.get("code_challenge")!,
      code_challenge_method: method,
      me: meRaw,
    },
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const check = requireParams(url);
  if (!check.ok) {
    throw new Response(check.error, { status: 400 });
  }

  const user = await getUser(request);
  if (!user || user.role !== "administrator") {
    // Bounce through login and back. SignInModal currently doesn't
    // read a returnTo, but arriving on /h/login gets Patrick oriented
    // — after login he can hit the same client-provided authorize
    // URL from the client to retry.
    return redirect(`/h/login`);
  }

  return { params: check.params };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (!user || user.role !== "administrator") {
    throw new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const decision = form.get("decision")?.toString();
  const client_id = form.get("client_id")?.toString() ?? "";
  const redirect_uri = form.get("redirect_uri")?.toString() ?? "";
  const scope = form.get("scope")?.toString() ?? "";
  const state = form.get("state")?.toString() ?? "";
  const code_challenge = form.get("code_challenge")?.toString() ?? "";
  const code_challenge_method =
    form.get("code_challenge_method")?.toString() ?? "S256";
  const me = form.get("me")?.toString() ?? SITE_URL;

  if (!redirect_uri) {
    throw new Response("Missing redirect_uri", { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(redirect_uri);
  } catch {
    throw new Response("Invalid redirect_uri", { status: 400 });
  }

  if (decision !== "approve") {
    target.searchParams.set("error", "access_denied");
    target.searchParams.set("state", state);
    return redirect(target.toString());
  }

  const code = signCode({
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    scope,
    me,
  });

  target.searchParams.set("code", code);
  target.searchParams.set("state", state);
  // iss param (RFC 9207 / IndieAuth §5.1) lets the client confirm
  // which authorization server issued the code — defense against
  // mix-up attacks.
  target.searchParams.set("iss", SITE_URL);
  return redirect(target.toString());
};

export default function AuthorizePage() {
  const { params } = useLoaderData<typeof loader>();
  const scopes = params.scope.split(" ").filter(Boolean);
  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Authorize application</h1>
      <p style={{ lineHeight: 1.5 }}>
        <a href={params.client_id} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
          <code>{params.client_id}</code>
        </a>{" "}
        wants to access your site as{" "}
        <a href={params.me} style={{ wordBreak: "break-all" }}>
          <code>{params.me}</code>
        </a>
        .
      </p>
      {scopes.length ? (
        <>
          <p style={{ marginTop: 16, marginBottom: 4 }}>Requested permissions:</p>
          <ul style={{ marginTop: 4 }}>
            {scopes.map((s) => (
              <li key={s}>
                <code>{s}</code>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ marginTop: 16 }}>
          <em>Identity only — no post-related permissions requested.</em>
        </p>
      )}
      <form method="post" style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <input type="hidden" name="client_id" value={params.client_id} />
        <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
        <input type="hidden" name="scope" value={params.scope} />
        <input type="hidden" name="state" value={params.state} />
        <input type="hidden" name="code_challenge" value={params.code_challenge} />
        <input
          type="hidden"
          name="code_challenge_method"
          value={params.code_challenge_method}
        />
        <input type="hidden" name="me" value={params.me} />
        <button
          name="decision"
          value="approve"
          style={{
            padding: "8px 20px",
            background: "#4A6CBA",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          Approve
        </button>
        <button
          name="decision"
          value="deny"
          style={{
            padding: "8px 20px",
            background: "#eee",
            color: "#333",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          Deny
        </button>
      </form>
      <p style={{ marginTop: 20, fontSize: 12, color: "#888" }}>
        Approving grants this app a bearer token for its requested
        scope. You can revoke access later by deleting the token from
        the <code>micropub_tokens</code> collection.
      </p>
    </div>
  );
}
