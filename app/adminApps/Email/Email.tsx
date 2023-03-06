import { Link } from 'react-router-dom';
import { useLoaderData } from "@remix-run/react";
import { Snippet } from './Snippet';
import { EmailInterface } from '~/common/types';
import { useEffect, useState } from 'react';

export const Email: React.FC<{}> = () => {

  const [emailBlock, setEmailBlock] = useState<{view: String, emails: EmailInterface[], activeEmailId: String}>({view: "inbox", emails: [], activeEmailId: ""});

  const { emails } = useLoaderData();

  useEffect(() => {
    if(emailBlock.activeEmailId) {
      const emailById = emailBlock.emails.filter((indEmail) => indEmail._id===emailBlock.activeEmailId)
      setEmailBlock({...emailBlock, emails: emailById})
    } else {
      setEmailBlock({...emailBlock, emails: emails})
    }
  }, [emailBlock]);
  
  return (
    <article className="postcard--left">
      <div className="postcard__time">
        <div className="postcard__time__link--unlink">
          Email
        </div>
      </div>
      <div className="postcard__content">
        <div className="postcard__content__media"></div>
        <div className="postcard__content__text">
          <div className="email">
            {emailBlock.view==="inbox"
              ?emailBlock.emails.map((email:any) =>
                <div key={email._id}>
                  <Snippet 
                    email={email}
                    emailBlock={emailBlock}
                    setEmailBlock={setEmailBlock}
                  />
                </div>
              )
              :emailBlock.view==="email"
                ?<div className=""
                  dangerouslySetInnerHTML={
                    {__html: emailBlock.emails[0].HtmlBody || emailBlock.emails[0].TextBody}
                  }
                />
                :""
            }
          </div>
        </div>
      </div>
    </article>
  )
}