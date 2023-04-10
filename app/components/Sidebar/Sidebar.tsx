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
    </div>
  )
}