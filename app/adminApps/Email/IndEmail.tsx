import { useFetcher } from "@remix-run/react";
import { useEffect } from "react";

export const IndEmail: React.FC<{ emailBlock: any, setEmailBlock: any }> = ({ emailBlock, setEmailBlock }) => {

  const fetcher = useFetcher();

  useEffect(() => {
    fetcher.submit(
      { readEmailId: emailBlock.activeEmailId },
      { method: "post", action: `/api/email/markRead/${emailBlock.activeEmailId}` }
    );
  },[]);

  const attToImg = (body:any,atts:any) => {
    atts?.map((att:any) => {
      body = body.replace(`cid:${att.ContentID}`,`https://api.mccullo.ug/media/images/emailAttachments/${att.ContentID}.${att.Name.split(".").at(-1)}`);
    })
    return body;
  };

  return (
    <>
    {emailBlock.emails.find((res:any) => res._id===emailBlock.activeEmailId).HtmlBody?.replace(/(<style[\w\W]+style>)/g, "").replace(/(<([^>]+)>)/gi, "").replace(/\s/g, '').replaceAll("&nbsp;","")
      ?<div dangerouslySetInnerHTML={{__html: attToImg(emailBlock.emails.find((res:any) => res._id===emailBlock.activeEmailId).HtmlBody.replace(/(<style[\w\W]+style>)/g, ""),emailBlock.emails.find((res:any) => res._id===emailBlock.activeEmailId).Attachments)}} />
      :<div dangerouslySetInnerHTML={{__html: emailBlock.emails.find((res:any) => res._id===emailBlock.activeEmailId).TextBody}} />
    }

    <div
      dangerouslySetInnerHTML={
        {__html: emailBlock.emails.find((res:any) => res._id===emailBlock.activeEmailId).HtmlBody.replace(/(<style[\w\W]+style>)/g, "") || emailBlock.emails.find((res:any) => res._id===emailBlock.activeEmailId).TextBody}
      }
    />
    </>
  )
}