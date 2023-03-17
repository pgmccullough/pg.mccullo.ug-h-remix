import { useFetcher } from "@remix-run/react";
import { useEffect } from "react";
import { EmailInterface } from '~/common/types';

export const IndEmail: React.FC<{ email: EmailInterface }> = ({ email }) => {

  const fetcher = useFetcher();

  useEffect(() => {
    fetcher.submit(
      { readEmailId: email._id },
      { method: "post", action: `/api/email/markRead/${email._id}` }
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
    {email.HtmlBody?.replace(/(<style[\w\W]+style>)/g, "").replace(/(<([^>]+)>)/gi, "").replace(/\s/g, '').replaceAll("&nbsp;","")
      ?<div dangerouslySetInnerHTML={{__html: attToImg(email.HtmlBody.replace(/(<style[\w\W]+style>)/g, ""),email.Attachments)}} />
      :<div dangerouslySetInnerHTML={{__html: email.TextBody}} />
    }

    <div
      dangerouslySetInnerHTML={
        {__html: email.HtmlBody.replace(/(<style[\w\W]+style>)/g, "") || email.TextBody}
      }
    />
    </>
  )
}