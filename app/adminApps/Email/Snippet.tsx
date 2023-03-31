import { EmailInterface } from '~/common/types';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime)
dayjs().format();
dayjs.locale('en');

export const Snippet: React.FC<{ 
    alterEmailArray: any,
    checkedSnippets: string[],
    currentEmail: any,
    email: EmailInterface, 
    emailArray: EmailInterface[],
    setCheckedSnippets: any,
    setCurrentEmail: any
}> = ({ alterEmailArray, checkedSnippets, currentEmail, email, emailArray, setCheckedSnippets, setCurrentEmail }) => {
  
  const markRead = () => {
    let newEmailArr:EmailInterface[] = [];
    emailArray.forEach(itEmail => {
      itEmail._id === email._id?itEmail.unread=0:"";
      newEmailArr.push(itEmail);
    })
    alterEmailArray(newEmailArr);
    setCurrentEmail({ view: "email", composeType: null, id: email._id });
  }
  
  return (
    <div className={`snippet${email.unread?" snippet--unread":""}`}>
      <div className="snippet__check" onClick={() =>
        setCheckedSnippets((prev:any) =>
          prev.includes(email._id)
          ?[...prev.filter((checked:string)=>checked!==email._id)]
          :[...prev,email._id]
        )
      }>
        <input 
          type="checkbox"
          checked={!!checkedSnippets.find((match:string)=>match===email._id)}
          onChange={() =>
            setCheckedSnippets((prev:any) =>
              prev.includes(email._id)
              ?[...prev.filter((checked:string)=>checked!==email._id)]
              :[...prev,email._id]
            )
          }
        />
      </div>
      <div className="snippet__from" onClick={markRead}>
        { currentEmail.view==="inbox"
          ?email.FromName || email.From
          :email.To
        }
      </div>
        {email.Attachments?.length>0
          ?<div style={{fontSize:"30px"}} onClick={markRead}>
            {email.Attachments.length}
          </div>
          :""}
      <div className="snippet__subject" onClick={markRead}>
        {email.Subject}
      </div>
      <div className="snippet__date" onClick={markRead}>
        {dayjs(Date.parse(email.Date)).fromNow()}
      </div>
      {currentEmail.view==="outbox"
        ?<div className={`snippet__status ${email.Opened?'snippet__status--opened':''}`}>
          {email.Opened
            ?<div className="snippet__status--opened__popup">{email.Opened}</div>
            :<></>
          }
        </div>
        :""
      }
    </div>
  )
}