import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const searchQuery = (await request.formData()).get("searchQuery")?.toString();
  try{
    db.collection("myPosts").createIndex( { "content": "text" } );
    if(user?.role!=="administrator") {
      let searchResults = await db.collection("myPosts").find( { $text: { $search: searchQuery}, privacy : "Public" } ).toArray();
      return { searchResults };
    }
    let searchResults = await db.collection("myPosts").find( { $text: { $search: searchQuery} } ).toArray();
    return { searchResults };
  } catch (err) {
    return { searchResults: [] }
  }
}