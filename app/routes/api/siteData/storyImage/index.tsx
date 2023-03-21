import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

const storyImgData:any = {};

export const action = async ({ request }: ActionArgs) => {
  let storyImgRes = null;
  const user = await getUser(request);
  if(user?.role==="administrator") {
    const storyImg = await request.formData();
    const client = await clientPromise;
    const db = client.db("user_posts");
    for (const pair of storyImg.entries()) {
      storyImgData[pair[0]] = pair[1];
    }
    let parsedSiteData = JSON.parse(storyImgData.siteData);
    let updatedPast = parsedSiteData.past_cover_images;
    updatedPast.push(parsedSiteData.cover_image);
    parsedSiteData.cover_image = {
      "gps":{"lat": "pending", "long": "pending", "string": "pending"},
      "timestamp": Date.now(),
      "image": storyImgData.image
    };
    delete parsedSiteData._id;
    const updates = {
      $set: {...parsedSiteData}
    }
    try {
      storyImgRes = await db.collection('myUsers').updateOne({ user_name : "PGMcCullough" },updates);
    } catch (err) {
      storyImgRes = err;
    }
  }
  return { storyImgRes };
}