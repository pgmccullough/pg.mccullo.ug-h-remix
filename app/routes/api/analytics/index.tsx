import type { ActionFunctionArgs } from "react-router";

import { clientPromise, ObjectId } from "~/lib/mongodb";
import { getUser } from "~/utils/session.server";

/**
 * Visitor pinger backend. The client tells us what page they're on; we
 * resolve the IP + geo from the request itself and persist.
 *
 * Hardening from the original version:
 *   - admin's own visits don't record (no inflating your own numbers)
 *   - works correctly for anon visitors (original crashed on user[0])
 *   - IPStack key never crosses to the client
 *   - light per-visitor dedup so a refresh doesn't double-write
 *   - all crashes caught and logged so analytics failures don't 500
 *     the actual page
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const user = await getUser(request);
    // Don't track your own browsing.
    if (user?.role === "administrator") {
      return { msg: "admin-skipped" };
    }

    const form = await request.formData();
    const path = form.get("path")?.toString() ?? "/";
    const guestUUID = form.get("guestUUID")?.toString() ?? "";
    const userId = form.get("userId")?.toString() ?? "";
    const userName = form.get("userName")?.toString() ?? "";
    const referrer = form.get("referrer")?.toString() ?? "";

    // Resolve client IP from Vercel headers. `x-forwarded-for` is a comma-
    // separated chain; the first entry is the original client.
    const xff = request.headers.get("x-forwarded-for") ?? "";
    const ip = (xff.split(",")[0] || "").trim();
    if (!ip) {
      return { msg: "no-ip" };
    }

    // Geo lookup via IPStack (server-side now).
    let ipData: any = null;
    const apiKey = process.env.IPSTACK_APIKEY;
    if (apiKey) {
      try {
        const res = await fetch(
          `https://api.ipstack.com/${encodeURIComponent(ip)}?access_key=${apiKey}`
        );
        if (res.ok) ipData = await res.json();
      } catch (err) {
        console.error("[analytics] IPStack lookup failed:", err);
      }
    }

    const client = await clientPromise;
    const db = client.db("user_posts");
    const col = db.collection("myVisitors");

    // Try to find an existing visitor record. Identity precedence:
    //   1. signed-in userId  →  same person regardless of browser
    //   2. guestUUID         →  same browser, no account
    //   3. IP                →  fallback (least reliable, shared NATs)
    let existing: any = null;
    if (userId) {
      existing = await col.findOne({ "user.id": userId });
    }
    if (!existing && guestUUID) {
      existing = await col.findOne({ guestUUID });
    }
    if (!existing) {
      existing = await col.findOne({ ip });
    }

    const now = Date.now();
    const historyEntry = { path, referrer, timestamp: now };

    if (existing) {
      // Dedup: if last entry was the same path within the last 30s, skip.
      const lastEntry = existing.history?.[existing.history.length - 1];
      const isDupe =
        lastEntry?.path === path && now - (lastEntry.timestamp ?? 0) < 30_000;
      if (!isDupe) {
        await col.updateOne(
          { _id: new ObjectId(existing._id) },
          {
            $push: { history: historyEntry as any },
            $set: {
              lastSeen: now,
              ...(ipData ? { lastIpData: ipData } : {}),
              ...(userName ? { lastUserName: userName } : {}),
            },
            $addToSet: {
              ip,
              ...(guestUUID ? { guestUUID } : {}),
            } as any,
          }
        );
      }
    } else {
      await col.insertOne({
        firstSeen: now,
        lastSeen: now,
        ip: [ip],
        ipData: ipData ? [ipData] : [],
        lastIpData: ipData ?? null,
        guestUUID: guestUUID ? [guestUUID] : [],
        user: userId ? [{ id: userId, user_name: userName }] : [],
        lastUserName: userName || null,
        history: [historyEntry],
      });
    }

    return { msg: "ok" };
  } catch (err) {
    console.error("[analytics] action failed:", err);
    return { msg: "error" };
  }
};
