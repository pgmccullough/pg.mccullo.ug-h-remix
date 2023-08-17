import type { ActionArgs, LoaderArgs, LoaderFunction } from "@remix-run/node";
import { clientPromise, ObjectId } from "~/lib/mongodb";

const getFromId = async(userId: string) => {
  let userObj = null;
  const client = await clientPromise;
  const db = client.db("user_posts");
  try {
    [ userObj ] = await db.collection('myUsers').find({_id : new ObjectId(userId)}).toArray();
    return { userObj };
  } catch (err) {
    userObj = null;
    return { userObj: 'error' };
  }
}

export const loader: LoaderFunction = async({request}: LoaderArgs) => {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId');
  const fullUser: any = await getFromId(userId||"");
  const {cover_image, profile_image, site_description, site_name} = fullUser.userObj;
  return {cover_image, profile_image, site_description, site_name};
}

export const action = async ({ request }: ActionArgs) => {
  const userId = (await request.formData()).get("userId")?.toString();
  return await getFromId(userId||"");
}