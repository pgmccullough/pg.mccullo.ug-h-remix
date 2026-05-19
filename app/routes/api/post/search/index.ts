import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";
import { serializeDocs } from "~/utils/serialize.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const searchQuery = (await request.formData()).get("searchQuery")?.toString();
  try{
    db.collection("myPosts").createIndex( { "content": "text" } );
    if(user?.role!=="administrator") {
      let searchResults = await db.collection("myPosts").find( { $text: { $search: searchQuery}, privacy : "Public" } ).toArray();
      return { searchResults: serializeDocs(searchResults) };
    }
    let searchResults = await db.collection("myPosts").find( { $text: { $search: searchQuery} } ).toArray();
    return { searchResults: serializeDocs(searchResults) };
  } catch (err) {
    return { searchResults: [] }
  }
}