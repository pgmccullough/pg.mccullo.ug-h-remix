import { useEffect, useState } from "react"
import { useFetcher, useLoaderData, useMatches } from '@remix-run/react';
import { IPData, User } from "~/common/types";

export const Analytics: React.FC<{IPSTACK_APIKEY: {IPSTACK_APIKEY: string}}> = ({IPSTACK_APIKEY}) => {
  const matches = useMatches();
  let { user } = useLoaderData();
  const updateVisitor = useFetcher();
  const [ visitor, setVisitor ] = useState<{
    action: null,
    ip: string,
    ipData: IPData|null,
    guestUUID: string,
    user: User|null,
    path: string,
    visitTime: number
  }>({
    action: null,
    ip: "",
    ipData: null,
    guestUUID: "",
    user: null,
    path: "/",
    visitTime: Date.now()
  })

  useEffect(()=> {
    const buildVisitor:{
      action: null,
      ip: string,
      ipData: IPData|null,
      guestUUID: string,
      user: User|null,
      path: string,
      visitTime: number
    } = {
      action: null,
      ip: "",
      ipData: null,
      guestUUID: "",
      user: null,
      path: "/",
      visitTime: Date.now()
    };
    buildVisitor.path = matches.at(-1)?.pathname||"/";
    if(buildVisitor.path!==visitor.path) {
      buildVisitor.guestUUID = localStorage?.guestUUID;
      buildVisitor.user = user||null;
      (async () => {
        const apiResponse = await fetch("https://api.ipify.org/?format=json");
        const ipObj: { ip: string } = await apiResponse.json();
        buildVisitor.ip = ipObj.ip;
        //const userData = await fetch(`http://api.ipstack.com/${ipObj.ip}?access_key=${IPSTACK_APIKEY}`);
        //buildVisitor.ipData = await userData.json();
        
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