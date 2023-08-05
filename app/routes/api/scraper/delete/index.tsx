import type { ActionArgs } from "@remix-run/node";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  if(user?.role==="administrator") {
    const idToDelete = (await request.formData()).get("idToDelete")?.toString();
    const client = await clientPromise;
    const db = client.db("user_posts");
    const delEntry = await db.collection('myWishList').deleteOne({_id : new ObjectId(idToDelete)});
    return { delEntry, deletedId: idToDelete }
  }
}