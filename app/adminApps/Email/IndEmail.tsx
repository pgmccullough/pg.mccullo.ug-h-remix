import { useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { EmailInterface } from '~/common/types';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import relativeTime from 'dayjs/plugin/relativeTime';
import advancedFormat from 'dayjs/plugin/advancedFormat';
dayjs.extend(relativeTime)
dayjs.extend(advancedFormat)
dayjs().format();
dayjs.locale('en');

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
    if(!email.unread || email.unread !== 0) {
      fetcher.submit(
        { readEmailId: email._id },
        { method: "post", action: `/api/email/markRead/${email._id}` }
      );
    }
  },[]);

  const attToImg = (body:any,atts:any) => {
    atts?.map((att:any) => {
      setAttachments((prev:any) =>
        [...prev,{ file: `/api/media/images/emailAttachments/${att.ContentID}.${att.Name.split(".").at(-1)}`, name:att.Name }]
      );
      body = body.replace(`cid:${att.ContentID}`,`/api/media/images/emailAttachments/${att.ContentID}.${att.Name.split(".").at(-1)}`);
    })
    return body;
  };

  useEffect(() => {
    setAttachments([]);
    setCleanEmail(attToImg(cleanEmail,email.Attachments));
  },[])

  const iconMap:any = {
    apng: "image",
    avif: "image",
    bmp: "image",
    gif: "image",
    ico: "image",
    jpeg: "image",
    jpg: "image",
    png: "image",
    svg: "image",
    tiff: "image",
    webp: "image",
  }

  const getIcon = (fileName: string) => {
    const ext = fileName.split(".").at(-1)?.toLowerCase()||"no-ext";
    if(iconMap[ext]==="image") {
      return `<div class="email-attachments__icon"><img src="${fileName}" /></div>`
    }
    return `<div class="email-attachments__icon">.${ext}</div>`
  }

  const trimFileName = (fileName: string) => {
    let trimmed = fileName.split(".");
    let ext = trimmed.pop();
    let name = trimmed.join("");
    name = name.length <= 6
    	?name
      :name.slice(0,3)+"..."+name.slice(-3);
    return name+"."+ext;
  }

  const listRecipients = (recipArray: {Email: string, Name: string}[]) =>
    recipArray.map(
      ({Email, Name}:{Email:string, Name?:string }, i:number) => <span key={Email}>
        {Name
            ?<>
              <span dangerouslySetInnerHTML={{__html: `${Name} &lt;${Email}&gt;`}} />{i<recipArray.length-1?", ":""}
            </>
            :<span>{Email}{i<recipArray.length-1?", ":""}</span>
        }
      </span>
    )
    
  return (
    <>
      {attachments.length?
        <div className="email-attachments">
          {attachments.length
            ?attachments.map((dl:any) => {
              return (
                <div className="email-attachments__file" key={dl.file}>
                  <a href={dl.file} target="_BLANK" style={{textDecoration: "none"}}>
                  <div 
                    dangerouslySetInnerHTML={
                      {__html: getIcon(dl.file)}
                    } />
                  </a>
                  <a href={dl.file} target="_BLANK">
                    {trimFileName(dl.name)}
                  </a>
                </div>
              )
            }
            )
            :""
          }
        </div>
      :""}
      <div className="email__meta">
        <p>{email.Subject}</p>
        <div className="email__meta_label">from:</div><div className="email__meta_content">
          {email.FromFull
            ?email.FromFull.Name
              ?<span dangerouslySetInnerHTML={{__html: `${email.FromFull.Name} &lt;${email.FromFull.Email}&gt;`}} />
              :<span>{email.FromFull?.Email}</span>
            :<span>{email.From}</span>
          }
        </div>

        {email.ToFull?.length
          ?<>
            <div className="email__meta_label">to:</div>
            <div className="email__meta_content">
              {listRecipients(email.ToFull)}
            </div>
          </>
          :<></>
        }

        {email.MessageStream==="outbound"
          ?<>
            <div className="email__meta_label">to:</div>
            <div className="email__meta_content">
              {email.To}
            </div>
          </>
          :<></>
        }

        {email.CcFull?.length
          ?<>
            <div className="email__meta_label">cc:</div>
            <div className="email__meta_content">
              {listRecipients(email.CcFull)}
            </div>
          </>
          :<></>
        }

        <div className="email__meta_label">date:</div>
        <div className="email__meta_content">
          {email.Date
            ?dayjs(Date.parse(email.Date)).format('dddd, MMMM Do, YYYY, h:mm A')+" "+dayjs().to(dayjs(Date.parse(email.Date)))
            :dayjs(Number(email.created)).format('dddd, MMMM Do, YYYY, h:mm A')+" "+dayjs().to(dayjs(Number(email.created)))
          }
        </div>

        {email.Opened
        ?<>
          <div className="email__meta_label">opened:</div>
          <div className="email__meta_content">
            {dayjs(Date.parse(email.Opened)).format('dddd, MMMM Do, YYYY, h:mm A')+" "+dayjs().to(dayjs(Date.parse(email.Opened)))}
          </div>
        </>
        :""}
      </div>
      <div 
        style={{whiteSpace: "normal"}}
        dangerouslySetInnerHTML={
          {__html: cleanEmail}
        }
      />
    </>
  )
}