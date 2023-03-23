import { useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { EmailInterface } from '~/common/types';

export const IndEmail: React.FC<{ email: EmailInterface }> = ({ email }) => {

  const fetcher = useFetcher();

  const [attachments, setAttachments] = useState<any>([]);
  const [cleanEmail, setCleanEmail] = useState<any>(email.HtmlBody.replace(/(<style[\w\W]+style>)/g, "")||email.TextBody);

  useEffect(() => {
    fetcher.submit(
      { readEmailId: email._id },
      { method: "post", action: `/api/email/markRead/${email._id}` }
    );
  },[]);

  const attToImg = (body:any,atts:any) => {
    atts?.map((att:any) => {
      setAttachments((prev:any) =>
        [...prev,{ file: `https://pg.mccullo.ug/api/media/images/emailAttachments/${att.ContentID}.${att.Name.split(".").at(-1)}`, name:att.Name }]
      );
      body = body.replace(`cid:${att.ContentID}`,`https://pg.mccullo.ug/api/media/images/emailAttachments/${att.ContentID}.${att.Name.split(".").at(-1)}`);
    })
    return body;
  };

  useEffect(() => {
    setAttachments([]);
    setCleanEmail(attToImg(email.HtmlBody.replace(/(<style[\w\W]+style>)/g, ""),email.Attachments) || attToImg(email.TextBody,email.Attachments));
  },[])

  return (
    <>
      {attachments.length
        ?attachments.map((dl:any) =>
          <>
            <a href={dl.file}>{dl.name}</a>
          </>
        )
        :""
      }
      <div
        dangerouslySetInnerHTML={
          {__html: cleanEmail}
        }
      />
    </>
  )
}