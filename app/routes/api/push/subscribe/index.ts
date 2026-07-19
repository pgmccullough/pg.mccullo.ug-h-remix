/**
 * Admin-only: store a Web Push subscription so the server can deliver
 * notifications to this browser/device later.
 *
 * The client posts the JSON PushSubscription object it got back from
 * `pushManager.subscribe(...)`. We persist { endpoint, keys } keyed by
 * endpoint (which is globally unique per browser + push service). Same
 * user re-subscribing from the same device is a no-op upsert.
 */

import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { saveSubscription } from "~/utils/web-push.server";

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
  const p256dh = payload?.keys?.p256dh;
  const auth = payload?.keys?.auth;
  if (!endpoint || typeof p256dh !== "string" || typeof auth !== "string") {
    return Response.json(
      { error: "Malformed subscription — endpoint, keys.p256dh, keys.auth required." },
      { status: 400 }
    );
  }

  await saveSubscription({
    endpoint,
    keys: { p256dh, auth },
    userId: user?.id ? String(user.id) : undefined,
  });

  return Response.json({ ok: true });
};
