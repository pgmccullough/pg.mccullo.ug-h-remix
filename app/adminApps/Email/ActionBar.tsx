import { useFetcher } from "@remix-run/react";
import { useEffect, useRef, useState } from 'react';

export const ActionBar: React.FC<{
  alterEmailArray: any,
  checkedSnippets: string[],
  currentEmail: {view: "inbox"|"outbox"|"email"|"compose", composeType: string|null, id: string|null, prevView: "inbox"|"outbox"},
  editNewEmail: any,
  emNotif: any,
  emailArray: any[],
  newEmail: {to: string, cc: string, bcc: string, subject: string, body: string},
  setCheckedSnippets: any,
  setCurrentEmail: any
}> = ({ alterEmailArray, checkedSnippets, currentEmail, editNewEmail, emailArray, emNotif, newEmail, setCheckedSnippets, setCurrentEmail }) => {

  const fetcher = useFetcher();
  const [ searchExpanded, toggleSearchExpanded ] = useState<boolean>(false);
  const emailSearchEl = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if(searchExpanded) {
      emailSearchEl.current?.focus();
    } else {
      emailSearchEl.current?.blur();
    }
  },[searchExpanded])

  const sendAndCleanup = () => {
    editNewEmail({to: "", cc: "", bcc:"", subject: "", body: ""});
    setCurrentEmail({composeType: null, view: currentEmail.prevView||"inbox", id: null});
    fetcher.data.newEmail = null;
    emNotif(false);
  }

  const removeEmailFromState = (id: string) => {
    fetcher.data = "";
    let ebClone = [ ...emailArray ];
    ebClone = ebClone.filter((email:any) => email._id!==id);
    alterEmailArray(ebClone);
    setCurrentEmail({ view: currentEmail.prevView||"inbox", composeType: null, id: null });
    emNotif(false);
  };

  const toggleMailbox = (e:React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentEmail({ 
      view: e.target.value==="SENT"?"outbox":"inbox",
      composeType: null,
      id: null
    })
  }

  const multiDelete = () => {
    emNotif(true, `Deleting ${checkedSnippets.length} emails`);
    fetcher.submit(
      { deleteEmails: JSON.stringify(checkedSnippets) },
      { method: "post", action: `/api/email/delete?index` }
    );
  }
  
  const onMultiDelSuccess = () => {
    if(fetcher.data.delEmParsedArray.length) {
      let ebClone = [ ...emailArray ];
      ebClone = ebClone.filter((email:any) => !fetcher.data.delEmParsedArray.includes(email._id));
      alterEmailArray(ebClone);
      emNotif(false);
    }
    setCheckedSnippets([]);
    delete fetcher.data.multiDeleteEmails;
    delete fetcher.data.delEmParsedArray;
    // fetch x additional emails where x = delEmParsedArray.length ?
  }

  const onMultiMarkReadSuccess = () => {
    if(fetcher.data.markEmParsedArray.length) {
      let ebClone = [ ...emailArray ];
      ebClone.forEach((email:any) => fetcher.data.markEmParsedArray.includes(email._id)?email.unread=0:"");
      alterEmailArray(ebClone);
    }
    setCheckedSnippets([]);
    delete fetcher.data.multiMarkReadEmails;
    delete fetcher.data.markEmParsedArray;
    emNotif(false);
  }

  const multiMarkRead = () => {
    emNotif(true, `Marking ${checkedSnippets.length} emails read`);
    fetcher.submit(
      { readEmails: JSON.stringify(checkedSnippets) },
      { method: "post", action: `/api/email/markRead?index` }
    );
  }

  const compose = (composeType:"new"|"reply"|"replyAll"|"forward"|"", id: string|null) => {
    setCurrentEmail({ view: "compose", composeType, id });
    const curEmail = emailArray.find((email:any) => email._id===id);
    let subject = curEmail?.Subject?.trim();
    if(composeType==="reply"||composeType==="replyAll") {
      subject = "Re: "+subject;
    }
    if(composeType==="forward") {
      subject = "Fwd: "+subject;
    }
    editNewEmail({
      to: composeType==="reply"||composeType==="replyAll"
        ?curEmail.From||""
        :"",
      cc: curEmail.CcFull.length
        ?curEmail.CcFull.join(";")
        :"",
      bcc:"",
      subject,
      body: curEmail.HtmlBody.replace(/(<style[\w\W]+style>)/g, "")||curEmail.TextBody
    })
  } 

  return (
    <div className="email__actions"><>
      {
        currentEmail.view==="compose"
        ?<>
          <button 
              onClick={() => 
                setCurrentEmail({composeType: null, view: currentEmail.prevView||"inbox", id: null})
            }>BACK
          </button>
          <fetcher.Form 
              method="post"
              action={`/api/email/send?index`}
            >
              <input type="hidden" name="Bcc" value={newEmail.bcc} />
              <input type="hidden" name="Cc" value={newEmail.cc} />
              <input type="hidden" name="HtmlBody" value={newEmail.body} />
              <input type="hidden" name="Subject" value={newEmail.subject} />
              <input type="hidden" name="To" value={newEmail.to} />
            <button onClick={() => emNotif(true, `Sending email`)}>SEND</button>
          </fetcher.Form>
        </>
        :currentEmail.id
          ?<>
            <button 
              onClick={() => 
                setCurrentEmail({composeType: null, view: currentEmail.prevView||"inbox", id: null})
              }>BACK
            </button>
            <fetcher.Form 
              method="post"
              action={`/api/email/delete/${currentEmail.id}`}
            >
              <input type="hidden" name="deleteEmailId" value={currentEmail.id} />
              <button type="submit" onClick={() => emNotif(true, `Deleting email`)}>DELETE</button>
            </fetcher.Form>
            <button onClick={() => compose("reply",currentEmail.id)}>REPLY</button>
            <button onClick={() => compose("replyAll",currentEmail.id)}>REPLY ALL</button>
            <button onClick={() => compose("forward",currentEmail.id)}>FORWARD</button>
          </>
          :checkedSnippets.length
            ?<>
              <button onClick={multiDelete}>DELETE</button>
              <button onClick={multiMarkRead}>MARK READ</button>
            </>
            :<>
              <button onClick={() => compose("new",null)}>NEW</button>
              <div style={{display: "flex"}}>
                <select
                  className="email__select"
                  onChange={(e) => toggleMailbox(e)}
                  value={currentEmail.view==="inbox"?"RECEIVED":"SENT"}
                >
                  <option>RECEIVED</option>
                  <option>SENT</option>
                </select>
                <div className={`email__search ${searchExpanded?"email__search--expanded":""}`}>
                  <input 
                    type="text" 
                    className={`email__search-input ${searchExpanded?"email__search-input--expanded":""}`} 
                    placeholder="Search..."
                    ref={emailSearchEl}
                  />
                  <div 
                    className={`email__search-action ${searchExpanded?"email__search-action--x":""}`}
                    onClick={() => toggleSearchExpanded(!searchExpanded)}
                  >
                    <div className="email__search-action-circle"></div>
                    <div className="email__search-action-line"></div>
                  </div>
                </div>
              </div>
            </>
      }
      {
        fetcher.data?.deleteEmailId
          ?removeEmailFromState(fetcher.data.deleteEmailId)
          :""
      }
      {
        fetcher.data?.newEmail
          ?sendAndCleanup()
          :""
      }
      {
        fetcher.data?.multiDeleteEmails
          ?onMultiDelSuccess()
          :""
      }
      {
        fetcher.data?.multiMarkReadEmails
          ?onMultiMarkReadSuccess()
          :""
      }
    </></div>
  )
}