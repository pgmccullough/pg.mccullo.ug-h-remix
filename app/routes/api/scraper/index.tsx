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

  const getOGTags = (scrapeRes: any, urlToScrape: any) => {
    let ogTags: {[key: string]: string} = {url: urlToScrape!};
    scrapeRes = scrapeRes?.toString().split("</head>")[0];
    scrapeRes = scrapeRes?.split('<meta ');
    scrapeRes?.forEach((tag: string) => {
      let tagArrTest = tag.split('="');
      let content: string | string[];
      let property: string | string[];
      if(!tagArrTest[1]) {
        content = tag?.split("content='");
        content = content[1]?.split("'")[0];
        property = tag?.split("property='");
        property = property[1]?.split("'")[0];
      } else {
        content = tag?.split('content="');
        content = content[1]?.split('"')[0];
        property = tag?.split('property="');
        property = property[1]?.split('"')[0];
      }
      if(property?.toLowerCase().includes("og:")) {
        ogTags[property] = tagSanitize(content);
      }
    })
    return ogTags;
  }

  const getSchema = (scrapeRes: any) => {
    scrapeRes = scrapeRes?.toString().split('<script type="application/ld+json">')[1].split("</script>")[0];
    return JSON.parse(scrapeRes);
  }

  if(user?.role==="administrator") {
    const urlToScrape = (await request.formData()).get("url")?.toString();
    try {
      const res = await fetch(urlToScrape!);
      scrapeRes = await res.text();
    } catch(err) {
      scrapeRes = err;
    }
    const ogResults = getOGTags(scrapeRes, urlToScrape);
    const schemaResults = getSchema(scrapeRes);
    console.log("OG",Object.keys(ogResults).length);
    console.log("schema",Object.keys(schemaResults[0]).length);
    const dbData = Object.keys(ogResults).length > Object.keys(schemaResults[0]).length ? ogResults : schemaResults[0];
    const client = await clientPromise;
    const db = client.db("user_posts");
    const dbEntry = await db.collection('myWishList').insertOne({ ...dbData, url: urlToScrape });
    return {scrapeRes: ogResults, schemaResults, dbEntry}
  }
}