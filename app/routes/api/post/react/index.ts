import type { ActionArgs } from "@remix-run/node";

// import { getUser } from "~/utils/session.server";
// eventually we want to go off logged-in users, but for now just using localStorage uuid
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  //const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const reactData = (await request.formData());
  const postId = reactData.get("postId")?.toString();
  const userId = reactData.get("userId")?.toString();
  const emoji = reactData.get("emoji")?.toString()||"";
  let updatedReactions;
  let postData;
  let cloneTS;
  try{
    postData = await db.collection("myPosts").find({ _id: new ObjectId(postId) }).toArray();
  } catch (err) {
    postData = null;
  }
  if(postData) {
    const oldReactData = postData&&postData[0]?.feedback?.likes;
    const cloneTS = {...oldReactData||{}};
    if(cloneTS[emoji]) {
      if(cloneTS[emoji].includes(userId)) {
        cloneTS[emoji] = cloneTS[emoji].filter((guest:string) => guest !== userId);
        if(!cloneTS[emoji].length) delete cloneTS[emoji];
      } else {
        cloneTS[emoji].push(userId);
        console.log("adding first of one");
      }
    } else {
      cloneTS[emoji] = [ userId ];
    }

    const updates = {
      $set: {feedback: {...postData[0].feedback, likes: cloneTS}}
    }
    try {
      updatedReactions = await db.collection('myPosts').updateOne({ _id: new ObjectId(postId) },updates);
    } catch (err) {
      updatedReactions = err;
    }
    return { cloneTS };
  }
}