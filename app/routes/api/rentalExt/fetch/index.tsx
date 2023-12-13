import type { ActionArgs } from "@remix-run/node";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  let rentalProperties;
  try {
    rentalProperties = await db.collection('myProperties').find().sort({created:-1}).toArray();
  } catch (err) {
    rentalProperties = null;
  }
}