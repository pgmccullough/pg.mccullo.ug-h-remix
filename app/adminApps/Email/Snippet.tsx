import { EmailInterface } from '~/common/types';

export const Snippet: React.FC<{ email: any, emailBlock: {view: String, emails: EmailInterface[], activeEmailId: String}, setEmailBlock: any }> = ({ email, emailBlock, setEmailBlock }) => {
  
  const markRead = () => {
    emailBlock.emails.map(itEmail => {
      itEmail._id === email._id?itEmail.unread=0:"";
      return itEmail;
    })
    setEmailBlock({...emailBlock, view: "email", activeEmailId: email._id})
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