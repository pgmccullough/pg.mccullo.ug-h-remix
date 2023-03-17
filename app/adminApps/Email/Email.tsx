import { useLoaderData } from "@remix-run/react";
import { ActionBar } from './ActionBar';
import { Snippet } from './Snippet';
import { IndEmail } from './IndEmail';
import { Composer } from './Composer';
import { EmailInterface } from '~/common/types';
import { useEffect, useRef, useState } from 'react';

export const Email: React.FC<{}> = () => {

  const { emails } = useLoaderData();

  const emailBodyRef = useRef<any>(null);
  const emailScroll = useRef<any>(null);

  const [ storeScroll, setStoreScroll ] = useState<Number>(0);
  const [ emailArray, alterEmailArray ] = useState<EmailInterface[]>(emails);
  const [ newEmail, editNewEmail ] = useState<
    {to: string, cc: string, bcc: string, subject: string, body: string}
  >({to: "", cc: "", bcc:"", subject: "", body: ""});
  const [ currentEmail, setCurrentEmail ] = useState<
    {view: "inbox"|"outbox"|"email"|"compose", composeType: string|null, id: string|null}
  >({view: "inbox", composeType: null, id: null})

  useEffect(() => {
    if(currentEmail.view==="inbox") {
      emailScroll.current?.scrollTo(0,storeScroll);
    } else {
      if(emailScroll.current?.scrollTop!==0) setStoreScroll(emailScroll.current?.scrollTop)
      emailScroll.current?.scrollTo(0,0);
    }
  // },[currentEmail, emailScroll, storeScroll, setStoreScroll])
  },[currentEmail, storeScroll, setStoreScroll])
  
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
            <ActionBar 
              alterEmailArray={alterEmailArray}
              currentEmail={currentEmail}
              editNewEmail={editNewEmail}
              emailArray={emailArray}
              newEmail={newEmail}
              setCurrentEmail={setCurrentEmail}
            />
            {currentEmail.view==="inbox"
              ?emailArray.map((email:any) =>
                <div key={email._id}>
                  <Snippet 
                    alterEmailArray={alterEmailArray}
                    email={email}
                    emailArray={emailArray}
                    setCurrentEmail={setCurrentEmail}
                  />
                </div>
              )
              :currentEmail.view==="email"
                ?<IndEmail 
                  email={emailArray.find((res:any) => res._id===currentEmail.id)!}
                />
                :currentEmail.view==="compose"
                  ?<Composer 
                    editNewEmail={editNewEmail}
                    email={emailArray.find((res:any) => res._id===currentEmail.id)!}
                    emailBodyRef={emailBodyRef}
                    newEmail={newEmail}
                  />
                  :""
            }
          </div>
        </div>
      </div>
    </article>
  )
}