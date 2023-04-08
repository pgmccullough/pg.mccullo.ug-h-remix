import { useEffect, useState } from 'react';
import { EmailInterface } from '~/common/types';

export const Composer: React.FC<{ 
  currentEmail: any, editNewEmail: any, email: EmailInterface, emailBodyRef: any, newEmail: any
}> = ({ currentEmail, editNewEmail, email, emailBodyRef, newEmail }) => {

  const emailBody = email&&(email.FromName||email.Subject||email.Date)
  ?`
    <br /><br />
    <hr />
      <b>From:</b> ${ email.FromName?email.FromName+" <"+email.From+">":email.From}<br />
      <b>Sent: </b> ${ email.Date } <br />
      <b>To: </b> ${ email.To } <br />
      ${email.Cc?<><b>cc: </b> { email.Cc } <br /></>:""}
      <b>Subject:</b> ${ email?.Subject||"" } <br />
      <p>${email.HtmlBody.replace(/(<style[\w\W]+style>)/g, "")||email.TextBody}</p>
  `
  :""

  const [ formatButton, toggleFormatButton ] = useState({bold: false, italic: false, underline: false, strikethrough: false, code: false})
  const [attachments, setAttachments] = useState<any[]>([]);
  const [cleanEmail, setCleanEmail] = useState<string>(emailBody);

  const attToImg = (body:any,atts:any) => {
    atts?.map((att:any) => {
      setAttachments((prev:any) =>
        [...prev,{ file: `/api/media/images/emailAttachments/${att.ContentID}.${att.Name.split(".").at(-1)}`, name:att.Name }]
      );
      body = body.replace(`cid:${att.ContentID}`,`/api/media/images/emailAttachments/${att.ContentID}.${att.Name.split(".").at(-1)}`);
    })
    return body;
  };

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
    const ext = fileName?.split(".").at(-1)?.toLowerCase()||"no-ext";
    if(iconMap[ext]==="image") {
      return `<div class="email-attachments__icon"><img src="${fileName}" /></div>`
    }
    return `<div class="email-attachments__icon">.${ext}</div>`
  }

  const trimFileName = (fileName: string) => {
    let trimmed = fileName?.split(".");
    let ext = trimmed.pop();
    let name = trimmed.join("");
    name = name.length <= 6
    	?name
      :name.slice(0,3)+"..."+name.slice(-3);
    return name+"."+ext;
  }

  const dropAtt = ({file, name}: {file: string, name: string}) => {
    let contentID = file.split("/").at(-1);
    let noExtContentID = contentID?.split(".").at(-2);
    const cloneEm = {...newEmail};
    let cloneAtts = [...cloneEm.attachments];
    let updatedAtts = cloneAtts.filter((attachment: {ContentLength:number, Name: string, ContentType: string, ContentID: string}) =>
      attachment.ContentID!==noExtContentID
    )
    editNewEmail({...newEmail,attachments:updatedAtts});
    let cloneDispAtts = [...attachments];
    let updatedDispAtts = cloneDispAtts.filter((dispAtt: {file: string, name: string}) =>
      dispAtt.file !== "/api/media/images/emailAttachments/"+contentID
    ) 
    setAttachments(updatedDispAtts);
  }

  useEffect(() => {
    setAttachments([]);
    setCleanEmail(attToImg(cleanEmail,newEmail.attachments));
  },[])

  return (
    <>
      <div className="email__composer-head">
        <div className="email__input">
          <label htmlFor="email__input--to">To</label>
          <input 
            type="text"
            id="email__input--to"
            name="to"
            onChange={(e) => editNewEmail({...newEmail, [e.target.name]:e.target.value})}
            value={newEmail.to}
          />
        </div>
        <div className="email__input">
          <label htmlFor="email__input--cc">Cc</label>
          <input 
            type="text" 
            id="email__input--cc"
            name="cc"
            onChange={(e) => editNewEmail({...newEmail, [e.target.name]:e.target.value})}
            value={newEmail.cc}
          />
        </div>
        <div className="email__input">
          <label htmlFor="email__input--bcc">Bcc</label>
          <input
            type="text"
            id="email__input--bcc"
            name="bcc"
            onChange={(e) => editNewEmail({...newEmail, [e.target.name]:e.target.value})}
            value={newEmail.bcc}
          />
        </div>
        <div className="email__input">
          <label htmlFor="email__input--subject">Subject</label>
          <input
            type="text"
            id="email__input--subject"
            name="subject"
            onChange={(e) => editNewEmail({...newEmail, [e.target.name]:e.target.value})}
            value={newEmail.subject}
          />
        </div>
        <div className="email__formatter">
          <button 
            className={`email__format-button ${formatButton.bold?"email__format-button--active":""} email__format-button--bold`}
            onClick={() => toggleFormatButton({...formatButton, bold: !formatButton.bold})}
          >B</button>
          <button 
            className={`email__format-button ${formatButton.italic?"email__format-button--active":""} email__format-button--italic`}
            onClick={() => toggleFormatButton({...formatButton, italic: !formatButton.italic})}
          >I</button>
          <button 
            className={`email__format-button ${formatButton.underline?"email__format-button--active":""} email__format-button--underline`}
            onClick={() => toggleFormatButton({...formatButton, underline: !formatButton.underline})}
          >U</button>
          <button 
            className={`email__format-button ${formatButton.strikethrough?"email__format-button--active":""} email__format-button--strikethrough`}
            onClick={() => toggleFormatButton({...formatButton, strikethrough: !formatButton.strikethrough})}
          >S</button>
          <button 
            className={`email__format-button ${formatButton.code?"email__format-button--active":""} email__format-button--code`}
            onClick={() => toggleFormatButton({...formatButton, code: !formatButton.code})}
          >{`</>`}</button>
          <button className={`email__format-button email__format-button--attachment`}>ATT</button>
        </div>
      </div>

      {attachments.length&&currentEmail.composeType==="forward"?
        <div className="email-attachments">
          {attachments.length
            ?attachments.map((dl:any) => {
              return (
                <div className="email-attachments__file" key={dl.file}>
                  <div>
                    <div 
                      dangerouslySetInnerHTML={
                        {__html: getIcon(dl.file)}
                      }
                    />
                    <div 
                      className="email-attachments__remove"
                      onClick={() => dropAtt(dl)}
                    >+</div>
                  </div>
                  {trimFileName(dl.name)}
                </div>
              )
            }
            )
            :""
          }
        </div>
      :""}

      <div 
        className="email__body"
        contentEditable={true}
        style={{whiteSpace: "normal"}}
        onKeyUp={() => editNewEmail({...newEmail, body: emailBodyRef.current.innerHTML})}
        ref={ emailBodyRef }
        dangerouslySetInnerHTML={{__html: cleanEmail}}
      />
    </>
  )
}