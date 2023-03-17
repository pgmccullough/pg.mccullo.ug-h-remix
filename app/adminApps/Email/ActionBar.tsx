import { useFetcher } from "@remix-run/react";

export const ActionBar: React.FC<{
  alterEmailArray: any,
  currentEmail: {view: "inbox"|"outbox"|"email"|"compose", composeType: string|null, id: string|null},
  editNewEmail: any,
  emailArray: any[],
  newEmail: {to: string, cc: string, bcc: string, subject: string, body: string},
  setCurrentEmail: any
}> = ({ alterEmailArray, currentEmail, editNewEmail, emailArray, newEmail, setCurrentEmail }) => {

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
          :<button onClick={() => compose("new",null)}>NEW</button>
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
    </></div>
  )
}