/**
 * Admin-only: set / clear a manual label on a visitor doc.
 *
 * Label overrides the default "anon" / signed-in name display in
 * Recent Visitors and the visitor detail page. Sticks to that
 * visitor record forever — so a labeled "Mom" continues to appear
 * as "Mom" on every future visit that ties back to the same doc.
 *
 * Blank label removes the field entirely (visitor reverts to normal
 * anon / user_name display).
 */

import type { ActionFunctionArgs } from "react-router";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { getUser } from "~/utils/session.server";

const MAX_LABEL_LEN = 60;

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }

  const form = await request.formData();
  const visitorId = form.get("visitorId")?.toString().trim() ?? "";
  const rawLabel = form.get("label")?.toString() ?? "";
  if (!visitorId || !ObjectId.isValid(visitorId)) {
    return Response.json({ error: "Invalid visitorId" }, { status: 400 });
  }
  const label = rawLabel.trim().slice(0, MAX_LABEL_LEN);

  const client = await clientPromise;
  const db = client.db("user_posts");
  const col = db.collection("myVisitors");

  if (label.length === 0) {
    await col.updateOne(
      { _id: new ObjectId(visitorId) },
      { $unset: { manualLabel: "" } }
    );
    return Response.json({ ok: true, cleared: true });
  }

  await col.updateOne(
    { _id: new ObjectId(visitorId) },
    { $set: { manualLabel: label } }
  );
  return Response.json({ ok: true, label });
};
