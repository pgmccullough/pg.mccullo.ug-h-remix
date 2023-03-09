import { useFetcher } from "@remix-run/react";

export const IndEmail: React.FC<{ emailBlock: any, setEmailBlock: any }> = ({ emailBlock, setEmailBlock }) => {

  const fetcher = useFetcher();

  const removeEmailFromState = (id: String) => {
    let ebClone = {...emailBlock};
    ebClone.emails = emailBlock.emails.filter((email:any) => email._id!==id);
    setEmailBlock({...ebClone, view: "inbox", activeEmailId: ""})
  }

  return (
    <>
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
    {
      fetcher.data?.deleteEmailId
        ?removeEmailFromState(fetcher.data.deleteEmailId)
        :""
    }
    <div
      dangerouslySetInnerHTML={
        {__html: emailBlock.emails.find((res:any) => res._id===emailBlock.activeEmailId).HtmlBody.replace(/(<style[\w\W]+style>)/g, "") || emailBlock.emails.find((res:any) => res._id===emailBlock.activeEmailId).TextBody}
      }
    />
    </>
  )
}