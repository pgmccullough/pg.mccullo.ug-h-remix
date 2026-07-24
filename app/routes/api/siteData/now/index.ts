/**
 * /api/siteData/now — persist the /h/now page content.
 *
 * Content is stored on the PGMcCullough user doc under `now_page`:
 *   { content: string (HTML), updated: number (unix seconds) }
 *
 * Admin-only. Matches the pattern of /api/siteData/bio (a single
 * field on the admin user's doc, no dedicated collection needed).
 */

import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return { ok: false, error: "unauthorized" };
  }
  const form = await request.formData();
  const content = form.get("nowContent")?.toString() ?? "";
  if (!content.trim()) {
    return { ok: false, error: "empty content" };
  }
  const client = await clientPromise;
  const db = client.db("user_posts");
  try {
    await db.collection("myUsers").updateOne(
      { user_name: "PGMcCullough" },
      {
        $set: {
          now_page: {
            content,
            updated: Math.floor(Date.now() / 1000),
          },
        },
      }
    );
    return { ok: true };
  } catch (err) {
    console.error("[/api/siteData/now] update failed:", err);
    return { ok: false, error: "db error" };
  }
};
