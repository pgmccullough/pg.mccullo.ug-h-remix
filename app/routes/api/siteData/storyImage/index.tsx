import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  let storyImgRes = null;
  const user = await getUser(request);
  if(user?.role==="administrator") {
    const storyImg = await request.formData();
    const client = await clientPromise;
    const db = client.db("user_posts");
    const storyImgData:{
      gps: any,
      image: string,
      siteData: any
    } = {
      gps: storyImg.get("gps"),
      image: storyImg.get("image")!.toString(),
      siteData: storyImg.get("siteData")
    };
    let parsedGPSData = JSON.parse(storyImgData.gps);
    let gpsObj = null;
    if( parsedGPSData.latitude && parsedGPSData.longitude ) {
      const GPSString = await fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${parsedGPSData.latitude}&lon=${parsedGPSData.longitude}&apiKey=${process.env.GEOCODE_APIKEY}`)
      let rawGPSData:any = await GPSString.json();
      let niceLocName = [];
      if(rawGPSData.features[0].properties.suburb) niceLocName.push(rawGPSData.features[0].properties.suburb); // East Village
      if(rawGPSData.features[0].properties.district) niceLocName.push(rawGPSData.features[0].properties.district); //cochecton
      if(rawGPSData.features[0].properties.state) niceLocName.push(rawGPSData.features[0].properties.state); //new york
      let niceLocStr = niceLocName.join(", ");
      gpsObj = {"lat": parsedGPSData.latitude, "long": parsedGPSData.longitude, "string": niceLocStr};
    }
    let parsedSiteData = JSON.parse(storyImgData.siteData);
    let updatedPast = parsedSiteData.past_cover_images;
    updatedPast.push(parsedSiteData.cover_image);
    parsedSiteData.cover_image = {
      "gps":gpsObj,
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