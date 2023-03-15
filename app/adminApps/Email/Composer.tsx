import { useState } from 'react';

export const Composer: React.FC<{ curEmail: any, emailBlock: any, emailBodyRef: any, emailForm: any, setEmailBlock: any, setEmailForm: any }> = ({ curEmail, emailBlock, emailBodyRef, emailForm, setEmailBlock, setEmailForm }) => {

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
            onChange={(e) => setEmailForm({...emailForm, [e.target.name]:e.target.value})}
            value={emailForm.to}
          />
        </div>
        <div className="email__input">
          <label htmlFor="email__input--cc">Cc</label>
          <input 
            type="text" 
            id="email__input--cc"
            name="cc"
            onChange={(e) => setEmailForm({...emailForm, [e.target.name]:e.target.value})}
            value={emailForm.cc}
          />
        </div>
        <div className="email__input">
          <label htmlFor="email__input--bcc">Bcc</label>
          <input
            type="text"
            id="email__input--bcc"
            name="bcc"
            onChange={(e) => setEmailForm({...emailForm, [e.target.name]:e.target.value})}
            value={emailForm.bcc}
          />
        </div>
        <div className="email__input">
          <label htmlFor="email__input--subject">Subject</label>
          <input
            type="text"
            id="email__input--subject"
            name="subject"
            onChange={(e) => setEmailForm({...emailForm, [e.target.name]:e.target.value})}
            value={emailForm.subject}
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
        onKeyDown={() => setEmailForm({...emailForm, content: emailBodyRef.current.innerHTML})}
        ref={ emailBodyRef }
      >
        <br /><br />
        {curEmail.FromName||curEmail.Subject||curEmail.Date
          ?<>
            <hr />
            <b>From:</b> {curEmail.FromName?curEmail.FromName+" <"+curEmail.From+">":curEmail.From}<br />
            <b>Sent: </b><br />
            <b>To: </b> { curEmail.Date} <br />
            <b>Subject:</b> { curEmail?.Subject||"" } <br />
            <p dangerouslySetInnerHTML={{__html: curEmail.HtmlBody||curEmail.TextBody}} />
            </>
          :""}
      </div>
    </>
  )
}