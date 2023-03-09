import { useLoaderData } from "@remix-run/react";
import { Snippet } from './Snippet';
import { IndEmail } from './IndEmail';
import { EmailInterface } from '~/common/types';
import { useEffect, useRef, useState } from 'react';

export const Email: React.FC<{}> = () => {

  const emailScroll = useRef<any>(null);

  const [ emailBlock, setEmailBlock ] = useState<{view: String, emails: EmailInterface[], activeEmailId: String}>({view: "inbox", emails: [], activeEmailId: ""});
  const [ storeScroll, setStoreScroll ] = useState(0);

  const { emails } = useLoaderData();

  useEffect(() => {
    if(emailBlock.view==="inbox") {
      emailScroll.current?.scrollTo(0,storeScroll);
    } else {
      if(emailScroll.current?.scrollTop!==0) setStoreScroll(emailScroll.current?.scrollTop)
      emailScroll.current?.scrollTo(0,0);
    }
  },[emailBlock, emailScroll, storeScroll, setStoreScroll])

  useEffect(() => {
    if(emailBlock.activeEmailId) {
      const emailById = emailBlock.emails.filter((indEmail) => indEmail._id===emailBlock.activeEmailId)
      setEmailBlock({...emailBlock, emails: emailById})
    } else {
      setEmailBlock({...emailBlock, emails: emails})
    }
  }, []);
  
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
          <div className="email" ref={emailScroll}>
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
                ?<IndEmail 
                  emailBlock={emailBlock}
                  emailScroll={emailScroll}
                  setEmailBlock={setEmailBlock}
                  setStoreScroll={setStoreScroll}
                  storeScroll={storeScroll}
                />
                :""
            }
          </div>
        </div>
      </div>
    </article>
  )
}