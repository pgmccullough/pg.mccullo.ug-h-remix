import { useFetcher } from "@remix-run/react";

export const ActionBar: React.FC<{
  emailBlock: any, setEmailBlock: any 
}> = ({ emailBlock, setEmailBlock }) => {

  const fetcher = useFetcher();

  const removeEmailFromState = (id: String) => {
    fetcher.data = "";
    let ebClone = {...emailBlock};
    ebClone.emails = emailBlock.emails.filter((email:any) => email._id!==id);
    setEmailBlock({...ebClone, view: "inbox", activeEmailId: ""})
  };

  return (
    <div className="email__actions"><>
      {
        emailBlock.activeEmailId
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
            <button>REPLY</button>
            <button>REPLY ALL</button>
            <button>FORWARD</button>
          </>
          :<button>NEW</button>
      }
      {
        fetcher.data?.deleteEmailId
          ?removeEmailFromState(fetcher.data.deleteEmailId)
          :""
      }
    </></div>
  )
}