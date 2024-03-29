import { useFetcher, useLoaderData } from "@remix-run/react";
import { ActionBar } from './ActionBar';
import { Snippet } from './Snippet';
import { IndEmail } from './IndEmail';
import { Composer } from './Composer';
import { EmailInterface } from '~/common/types';
import { AnchorHTMLAttributes, useEffect, useRef, useState } from 'react';
import Pusher from "pusher-js";

export const Email: React.FC<{}> = () => {

  type HeadElement = Element & {
    rel: string,
    href: string
  } | null;

  let { emails, sentEmails } = useLoaderData();  
  const fetcher = useFetcher();
  const sentFetcher = useFetcher();

  const emailScroll = useRef<any>(null);

  const scrollerBottomInbox = useRef<any>(null);
  const scrollerBottomOutbox = useRef<any>(null);
  const previousInboxVisibility = useRef<any>(true);
  const previousOutboxVisibility = useRef<any>(true);
  const [ inboxCount, setInboxCount ] = useState<number>(emails.length-24);
  const [ outboxCount, setOutboxCount ] = useState(sentEmails.length-24);
  const [ loadMoreOutboxInView, setLoadMoreOutboxInView ] = useState(false);
  const [ loadMoreInboxInView, setLoadMoreInboxInView ] = useState(false);
  const [ checkedSnippets, setCheckedSnippets ] = useState<string[]>([]);
  const [ storeScroll, setStoreScroll ] = useState<number>(0);
  const [ emailArray, alterEmailArray ] = useState<EmailInterface[]>(emails);
  const [ sentEmailArray, alterSentEmailArray ] = useState<EmailInterface[]>(sentEmails);
  const [ searchEmailArray, alterSearchEmailArray] = useState<EmailInterface[]>([]);
  const [ emailNotification, setEmailNotification ] = useState<{ 
    msg: string, visibility: boolean
  }>({ msg: "Loading", visibility: false})
  const [ newEmail, editNewEmail ] = useState<
    {attachments: [], to: string, cc: string, bcc: string, subject: string, body: string}
  >({attachments: [], to: "", cc: "", bcc:"", subject: "", body: ""});
  const [ currentEmail, setCurrentEmail ] = useState<
    {view: "inbox"|"outbox"|"search"|"email"|"compose", composeType: string|null, id: string|null, prevView: "inbox"|"outbox"}
  >({view: "inbox", composeType: null, id: null, prevView: "inbox"})

  const emNotif = (visibility: boolean, msg?: string) => {
    setEmailNotification({visibility, msg: msg||"Loading"});
  }

  const cbInbox = (entries:any) => {
    const [ entry ] = entries;
    setLoadMoreInboxInView(entry.isIntersecting);
  }

  const cbOutbox = (entries:any) => {
    const [ entry ] = entries;
    setLoadMoreOutboxInView(entry.isIntersecting);
  }

  const options = {
    root: null,
    rootMargin: "0px",
    threshold: 0.1,
  };

  useEffect(() => {
    const pusher = new Pusher('1463cc5404c5aa8377ba', {
      cluster: 'mt1'
    });

    const newChannel = pusher.subscribe("client-receive-email");
    newChannel.bind("refresh", function (email:{email: {acknowledged: boolean, insertedId: string }}) {
      fetcher.submit(
        { singleEmailId: email.email.insertedId },
        { method: "post", action: `/api/email/fetchOneById?index` }
      );
    });

    const deleteChannel = pusher.subscribe("client-delete-email");
    deleteChannel.bind("refresh", function (deletedIds:{email: any[]}) {
      let emArrClone = [...emailArray];
      emArrClone = emArrClone.filter((email:any) => !deletedIds.email.includes(email._id));
      alterEmailArray(emArrClone);
    });

    const readChannel = pusher.subscribe("client-read-email");
    readChannel.bind("refresh", function (readIds:{email: any[]}) {
      let emArrClone = [...emailArray];
      emArrClone.forEach((email:any) => readIds.email.includes(email._id)?email.unread=0:"");
      alterEmailArray(emArrClone);
    });

    const sendChannel = pusher.subscribe("client-send-email");
    sendChannel.bind("refresh", function (sentEmail:{email: {acknowledged: boolean, insertedId: string }}) {
      sentFetcher.submit(
        { singleEmailId: sentEmail.email.insertedId },
        { method: "post", action: `/api/email/fetchOneById?index` }
      );
    });

    return () => {
      newChannel.unbind_all();
      newChannel.unsubscribe();
      deleteChannel.unbind_all();
      deleteChannel.unsubscribe();
      readChannel.unbind_all();
      readChannel.unsubscribe();
      sendChannel.unbind_all();
      sendChannel.unsubscribe();
    };
  }, [ alterEmailArray, emailArray ]);

  useEffect(() => {
    const observer = new IntersectionObserver(cbInbox, options);
    if(scrollerBottomInbox.current) observer.observe(scrollerBottomInbox.current);
    if( !previousInboxVisibility.current && loadMoreInboxInView ) {
      inboxCount<0
      emNotif(true, inboxCount<0?"Fetching emails":"Loading more received emails");
      fetcher.submit(
        { loadOffset: (inboxCount+25).toString() },
        { method: "post", action: `/api/email/fetchInbox?index` }
      );
      setInboxCount(inboxCount+25);
    }
    previousInboxVisibility.current = loadMoreInboxInView;
    return () => {
      if(scrollerBottomInbox.current) observer.unobserve(scrollerBottomInbox.current);
    }
  },[scrollerBottomInbox, options])

  useEffect(() => {
    const observer = new IntersectionObserver(cbOutbox, options);
    if(scrollerBottomOutbox.current) observer.observe(scrollerBottomOutbox.current);
    if( !previousOutboxVisibility.current && loadMoreOutboxInView ) {
      emNotif(true, outboxCount<0?"Fetching sent emails":"Loading more sent emails");
      fetcher.submit(
        { loadOffset: (outboxCount+25).toString() },
        { method: "post", action: `/api/email/fetchOutbox?index` }
      );
      setOutboxCount(outboxCount+25);
    }
    previousOutboxVisibility.current = loadMoreOutboxInView;
    return () => {
      if(scrollerBottomOutbox.current) observer.unobserve(scrollerBottomOutbox.current);
    }
  },[scrollerBottomOutbox, options])

  useEffect(() => {
    if(currentEmail.view==="inbox") {
      emailScroll.current?.scrollTo(0,storeScroll);
    } else {
      if(emailScroll.current?.scrollTop!==0) setStoreScroll(emailScroll.current?.scrollTop)
      emailScroll.current?.scrollTo(0,0);
    }
  },[currentEmail, storeScroll, setStoreScroll])

  useEffect(() => {
    if(sentFetcher.data?.fetchedSingle) {
      let newEmails:EmailInterface[] = [...sentFetcher.data.fetchedSingle];
      alterSentEmailArray(prev=>[...newEmails, ...prev]);
      sentFetcher.data.fetchedSingle = null;
    }
  },[sentFetcher])

  useEffect(() => {
    if(fetcher.data?.fetchedSingle) {
      let newEmails:EmailInterface[] = [...fetcher.data.fetchedSingle];
      alterEmailArray(prev=>[...newEmails, ...prev]);
      fetcher.data.fetchedSingle = null;
    }
    if(fetcher.data?.additionalInboxEmails) {
      let newEmails:EmailInterface[] = [...fetcher.data.additionalInboxEmails];
      alterEmailArray(prev=>[...prev, ...newEmails]);
      fetcher.data.additionalInboxEmails = null;
      emNotif(false);
    }
    if(fetcher.data?.additionalOutboxEmails) {
      let newEmails:EmailInterface[] = [...fetcher.data.additionalOutboxEmails];
      alterSentEmailArray(prev=>[...prev, ...newEmails]);
      fetcher.data.additionalOutboxEmails = null;
      emNotif(false);
    }
  }, [fetcher]);

  useEffect(() => {
    const unreadEmailCount = emailArray.filter((email: EmailInterface) => email.unread !== 0).length;
    let link: HeadElement = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    const favIconRoot = link.href.split("/").at(-1)?.replace("-alert","");
    let favIcon = `/${favIconRoot}`;
    if(unreadEmailCount) {
      document.title =  `(${unreadEmailCount}) Patrick Glendon McCullough`;
      favIcon = `/${favIconRoot?.replace('.svg','-alert.svg')}`;
    } else {
      document.title =  `Patrick Glendon McCullough`;
      favIcon = `/${favIconRoot}`;
    }
    link.href = favIcon;
  },[emailArray])

  return (
    <>
      <article className="postcard--left">
        <div className="postcard__time">
          <div className="postcard__time__link--unlink">
            Email
          </div>
        </div>
        <div className="postcard__content"
          style={{overflowY: "hidden"}}
        >
          <div className="postcard__content__media"></div>
          <div className="postcard__content__text">
            <div className="email" ref={emailScroll}>
              <ActionBar 
                alterEmailArray={alterEmailArray}
                alterSearchEmailArray={alterSearchEmailArray}
                alterSentEmailArray={alterSentEmailArray}
                checkedSnippets={checkedSnippets}
                currentEmail={currentEmail}
                editNewEmail={editNewEmail}
                emailArray={emailArray}
                emNotif={emNotif}
                newEmail={newEmail}
                searchEmailArray={searchEmailArray}
                sentEmailArray={sentEmailArray}
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
                        currentEmail={currentEmail}
                        email={email}
                        emailArray={emailArray}
                        emNotif={emNotif}
                        setCurrentEmail={setCurrentEmail}
                        setCheckedSnippets={setCheckedSnippets}
                      />
                    </div>
                  )}
                  <div ref={scrollerBottomInbox}>&nbsp;</div>
                </>
                :currentEmail.view==="outbox"
                  ?<>
                    {sentEmailArray.map((email:any) =>
                      <div key={email._id}>
                        <Snippet 
                          alterEmailArray={alterSentEmailArray}
                          checkedSnippets={checkedSnippets}
                          currentEmail={currentEmail}
                          email={email}
                          emailArray={sentEmailArray}
                          emNotif={emNotif}
                          setCurrentEmail={setCurrentEmail}
                          setCheckedSnippets={setCheckedSnippets}
                        />
                      </div>
                    )}
                    <div ref={scrollerBottomOutbox}>&nbsp;</div>
                  </>
                  :currentEmail.view==="search"
                  ?<>
                    {searchEmailArray.length
                      ?searchEmailArray.map((email:any) =>
                        <div key={email._id}>
                          <Snippet 
                            alterEmailArray={alterSearchEmailArray}
                            checkedSnippets={checkedSnippets}
                            currentEmail={currentEmail}
                            email={email}
                            emailArray={searchEmailArray}
                            emNotif={emNotif}
                            setCurrentEmail={setCurrentEmail}
                            setCheckedSnippets={setCheckedSnippets}
                          />
                        </div>
                      )
                      :<div>No matching emails found.</div>
                    }
                    <div ref={scrollerBottomOutbox}>&nbsp;</div>
                  </>
                    :currentEmail.view==="email"
                      ?<IndEmail 
                        email={
                          (
                            emailArray.find((res:any) => res._id===currentEmail.id)
                          ||sentEmailArray.find((res:any) => res._id===currentEmail.id)
                          ||searchEmailArray.find((res:any) => res._id===currentEmail.id)
                          )!
                        }
                      />
                      :currentEmail.view==="compose"
                        ?<Composer 
                          editNewEmail={editNewEmail}
                          email={emailArray.find((res:any) => res._id===currentEmail.id)!}
                          emNotif={emNotif}
                          newEmail={newEmail}
                        />
                        :""
              }
            </div>
          </div>
          <div className={`email__notifications ${emailNotification.visibility?"email__notifications--active":""}`}>
            <div className="loader" />
            { emailNotification.msg }
          </div>
        </div>
      </article>
    </>
  )
}