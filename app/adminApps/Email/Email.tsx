import { useFetcher, useLoaderData } from "@remix-run/react";
import { ActionBar } from './ActionBar';
import { Snippet } from './Snippet';
import { IndEmail } from './IndEmail';
import { Composer } from './Composer';
import { EmailInterface } from '~/common/types';
import { useEffect, useRef, useState } from 'react';

export const Email: React.FC<{}> = () => {

  let { emails } = useLoaderData();  
  const fetcher = useFetcher();

  const emailBodyRef = useRef<any>(null);
  const emailScroll = useRef<any>(null);

  const scrollerBottom = useRef<any>(null);
  const previousVisibility = useRef<any>(true);
  const [ emailCount, setEmailCount ] = useState(0);
  const [ loadMoreInView, setLoadMoreInView ] = useState(false);
  const [ checkedSnippets, setCheckedSnippets ] = useState<string[]>([]);
  const [ storeScroll, setStoreScroll ] = useState<Number>(0);
  const [ emailArray, alterEmailArray ] = useState<EmailInterface[]>(emails);
  const [ newEmail, editNewEmail ] = useState<
    {to: string, cc: string, bcc: string, subject: string, body: string}
  >({to: "", cc: "", bcc:"", subject: "", body: ""});
  const [ currentEmail, setCurrentEmail ] = useState<
    {view: "inbox"|"outbox"|"email"|"compose", composeType: string|null, id: string|null}
  >({view: "inbox", composeType: null, id: null})

  const cb = (entries:any) => {
    const [ entry ] = entries;
    setLoadMoreInView(entry.isIntersecting);
  }

  const options = {
    root: null,
    rootMargin: "0px",
    threshold: 0.1,
  };

  useEffect(() => {
    const observer = new IntersectionObserver(cb, options);
    if(scrollerBottom.current) observer.observe(scrollerBottom.current);
    if( !previousVisibility.current && loadMoreInView ) {
      fetcher.submit(
        { loadOffset: (emailCount+25).toString() },
        { method: "post", action: `/api/email/fetch?index` }
      );
      setEmailCount(emailCount+25);
    }
    previousVisibility.current = loadMoreInView;
    return () => {
      if(scrollerBottom.current) observer.unobserve(scrollerBottom.current);
    }
  },[scrollerBottom, options])

  useEffect(() => {
    if(currentEmail.view==="inbox") {
      emailScroll.current?.scrollTo(0,storeScroll);
    } else {
      if(emailScroll.current?.scrollTop!==0) setStoreScroll(emailScroll.current?.scrollTop)
      emailScroll.current?.scrollTo(0,0);
    }
  },[currentEmail, storeScroll, setStoreScroll])

  useEffect(() => {
    if(fetcher.data?.additionalEmails) {
      let newEmails:EmailInterface[] = [...fetcher.data.additionalEmails];
      alterEmailArray(prev=>[...prev,...newEmails]);
      fetcher.data.additionalEmails = null;
    }
  }, [fetcher]);

  return (
    <>
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
                checkedSnippets={checkedSnippets}
                currentEmail={currentEmail}
                editNewEmail={editNewEmail}
                emailArray={emailArray}
                newEmail={newEmail}
                setCheckedSnippets={setCheckedSnippets}
                setCurrentEmail={setCurrentEmail}
              />
              {currentEmail.view==="inbox"
                ?<>
                  {emailArray.map((email:any) =>
                    <div key={email._id}>
                      <Snippet 
                        alterEmailArray={alterEmailArray}
                        checkedSnippets={checkedSnippets}
                        email={email}
                        emailArray={emailArray}
                        setCurrentEmail={setCurrentEmail}
                        setCheckedSnippets={setCheckedSnippets}
                      />
                    </div>
                  )}
                  <div ref={scrollerBottom}>&nbsp;</div>
                </>
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
    </>
  )
}