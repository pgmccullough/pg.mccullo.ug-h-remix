import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  let profileImgRes = null;
  const user = await getUser(request);
  if(user?.role==="administrator") {
    const profileImg = await request.formData();
    const client = await clientPromise;
    const db = client.db("user_posts");
    const profileImgData:{
      gps: any,
      image: string,
      siteData: any
    } = {
      gps: profileImg.get("gps"),
      image: profileImg.get("image")!.toString(),
      siteData: profileImg.get("siteData")
    };
    let parsedGPSData = JSON.parse(profileImgData.gps);
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
    let parsedSiteData = JSON.parse(profileImgData.siteData);
    let updatedPast = parsedSiteData.past_profile_images;
    updatedPast.push(parsedSiteData.profile_image);
    parsedSiteData.profile_image = {
      "gps":gpsObj,
      "timestamp": Date.now(),
      "image": profileImgData.image
    };
    delete parsedSiteData._id;
    const updates = {
      $set: {...parsedSiteData}
    }
    try {
      profileImgRes = await db.collection('myUsers').updateOne({ user_name : "PGMcCullough" },updates);
    } catch (err) {
      profileImgRes = err;
    }
  }
  return { profileImgRes };
}