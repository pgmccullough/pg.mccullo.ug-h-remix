import { useEffect, useRef, useState } from 'react';
import { useFetcher } from "@remix-run/react";
import { EmailInterface } from '~/common/types';
import { v4 as uuidv4 } from 'uuid';
import { TextEditor } from '~/components/TextEditor/TextEditor';

export const Composer: React.FC<{ 
  editNewEmail: any, email: EmailInterface, emNotif: any, newEmail: any
}> = ({ editNewEmail, email, emNotif, newEmail }) => {

  const emailBody = email&&(email.FromName||email.Subject||email.Date)
  ?`
    <hr />
      <b>From:</b> ${ email.FromName?email.FromName+" <"+email.From+">":email.From}<br />
      <b>Sent: </b> ${ email.Date } <br />
      <b>To: </b> ${ email.To } <br />
      ${email.Cc?<><b>cc: </b> { email.Cc } <br /></>:""}
      <b>Subject:</b> ${ email?.Subject||"" } <br />
      <p>${email.HtmlBody.replace(/(<style[\w\W]+style>)/g, "")||email?.TextBody}</p>
  `
  :""

  const attachFetch = useFetcher();

  const [ attachments, setAttachments ] = useState<any[]>([]);
  const [ cleanEmail, setCleanEmail ] = useState<string>(emailBody);
  const [ tempAttachment, setTempAttachment ] = useState<any[]>([]);
  const [ textEditorContent, setTextEditorContent ] = useState<any>("");
  const attInput = useRef<HTMLInputElement>(null);
  const attSubmit = useRef<HTMLButtonElement>(null);

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

  const s3Upload = (s3Path:string, fileRef:React.RefObject<HTMLInputElement>) => {
    if(fileRef.current&&fileRef.current.files?.length) {
      s3Path = s3Path.replaceAll("/","_"); // can't pass slashes so '_' is replaced in s3.server.ts
      const dataTransfer = new DataTransfer();
      const profileImg = fileRef.current.files[0];
      setTempAttachment((prev:any) => [...prev,{ContentLength: profileImg.size, ContentType: profileImg.type}]);
      const blob = profileImg.slice(0, profileImg.size, profileImg.type); 
      const imgExtension = profileImg.name.split(".").at(-1);
      const newFileName = s3Path + uuidv4() + "." + imgExtension;
      const newFile = new File([blob], newFileName, {type: profileImg.type});
      dataTransfer.items.add(newFile);
      fileRef.current!.files = dataTransfer.files;
      return newFile;
    }
    return false;
  }

  const uploadAttachments = () => {
    const fileRenamed:Blob|false = s3Upload("images/emailAttachments/", attInput)
    if( fileRenamed && attSubmit.current ) {
      attSubmit.current.click();
    }
  }

  useEffect(() => {
    setAttachments([]);
    setCleanEmail(attToImg(cleanEmail,newEmail.attachments));
  },[])

  useEffect(() => {
    if(attachFetch.state==="submitting") emNotif(true, "Uploading file")
    if(attachFetch.type==="done") {
      if(attachFetch.data?.imgSrc) {
        const cloneAtts = [...tempAttachment];
        const finishedAtts = cloneAtts.map((tempAtt:any, i:number) => {
          if(attachFetch.data.imgSrc.ContentLength===tempAtt.ContentLength) {
            return {...tempAtt, 
              file: attachFetch.data.imgSrc.file.replace("https://s3.amazonaws.com/pg.mccullo.ug/","/api/media/"),
              name: attachFetch.data.imgSrc.file.split("/").at(-1),
              Name: attachFetch.data.imgSrc.file.split("/").at(-1),
              ContentID: attachFetch.data.imgSrc.file.split("/").at(-1).split(".")[0]
            }}
          }
        )
        const noUndefinedAtts = finishedAtts.filter((att:any) => att != null);
        setAttachments((prev:any) => {
          const deDup: number[] = [];
          const cleanObj: any[] = [];
          prev.forEach((att:any) => {
            if(!deDup.includes(att.ContentLength)) {
              deDup.push(att.ContentLength)
              cleanObj.push(att);
            }
          });
          noUndefinedAtts.forEach((att:any) => {
            if(!deDup.includes(att.ContentLength)) {
              deDup.push(att.ContentLength)
              cleanObj.push(att);
            }
          });
          editNewEmail((prev: any) => {return {...prev,attachments: cleanObj}});
          return cleanObj;
        });
        emNotif(false);
      }
    }
  },[attachFetch, setAttachments, editNewEmail])

  useEffect(() => {
    editNewEmail({...newEmail, body: textEditorContent});
  },[textEditorContent])

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
        <attachFetch.Form 
          method="post" 
          action="/api/upload?index" 
          encType="multipart/form-data"
          style={{display: "none"}}
        >
          <input 
            type="file"
            name="img" 
            onChange={uploadAttachments}
            ref={attInput}
          />
          <button ref={attSubmit} />
        </attachFetch.Form>
        {attachments.length?
          <div className="email-attachments">
            {attachments.map((dl:any) =>
              dl?.file&&dl?.name
              ?<div className="email-attachments__file" key={dl.file}>
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
              :<></>
            )}
          </div>
        :""}
        <TextEditor 
          //appendComplexHTML={cleanEmail}
          attachmentAction={() => attInput.current?.click()}
          contentStateSetter={setTextEditorContent}
          htmlString={cleanEmail}
          placeholderText={`Compose email...`}
          tbProps={{hidden:false, sticky:true}}
        />
      </div>
    </>
  )
}