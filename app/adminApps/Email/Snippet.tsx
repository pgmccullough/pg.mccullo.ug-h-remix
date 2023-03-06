export const Snippet: React.FC<{ email: any, emailBlock: any, setEmailBlock: any }> = ({ email, emailBlock, setEmailBlock }) => {
  return (
    <div className={`snippet${email.unread?" snippet--unread":""}`} onClick={() => {setEmailBlock({...emailBlock, view: "email", activeEmailId: email._id})}}>
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