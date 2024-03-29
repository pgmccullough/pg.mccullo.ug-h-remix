import { EmailInterface } from '~/common/types';
import { useFetcher } from "@remix-run/react";
import { useEffect, useRef, useState } from 'react';
import { useSwipe } from '~/utils/hooks/useSwipe';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime)
dayjs().format();
dayjs.locale('en');

export const Snippet: React.FC<{ 
    alterEmailArray: any,
    checkedSnippets: string[],
    currentEmail: any,
    email: EmailInterface, 
    emailArray: EmailInterface[],
    emNotif: any;
    setCheckedSnippets: any,
    setCurrentEmail: any
}> = ({ alterEmailArray, checkedSnippets, currentEmail, email, emailArray, emNotif, setCheckedSnippets, setCurrentEmail }) => {
  
  const [ swipe, setSwipe ] = useSwipe(deleteEmail,() => markRead(1));
  const [ beingDeleted, setBeingDeleted ] = useState<boolean>(false)
  const [ _shrinkHeight, setShrinkHeight ] = useState<number>(73);
  const [ canShowDate, setCanShowDate ] = useState<boolean>(false);
  const snippetDOM = useRef<HTMLDivElement>(null);
  const swipeMarkRead = useFetcher();
  const swipeDelete = useFetcher();

  function deleteEmail() {
    setBeingDeleted(true);
    snippetDOM.current!.style.transform = "translateX(-600px)";
    emNotif(true, "Deleting email");
    swipeDelete.submit(
      {deleteEmailId: email._id},
      {method: "post", action: `/api/email/delete/${email._id}`}
    )
  }

  const markRead = (dontOpen?: 1) => {
    const setPrevView = currentEmail.view;
    let newEmailArr:EmailInterface[] = [];
    emailArray.forEach(itEmail => {
      itEmail._id === email._id?itEmail.unread=0:"";
      newEmailArr.push(itEmail);
    })
    alterEmailArray(newEmailArr);
    if(!dontOpen) {
      setCurrentEmail({ view: "email", composeType: null, id: email._id, prevView: setPrevView });
    } else {
      swipeMarkRead.submit(
        { readEmailId: email._id },
        { method: "post", action: `/api/email/markRead/${email._id}` }
      );
    }
  }

  useEffect(() => {
    setCanShowDate(true);
    setShrinkHeight(snippetDOM.current?.scrollHeight||73);
  },[])

  useEffect(() => {
    if(swipeDelete.type==="done") {
      let newEmailArr:EmailInterface[] = emailArray.filter(itEmail => itEmail._id !== email._id);
      alterEmailArray(newEmailArr);
      emNotif(false);
    }
  },[swipeDelete])

  useEffect(() => {
    if(beingDeleted&&snippetDOM.current) {
      const interval = setInterval(() => {
        setShrinkHeight(prev => {
          snippetDOM.current!.style.height = prev+"px";
          return prev-2;
        });
      }, 10);
      return () => clearInterval(interval);
    }
  },[beingDeleted, snippetDOM, setShrinkHeight])
  
  return (
    <div 
      ref={snippetDOM}
      className={`snippet__background${swipe>150?" snippet__background--swipeleft":""}${swipe<-150?" snippet__background--swiperight":""}`}
    >
      <img 
        src="https://pg.mccullo.ug/api/media/images/icons/read_ico.png" 
        className={`snippet__icon snippet__icon--read${swipe>150?" snippet__icon--hidden":""}`}
      />
      <img 
        src="https://pg.mccullo.ug/api/media/images/icons/trash_ico.png"
        className={`snippet__icon snippet__icon--trash${swipe<-150?" snippet__icon--hidden":""}`}
      />
      <div
        className={`snippet${email.unread?" snippet--unread":""}${swipe>0?" snippet--swipeleft":""}${swipe<0?" snippet--swiperight":""}`}
        style={{transform: `translateX(${swipe*-1}px`}}
        onTouchStart={setSwipe} 
        onTouchMove={setSwipe} 
        onTouchEnd={setSwipe}
      >
        <div className="snippet__check">
          <input 
            type="checkbox"
            checked={!!checkedSnippets.find((match:string)=>match===email._id)}
            onChange={() =>
              setCheckedSnippets((prev:any) =>
                prev.includes(email._id)
                ?[...prev.filter((checked:string)=>checked!==email._id)]
                :[...prev,email._id]
              )
            }
          />
        </div>
        <div className="snippet__from" onClick={() => markRead()}>
          { currentEmail.view==="inbox"
            ?email.FromName || email.From
            :email.To
          }
        </div>
        <div className="snippet__att-and-subject">
          {email.Attachments?.length>0
            ?<div style={{fontSize:"30px"}} onClick={() => markRead()}>
              {email.Attachments.length}
            </div>
            :""}
          <div className="snippet__subject" onClick={() => markRead()}>
            {email.Subject}
          </div>
        </div>
        <div 
          className="snippet__date" 
          onClick={() => markRead()}
          style={currentEmail.view==="outbox"?{marginLeft: "-12px"}:{opacity:"1"}}
        >
          {
          canShowDate
          ?dayjs(Date.parse(email.Date)||Number(email.created)).format('MMDDYYYY')===dayjs(Date.now()).format('MMDDYYYY')
            ?dayjs(Date.parse(email.Date)||Number(email.created)).format('h:mmA')
            :dayjs(Date.parse(email.Date)||Number(email.created)).format('YYYY')===dayjs(Date.now()).format('YYYY')
              ?dayjs(Date.parse(email.Date)||Number(email.created)).format('MMM D')
              :dayjs(Date.parse(email.Date)||Number(email.created)).format('M/D/YY')
          :""
          }
          {currentEmail.view==="outbox"
            ?<div className={`snippet__status ${email.Opened?'snippet__status--opened':''}`}>
              {email.Opened
                ?
                  <div className="snippet__status--opened__popup"><b>OPENED: </b>{
                    canShowDate
                    ?dayjs(Date.parse(email.Opened)).format('MMDDYYYY')===dayjs(Date.now()).format('MMDDYYYY')
                      ?dayjs(Date.parse(email.Opened)).format('h:mmA')
                      :dayjs(Date.parse(email.Opened)).format('YYYY')===dayjs(Date.now()).format('YYYY')
                        ?dayjs(Date.parse(email.Opened)).format('MMM D')
                        :dayjs(Date.parse(email.Opened)).format('M/D/YY')
                    :""
                  }.</div>
                :<></>
              }
            </div>
            :""
          }
        </div>
      </div>
    </div>
  )
}