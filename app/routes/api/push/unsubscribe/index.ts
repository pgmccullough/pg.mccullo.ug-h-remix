/**
 * Admin-only: remove a stored Web Push subscription.
 *
 * The client posts { endpoint }; we delete by endpoint. If the user
 * granted push permission through the browser but then revokes it or
 * clears storage, the server will also auto-prune when a send fails
 * with 404/410 — this endpoint is just the clean opt-out path.
 */

import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { removeSubscription } from "~/utils/web-push.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const endpoint = typeof payload?.endpoint === "string" ? payload.endpoint : "";
  if (!endpoint) {
    return Response.json({ error: "Missing endpoint." }, { status: 400 });
  }

  await removeSubscription(endpoint);
  return Response.json({ ok: true });
};
