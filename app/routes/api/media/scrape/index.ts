import type { ActionArgs, ActionFunction } from '@remix-run/node';

export const action: ActionFunction = async ({ request }: ActionArgs) => {
  const scrapeURL = (await request.formData()).get("scrapeURL")?.toString();

  const fetchData = await fetch(
    `https://${decodeURIComponent(scrapeURL!)}`,
    { method: 'GET'}
  )
  const results = await fetchData.text();

  let ogTags = results.split('<meta ');
  let property;
  let content;
  let ogObj:any[] = [];
  let scrapeObject:{} = {};
  ogTags.shift();
  ogTags.forEach((ogTag:any)=> {
    if(ogTag.length) {
      ogTag = ogTag?.split('>');
      ogTag = ogTag[0];
      if(ogTag.includes("property=")) {
        property = ogTag?.split('property="');
        property = property&&property[1]?.split('"');  
        property = property&&property[0];         
        content = ogTag?.split('content="');
        content = content&&content[1]?.split('"');
        content = content&&content[0];
        ogObj.push({[property]:content});
      }
    }
  })
  ogObj.map((ogTag:any) => {
    let keyName = Object.getOwnPropertyNames(ogTag)[0];
    if(keyName==="og:description") {
      let trimDesc = ogTag[keyName];
      if(trimDesc.length > 300) {
        let commaTrimDesc = trimDesc.slice(0,300).split(", ");
        commaTrimDesc.pop();
        commaTrimDesc = commaTrimDesc.join(", ").trim();
        let periodTrimDesc = trimDesc.slice(0,300).split(". ");
        periodTrimDesc.pop();
        periodTrimDesc = periodTrimDesc.join(", ").trim();
        trimDesc = commaTrimDesc.length > periodTrimDesc.length 
          ? commaTrimDesc+"..."
          : periodTrimDesc+".";
      }
      scrapeObject = {...scrapeObject,[keyName]:trimDesc}
    } else {
      scrapeObject = {...scrapeObject,[keyName]:ogTag[keyName]}
    }
  });
  return { scrapeObject };
}