import type { ActionArgs } from "@remix-run/node";
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  let scrapeRes;
  const tagSanitize = (tag: string) => {
    tag = tag.replaceAll('"','');
    if(tag.at(-1)==="/") tag = tag.substring(0,tag.length-1);
    tag = tag.replaceAll("&quot;",'"');
    return tag;
  }
  if(user?.role==="administrator") {
    const urlToScrape = (await request.formData()).get("url")?.toString();
    console.log("FETCHING ",urlToScrape);
    try {
      const res = await fetch(urlToScrape!);
      scrapeRes = await res.text();
    } catch(err) {
      console.log(err);
      scrapeRes = err;
    }
    let ogTags: {[key: string]: string} = {url: urlToScrape!};
    scrapeRes = scrapeRes?.toString().split("</head>")[0];
    scrapeRes = scrapeRes?.split('<meta ');
    scrapeRes?.forEach(tag => {
      let tagArrTest = tag.split('="');
      let content: string | string[];
      let property: string | string[];
      console.log(tag);
      if(!tagArrTest[1]) {
        content = tag?.split("content='");
        content = content[1]?.split("'")[0];
        property = tag?.split("property='");
        property = property[1]?.split("'")[0];
        console.log("!",content,property);
      } else {
        content = tag?.split('content="');
        content = content[1]?.split('"')[0];
        property = tag?.split('property="');
        property = property[1]?.split('"')[0];
        console.log("?",content,property);
      }
      if(property?.toLowerCase().includes("og:")) {
        ogTags[property] = tagSanitize(content);
      }
    })
    scrapeRes = ogTags;
    const client = await clientPromise;
    const db = client.db("user_posts");
    await db.collection('myWishList').insertOne(scrapeRes);
    return {scrapeRes}
  }
}