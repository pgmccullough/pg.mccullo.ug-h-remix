import { useEffect, useState } from "react"
import { useFetcher, useLoaderData, useMatches } from '@remix-run/react';
import { IPData, User, Visitor } from "~/common/types";

export const Analytics: React.FC<{IPSTACK_APIKEY: {IPSTACK_APIKEY: string}}> = ({IPSTACK_APIKEY}) => {
  const matches = useMatches();
  let { user } = useLoaderData();
  const updateVisitor = useFetcher();
  const initVisit = {
    customName: "",
    history: [],
    ip: [],
    ipData: [],
    guestUUID: [],
    user: []
  }
  const [ visitor, setVisitor ] = useState<Visitor>(initVisit)

  useEffect(()=> {
    let buildVisitor:Visitor = {...visitor};
    const curPath = matches.at(-1)?.pathname||"/";
    if(visitor.history.at(-1)?.path!==curPath) {
      buildVisitor = initVisit;
      buildVisitor.history.push({action: null, path: curPath, timestamp: Date.now()});
      buildVisitor.guestUUID.push(localStorage?.guestUUID);
      buildVisitor.user.push(user||null);
      (async () => {
        const apiResponse = await fetch("https://api.ipify.org/?format=json");
        const ipObj: { ip: string } = await apiResponse.json();
        buildVisitor.ip.push(ipObj.ip);
        const userData = await fetch(`https://api.ipstack.com/${ipObj.ip}?access_key=${IPSTACK_APIKEY}`);
        buildVisitor.ipData.push(await userData.json());
        setVisitor(buildVisitor);
        updateVisitor.submit(
          { visitor: JSON.stringify(buildVisitor) },
          { method: "post", action: `/api/analytics?index` }
        );
      })()
    }
  },[matches])

  return <></>
}