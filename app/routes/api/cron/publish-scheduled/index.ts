/**
 * Vercel Cron target: publish any scheduled posts whose scheduledFor
 * has passed. Configured in vercel.json under crons.
 *
 * Vercel authenticates cron requests by including a `CRON_SECRET` env
 * var in the Authorization header. We verify it here; requests missing
 * or mismatching the secret are rejected with 401.
 *
 * For each due post we POST to /api/post/publish/:postId with the
 * internal token, so the same publish pipeline (federation + Bluesky
 * cross-post) runs regardless of whether the user or the cron triggers it.
 */

import type { LoaderFunctionArgs } from "react-router";
import { clientPromise } from "~/lib/mongodb";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Vercel sends "Authorization: Bearer <CRON_SECRET>".
  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db("user_posts");
  const nowSeconds = Math.floor(Date.now() / 1000);

  const due = await db
    .collection("myPosts")
    .find({
      state: "scheduled",
      scheduledFor: { $lte: nowSeconds },
    })
    .limit(20) // bounded so a runaway backlog can't blow the function
    .toArray();

  if (due.length === 0) {
    return Response.json({ ok: true, published: 0 });
  }

  const origin = new URL(request.url).origin;
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) {
    console.error("[cron] INTERNAL_API_TOKEN missing — can't publish scheduled posts");
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Fire the publish endpoint for each. Kept sequential so one failure
  // doesn't cascade; on a small site the batch is tiny.
  const results: Array<{ postId: string; ok: boolean; error?: string }> = [];
  for (const post of due) {
    const postId = post._id.toString();
    try {
      const res = await fetch(`${origin}/api/post/publish/${postId}`, {
        method: "POST",
        headers: { "X-Internal-Token": internalToken },
      });
      const data: any = await res.json().catch(() => ({}));
      results.push({ postId, ok: res.ok, error: data?.error });
    } catch (err: any) {
      results.push({ postId, ok: false, error: err?.message ?? String(err) });
    }
  }

  return Response.json({ ok: true, published: results });
};
