/**
 * /api/webmention — inbound webmention endpoint (W3C spec).
 *
 * External sites POST `source` (their URL) and `target` (our URL)
 * to say "I linked to you". We:
 *   1. Validate the URLs.
 *   2. Confirm the target is on our origin.
 *   3. Respond 202 Accepted immediately.
 *   4. Fire-and-forget: fetch the source, confirm it links to the
 *      target, parse metadata, and store in `webmentions` Mongo.
 *
 * The webmentions collection is displayed alongside comments on the
 * corresponding post page. Duplicate (source, target) pairs upsert
 * so a Bridgy re-broadcast doesn't create dupes.
 */

import type { ActionFunctionArgs } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import {
  parseSourceMeta,
  verifyWebmention,
  type WebmentionSourceMeta,
} from "~/utils/webmention.server";

const SITE_HOSTS = new Set<string>([
  "pg.mccullo.ug",
  "pg-mccullo-ug-h-remix.vercel.app", // preview + prod on vercel domain
]);

interface StoredWebmention {
  source: string;
  target: string;
  targetPostId?: string;
  receivedAt: number;
  verifiedAt?: number;
  status: "queued" | "verified" | "rejected";
  reason?: string;
  meta?: WebmentionSourceMeta;
}

function targetPostId(target: string): string | undefined {
  // Match /h/post/:id or /h/post/:id/:slug
  try {
    const u = new URL(target);
    const m = /^\/h\/post\/([a-f0-9]{24})(?:\/|$)/i.exec(u.pathname);
    return m ? m[1] : undefined;
  } catch {
    return undefined;
  }
}

async function collection() {
  const client = await clientPromise;
  return client.db("user_posts").collection<StoredWebmention>("webmentions");
}

async function verifyInBackground(source: string, target: string): Promise<void> {
  const col = await collection();
  const now = Date.now();
  const outcome = await verifyWebmention({ source, target });
  if (!outcome.ok) {
    await col.updateOne(
      { source, target },
      {
        $set: {
          status: "rejected",
          reason: outcome.reason,
          verifiedAt: now,
        },
      }
    );
    return;
  }
  const meta = parseSourceMeta(outcome.html, target);
  await col.updateOne(
    { source, target },
    {
      $set: {
        status: "verified",
        verifiedAt: now,
        meta,
      },
    }
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405 });
  }

  let source = "";
  let target = "";
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (/application\/json/i.test(contentType)) {
      const body: any = await request.json();
      source = String(body?.source ?? "").trim();
      target = String(body?.target ?? "").trim();
    } else {
      const form = await request.formData();
      source = form.get("source")?.toString().trim() ?? "";
      target = form.get("target")?.toString().trim() ?? "";
    }
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!source || !target) {
    return Response.json(
      { error: "source and target are required" },
      { status: 400 }
    );
  }
  if (!/^https?:\/\//i.test(source) || !/^https?:\/\//i.test(target)) {
    return Response.json(
      { error: "source and target must be absolute URLs" },
      { status: 400 }
    );
  }
  if (source === target) {
    return Response.json({ error: "source and target must differ" }, { status: 400 });
  }
  let targetHost = "";
  try { targetHost = new URL(target).host; } catch { /* fallthrough */ }
  if (!targetHost || !SITE_HOSTS.has(targetHost)) {
    return Response.json(
      { error: "target is not on this site" },
      { status: 400 }
    );
  }

  const now = Date.now();
  const col = await collection();
  await col.updateOne(
    { source, target },
    {
      $set: {
        source,
        target,
        targetPostId: targetPostId(target),
        status: "queued",
      },
      $setOnInsert: { receivedAt: now },
    },
    { upsert: true }
  );

  // Kick off verification asynchronously — respond 202 immediately.
  void verifyInBackground(source, target).catch((err) => {
    console.error("[webmention] verify failed:", err);
  });

  return new Response(
    JSON.stringify({ status: "accepted" }),
    {
      status: 202,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Advertise self for discovery too.
        Link: '</api/webmention>; rel="webmention"',
      },
    }
  );
};

// GET handler for testing / friendly landing page.
export const loader = () => {
  return new Response(
    "This is the webmention endpoint for pg.mccullo.ug. POST source + target to send a webmention.",
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Link: '</api/webmention>; rel="webmention"',
      },
    }
  );
};
