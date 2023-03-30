import { useFetcher } from "@remix-run/react";

export const ActionBar: React.FC<{
  alterEmailArray: any,
  checkedSnippets: string[],
  currentEmail: {view: "inbox"|"outbox"|"email"|"compose", composeType: string|null, id: string|null},
  editNewEmail: any,
  emailArray: any[],
  newEmail: {to: string, cc: string, bcc: string, subject: string, body: string},
  setCheckedSnippets: any,
  setCurrentEmail: any
}> = ({ alterEmailArray, checkedSnippets, currentEmail, editNewEmail, emailArray, newEmail, setCheckedSnippets, setCurrentEmail }) => {

  const fetcher = useFetcher();

  const sendAndCleanup = () => {
    editNewEmail({to: "", cc: "", bcc:"", subject: "", body: ""});
    setCurrentEmail({composeType: null, view: "inbox", id: null});
    fetcher.data.newEmail = null;
  }

  const removeEmailFromState = (id: string) => {
    fetcher.data = "";
    let ebClone = [ ...emailArray ];
    ebClone = ebClone.filter((email:any) => email._id!==id);
    alterEmailArray(ebClone);
    setCurrentEmail({ view: "inbox", composeType: null, id: null });
  };

  const toggleMailbox = (e:React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentEmail({ 
      view: e.target.value==="SENT"?"outbox":"inbox",
      composeType: null,
      id: null
    })
  }

  const multiDelete = () => {
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
  }

  const multiMarkRead = () => {
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
                setCurrentEmail({composeType: null, view: "inbox", id: null})
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
            <button>SEND</button>

          </fetcher.Form>
        </>
        :currentEmail.id
          ?<>
            <button 
              onClick={() => 
                setCurrentEmail({composeType: null, view: "inbox", id: null})
              }>BACK
            </button>
            <fetcher.Form 
              method="post"
              action={`/api/email/delete/${currentEmail.id}`}
            >
              <input type="hidden" name="deleteEmailId" value={currentEmail.id} />
              <button type="submit">DELETE</button>
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
              <select onChange={(e) => toggleMailbox(e)}>
                <option>RECEIVED</option>
                <option>SENT</option>
              </select>
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