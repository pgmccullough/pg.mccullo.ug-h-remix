import { Link } from 'react-router-dom';
import { useLoaderData } from "@remix-run/react";
import { useState } from 'react';
import type { User, SiteData } from '../../common/types';
import { Email } from '~/adminApps/Email/Email';
import { TextEditor } from '../TextEditor/TextEditor';

export const Sidebar: React.FC<{}> = () => {
  const { user, siteData } = useLoaderData<{user: User, siteData: SiteData}>();
  const [ editMode, setEditMode ] = useState<boolean>(true);
  const [ bioContent, setBioContent ] = useState<string>(siteData?.site_description);

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
              ?editMode
                ?<TextEditor 
                    htmlString={siteData?.site_description}
                    contentStateSetter={setBioContent}
                  />
                :<span dangerouslySetInnerHTML={{__html: siteData?.site_description}} />
              :""
            }
          </div>
        </div>
      </article>
      {user?.role==="administrator"?<Email />:""}
    </div>
  )
}