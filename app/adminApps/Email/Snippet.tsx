import { EmailInterface } from '~/common/types';

export const Snippet: React.FC<{ 
    alterEmailArray: any,
    email: EmailInterface, 
    emailArray: EmailInterface[],
    setCurrentEmail: any
}> = ({ alterEmailArray, email, emailArray, setCurrentEmail }) => {
  
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
    <div className={`snippet${email.unread?" snippet--unread":""}`} onClick={markRead}>
      <div className="snippet__from">
        { email.FromName || email.From }
      </div>
        {email.Attachments?.length>0
          ?<div style={{fontSize:"30px"}}>
            {email.Attachments.length}
          </div>
          :""}
      <div className="snippet__subject">
        {email.Subject}
      </div>
      <div className="snippet__date">
        {email.Date}
      </div>
    </div>
  )
}