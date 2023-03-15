import { useLoaderData } from "@remix-run/react";
import { ActionBar } from './ActionBar';
import { Snippet } from './Snippet';
import { IndEmail } from './IndEmail';
import { Composer } from './Composer';
import { EmailInterface } from '~/common/types';
import { useEffect, useRef, useState } from 'react';

export const Email: React.FC<{}> = () => {

  const emailBodyRef = useRef<any>(null);
  const emailScroll = useRef<any>(null);

  const [ emailBlock, setEmailBlock ] = useState<{view: String, composeType:"new"|"reply"|"replyAll"|"forward"|"", emails: EmailInterface[], activeEmailId: String}>({view: "inbox", composeType:"", emails: [], activeEmailId: ""});
  const [ storeScroll, setStoreScroll ] = useState(0);

  const curEmailBackup = {From: "", CcFull: [], Date: "", FromName:"", HtmlBody: "", TextBody: "", Subject: ""}
  const curEmail = emailBlock?.emails.find((email:any) => email._id===emailBlock.activeEmailId)||curEmailBackup;
  let subject = curEmail?.Subject?.trim();
  if(emailBlock.composeType==="reply"||emailBlock.composeType==="replyAll") {
    subject = "Re: "+subject;
  }
  if(emailBlock.composeType==="forward") {
    subject = "Fwd: "+subject;
  }

  const [ emailForm, setEmailForm ] = useState(
    {
      to: emailBlock.composeType==="reply"||emailBlock.composeType==="replyAll"
        ?curEmail.From||""
        :"",
      cc: curEmail.CcFull.length
        ?curEmail.CcFull.join(";")
        :"",
      bcc:"",
      subject
    }
  );

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
            <ActionBar 
              emailBlock={emailBlock}
              emailForm={emailForm}
              setEmailBlock={setEmailBlock}
            />
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
                  setEmailBlock={setEmailBlock}
                />
                :emailBlock.view==="compose"
                  ?<Composer 
                    curEmail={curEmail}
                    emailBlock={emailBlock}
                    emailBodyRef={emailBodyRef}
                    emailForm={emailForm}
                    setEmailBlock={setEmailBlock}
                    setEmailForm={setEmailForm}
                  />
                  :""
            }
          </div>
        </div>
      </div>
    </article>
  )
}