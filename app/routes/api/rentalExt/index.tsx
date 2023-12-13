import { json, type ActionArgs } from "@remix-run/node";
import { ObjectId } from "~/lib/mongodb";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
    const [ ...properties ] = await request.json();
    if(!properties.length) return {err: "Error: No properties received."};
    const yearNow = new Date().getFullYear();
    const monthNow = (new Date().getMonth() + 1).toString().padStart(2,"0");
    const dateNow = (new Date().getDate()).toString().padStart(2,"0");
    const formattedDate = `${dateNow}-${monthNow}-${yearNow}`;
    const client = await clientPromise;
    const db = client.db("user_posts");
    const storedProperties = await db.collection("myProperties").find().toArray();
    for(const storedProperty of storedProperties) {
      // checking for expired in DB
      const existingProperty = properties.find((liveProperty: any) => liveProperty.id === storedProperty.propId);
      if(!existingProperty) {
        await db.collection('myProperties').deleteOne({ _id : new ObjectId(storedProperty._id)});
      }
    }
    for(const liveProperty of properties) {
      // checking for new properties not in DB
      const existingProperty = storedProperties.find((storedProperty: any) => liveProperty.propId === storedProperty._id);
      if(!existingProperty) {
        await db.collection('myProperties').insertOne({...liveProperty, firstFetch: formattedDate});
      }
    }

    return json(
      { storedProperties },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
}