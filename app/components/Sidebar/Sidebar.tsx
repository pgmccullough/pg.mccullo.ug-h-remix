import { Link } from 'react-router-dom';
import { useLoaderData } from "@remix-run/react";
import { User, SiteData } from '../../common/types';
import { Email } from '~/adminApps/Email/Email';
import { TextEditor } from '../TextEditor/TextEditor';

export const Sidebar: React.FC<{}> = () => {
  const { user, siteData } = useLoaderData<{user: User, siteData: SiteData}>();

  return (
    <div id="sidebar">
      <article className="postcard--left">
        <div className="postcard__time" style={{ justifyContent: "center" }}>
          <div className="postcard__time__link--unlink">
            <Link to="/h/">{siteData?.site_name}</Link>
          </div>
        </div>
        <div className="postcard__content">
          <div className="postcard__content__media"></div>
          <div className="postcard__content__text">
            {siteData?.site_description
              ?<span dangerouslySetInnerHTML={{__html: siteData?.site_description}} />
              :""
            }
          </div>
        </div>
      </article>
      {user?.role==="administrator"?<Email />:""}
      {user?.role==="administrator"
        ?<TextEditor 
          // htmlString={`<span>I live in New York. Wrote <a target="_BLANK" rel="noreferrer" href="https://www.amazon.com/Son-Ripper-Patrick-Glendon-McCullough-ebook/dp/B0070O5MNE/ref=tmm_kin_swatch_0?_encoding=UTF8&amp;qid=&amp;sr=">a novel in 2007</a> that no one read, but was named a Foreword Magazine Book of the Year. Also had stuff in <em>Ellery Queen Mystery Magazine</em>, <em>McSweeney’s</em>, and <em>Truly*Adventurous</em>.<br><br>Hit me up at p [at symbol] mccullo.ug.</span>`} 
          placeholderText={`Write a... comment?`}
        />
        :""}
    </div>
  )
}