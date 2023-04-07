import { useFetcher } from "@remix-run/react";
import { useEffect, useRef, useState } from 'react';

export const ActionBar: React.FC<{
  alterEmailArray: any,
  alterSearchEmailArray: any,
  alterSentEmailArray: any,
  checkedSnippets: string[],
  currentEmail: {view: "inbox"|"outbox"|"search"|"email"|"compose", composeType: string|null, id: string|null, prevView: "inbox"|"outbox"},
  editNewEmail: any,
  emNotif: any,
  emailArray: any[],
  newEmail: {to: string, cc: string, bcc: string, subject: string, body: string, attachments: any[]},
  searchEmailArray: any[],
  sentEmailArray: any[],
  setCheckedSnippets: any,
  setCurrentEmail: any
}> = ({ alterEmailArray, alterSearchEmailArray, alterSentEmailArray, checkedSnippets, currentEmail, editNewEmail, emailArray, emNotif, newEmail, searchEmailArray, sentEmailArray, setCheckedSnippets, setCurrentEmail }) => {

  const fetcher = useFetcher();
  const emailSearchFetch = useFetcher();
  const [ searchExpanded, toggleSearchExpanded ] = useState<boolean>(false);
  const [ respondActions, toggleRespondActions ] = useState<boolean>(false);
  const emailSearchEl = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if(searchExpanded) {
      emailSearchEl.current?.focus();
    } else {
      emailSearchEl.current?.blur();
    }
  },[searchExpanded])

  useEffect(() => {
    if( emailSearchFetch.type!=="done" && emailSearchFetch.type!=="init" ) {
      emNotif(true, `Searching`);
    } else {
      emNotif(false);  
    };
    if(emailSearchFetch.data?.matchingEmails) {
      setCurrentEmail({...currentEmail, view: "search", id: null});
      alterSearchEmailArray(emailSearchFetch.data.matchingEmails);
    }
  },[emailSearchFetch]);

  const mailBoxMethods = (whichbox: string) => {
    let ebClone;
    let whichAlterMethod;
    switch(whichbox) {
      case "outbox":
        ebClone = [...sentEmailArray];
        whichAlterMethod = alterSentEmailArray;
        break;
      case "search":
        ebClone = [ ...searchEmailArray ];
        whichAlterMethod = alterSearchEmailArray;
        break;
      default:
        ebClone = [ ...emailArray ]
        whichAlterMethod = alterEmailArray;
        break;
    }
    return [ebClone, whichAlterMethod];
  }

  const sendAndCleanup = () => {
    editNewEmail({to: "", cc: "", bcc:"", subject: "", body: "", attachments: []});
    setCurrentEmail({composeType: null, view: currentEmail.prevView||"inbox", id: null});
    fetcher.data.newEmail = null;
    emNotif(false);
  }

  const removeEmailFromState = (id: string) => {
    fetcher.data = "";
    let [ arr, alter ] = mailBoxMethods(currentEmail.view);
    arr = arr.filter((email:any) => email._id!==id);
    alter(arr);
    setCurrentEmail({ view: currentEmail.prevView||"inbox", composeType: null, id: null });
    emNotif(false);
  };

  const toggleMailbox = (e:React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentEmail({ 
      view: e.target.value==="SENT"?"outbox":e.target.value==="SEARCH"?"search":"inbox",
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
      let [ arr, alter ] = mailBoxMethods(currentEmail.view);
      arr = arr.filter((email:any) => !fetcher.data.delEmParsedArray.includes(email._id));
      alter(arr);
      emNotif(false);
    }
    setCheckedSnippets([]);
    delete fetcher.data.multiDeleteEmails;
    delete fetcher.data.delEmParsedArray;
    // fetch x additional emails where x = delEmParsedArray.length ?
  }

  const onMultiMarkReadSuccess = () => {
    if(fetcher.data.markEmParsedArray.length) {
      let [ arr, alter ] = mailBoxMethods(currentEmail.view);
      arr.forEach((email:any) => fetcher.data.markEmParsedArray.includes(email._id)?email.unread=0:"");
      alter(arr);
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
    let subject = curEmail?.Subject?.trim().replace(/^re:\s*/i, "").replace(/^fwd:\s*/i, "");
    if(composeType==="reply"||composeType==="replyAll") {
      subject = "Re: "+subject;
    }
    if(composeType==="forward") {
      subject = "Fwd: "+subject;
    }
    
    const cc = composeType==="replyAll"&&curEmail.CcFull.length
      ?curEmail.CcFull.map(({Email}:{Email:string, Name:string }, i:number) => {
        if(i<curEmail.CcFull.length-1) return Email+"; ";
        return Email;
      }).join("")
      :""

    const to = composeType==="reply"
      ?curEmail.From||""
      :composeType==="replyAll"&&curEmail.ToFull.length > 1
        ?curEmail.From+"; "+curEmail.ToFull.map(({Email}:{Email:string, Name:string }, i:number) => {
          if(Email.toLowerCase()==="p@mccullo.ug"||Email.toLowerCase()===curEmail.From.toLowerCase()) return "";
          if(i<curEmail.ToFull.length-1) return Email+"; ";
          return Email;
        }).join("")
        :curEmail.From||""

    editNewEmail({
      attachments: composeType==="forward"&&curEmail.Attachments.length?curEmail.Attachments:[],
      to: to.replace(/;\s*$/, ""),
      cc,
      bcc:"",
      subject,
      body: curEmail.HtmlBody.replace(/(<style[\w\W]+style>)/g, "")||curEmail.TextBody
    })
  } 

  const curEm = emailArray.find((email:any) => email._id===currentEmail.id);

  return (
    <div className={`email__actions${currentEmail.view==="email"?" email__actions--unspaced":""}`}><>
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
              <input type="hidden" name="Attachments" value={newEmail.attachments} />
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
            <button onClick={() => toggleRespondActions(!respondActions)}>RESPOND <div className="button__dropdown" /></button>
            {respondActions
              ?<>
                <div className="email__actions_respondActions_bg" onClick={() => toggleRespondActions(false)} />
                <div className="email__actions_respondActions">
                  <button onClick={() => {toggleRespondActions(false); compose("reply",currentEmail.id)}}>REPLY</button>
                  {curEm.ToFull.length > 1 || curEm.CcFull.length
                    ?<button onClick={() => {toggleRespondActions(false); compose("replyAll",currentEmail.id)}}>REPLY ALL</button>
                    :<></>
                  }
                  <button onClick={() => {toggleRespondActions(false); compose("forward",currentEmail.id)}}>FORWARD</button>
                </div>
              </>
              :<></>
            }
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
                  value={currentEmail.view==="search"?"SEARCH":currentEmail.view==="inbox"?"RECEIVED":"SENT"}
                >
                  {searchEmailArray.length?<option>SEARCH</option>:""}
                  <option>RECEIVED</option>
                  <option>SENT</option>
                </select>
                <div className={`email__search ${searchExpanded?"email__search--expanded":""}`}>
                  <emailSearchFetch.Form
                    method="post"
                    action={`/api/email/search?index`}
                  >
                    <input 
                      type="text" 
                      className={`email__search-input ${searchExpanded?"email__search-input--expanded":""}`} 
                      name="search"
                      placeholder="Search..."
                      ref={emailSearchEl}
                    />
                  </emailSearchFetch.Form>
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