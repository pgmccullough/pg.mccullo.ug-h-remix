import { useFetcher } from "@remix-run/react";

export const ActionBar: React.FC<{
  emailBlock: any, emailForm: any, setEmailBlock: any 
}> = ({ emailBlock, emailForm, setEmailBlock }) => {

  const fetcher = useFetcher();

  const removeEmailFromState = (id: String) => {
    fetcher.data = "";
    let ebClone = {...emailBlock};
    ebClone.emails = emailBlock.emails.filter((email:any) => email._id!==id);
    setEmailBlock({...ebClone, view: "inbox", activeEmailId: ""})
  };

  const compose = (composeType:"new"|"reply"|"replyAll"|"forward"|"", id: string|null) => {
    setEmailBlock({...emailBlock, view: "compose", composeType, activeEmailId: id})
  } 

  return (
    <div className="email__actions"><>
      {
        emailBlock.view==="compose"
        ?<>
          <button 
              onClick={() => 
              setEmailBlock({...emailBlock, view: "inbox", activeEmailId: ""})
            }>BACK
          </button>
          <fetcher.Form 
              method="post"
              action={`/api/email/send?index`}
            >
              <input type="hidden" name="Bcc" value={emailForm.bcc} />
              <input type="hidden" name="Cc" value={emailForm.cc} />
              <input type="hidden" name="HtmlBody" value={emailForm.content} />
              <input type="hidden" name="Subject" value={emailForm.subject} />
              <input type="hidden" name="To" value={emailForm.to} />
            <button>SEND</button>
          </fetcher.Form>
        </>
        :emailBlock.activeEmailId
          ?<>
            <button 
              onClick={() => 
                setEmailBlock({...emailBlock, view: "inbox", activeEmailId: ""})
              }>BACK
            </button>
            <fetcher.Form 
              method="post"
              action={`/api/email/delete/${emailBlock.activeEmailId}`}
            >
              <input type="hidden" name="deleteEmailId" value={emailBlock.activeEmailId} />
              <button type="submit">DELETE</button>
            </fetcher.Form>
            <button onClick={() => compose("reply",emailBlock.activeEmailId)}>REPLY</button>
            <button onClick={() => compose("replyAll",emailBlock.activeEmailId)}>REPLY ALL</button>
            <button onClick={() => compose("forward",emailBlock.activeEmailId)}>FORWARD</button>
          </>
          :<button onClick={() => compose("new",null)}>NEW</button>
      }
      {
        fetcher.data?.deleteEmailId
          ?removeEmailFromState(fetcher.data.deleteEmailId)
          :""
      }
    </></div>
  )
}