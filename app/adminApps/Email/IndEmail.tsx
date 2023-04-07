import { useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { EmailInterface } from '~/common/types';

export const IndEmail: React.FC<{ email: EmailInterface }> = ({ email }) => {

  const fetcher = useFetcher();

  let emailBody;

  if(email?.HtmlBody) {
    emailBody = email.HtmlBody
      .replace(/(<style[\w\W]+style>)/g, "")
      .replaceAll(/width:(.*);/g,'')
      .replaceAll(/width="(.*)"/g,'width="100%"')
  } else {
    emailBody = email.TextBody||"";
  }

  if(!emailBody.includes('style="')) {
    emailBody = `<div style="padding: 2rem;">${emailBody}</div>`;
  }

  const [attachments, setAttachments] = useState<any[]>([]);
  const [cleanEmail, setCleanEmail] = useState<string>(emailBody);

  useEffect(() => {
    if(email.unread) {
      fetcher.submit(
        { readEmailId: email._id },
        { method: "post", action: `/api/email/markRead/${email._id}` }
      );
    }
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
    setCleanEmail(attToImg(cleanEmail,email.Attachments));
  },[])

  return (
    <div className="email-attachments">
      {attachments.length
        ?attachments.map((dl:any) =>
          <div className="email-attachments__file" key={dl.file}>
            <a href={dl.file} target="_BLANK">{dl.name}</a>
          </div>
        )
        :""
      }
      <div 
        style={{whiteSpace: "normal"}}
        dangerouslySetInnerHTML={
          {__html: cleanEmail}
        }
      />
    </div>
  )
}