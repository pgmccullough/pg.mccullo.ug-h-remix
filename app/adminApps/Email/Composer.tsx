import { useState } from 'react';
import { EmailInterface } from '~/common/types';

export const Composer: React.FC<{ 
  editNewEmail: any, email: EmailInterface, emailBodyRef: any, newEmail: any
}> = ({ editNewEmail, email, emailBodyRef, newEmail }) => {

  const [ formatButton, toggleFormatButton ] = useState({bold: false, italic: false, underline: false, strikethrough: false, code: false})
  
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
      <div 
        className="email__body"
        contentEditable={true}
        onKeyUp={() => editNewEmail({...newEmail, body: emailBodyRef.current.innerHTML})}
        ref={ emailBodyRef }
      >
        <br /><br />
        {email.FromName||email.Subject||email.Date
          ?<>
            <hr />
              <b>From:</b> { email.FromName?email.FromName+" <"+email.From+">":email.From}<br />
              <b>Sent: </b> { email.Date } <br />
              <b>To: </b> { email.To } <br />
              <b>Subject:</b> { email?.Subject||"" } <br />
              <p dangerouslySetInnerHTML={{__html: email.HtmlBody.replace(/(<style[\w\W]+style>)/g, "")||email.TextBody}} />
          </>
          :""}
      </div>
    </>
  )
}