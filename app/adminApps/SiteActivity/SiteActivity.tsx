import { useLoaderData } from "@remix-run/react";
import { useState } from "react"

export const SiteActivity: React.FC<{}> = () => {

  const { visitors } = useLoaderData();

  const [ expanded, setExpanded ] = useState<boolean>(false);
  return (
    <section className={`siteActivity${!expanded?" siteActivity--hidden":""}`}>
      <header className="siteActivity__header">
        pg.mccullo.ug/h/
        <button
          className="siteActivity__button"
          onClick={() => setExpanded(!expanded)}
        >^</button>
      </header>
      <div>
        {visitors.map((visitor: any) =>
          <>
           {visitor.ip.at(-1)}: {visitor.ipData.at(-1).city}, {visitor.ipData.at(-1).region_code}
          </>
        )}
      </div>
    </section>
  )
}