import type { ActionArgs } from "@remix-run/node";
import { getUser } from "~/utils/session.server";

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
    scrapeRes = scrapeRes?.split('<meta property=');
    scrapeRes?.forEach(tag => {
      let tagArr = tag.split(' content=');
      if(tagArr[0].toLowerCase().includes("og:")) {
        ogTags[tagSanitize(tagArr[0])] = tagSanitize(tagArr[1].split(">")[0])
      }
    })
    scrapeRes = ogTags;
    // write to DB
    return {scrapeRes}
  }
}