import { useState } from 'react';
import { Post } from '~/common/types';
import { emojis } from '~/common/emojis';

export const EmojiReact: React.FC<{likes: any}> = (likes) => {

  const [ emojiVisibility, setEmojiVisibility ] = useState<boolean>(false);

  const [tempStore, setTempStore] = useState<{[key:string]: any[]}>({})

  const clickEmoji = (emoji: string) => {
    const cloneTS = {...tempStore};
    cloneTS[emoji]?cloneTS[emoji].push("myip?"):cloneTS[emoji]=["myip?"];
    setTempStore(cloneTS);
    console.log(cloneTS);
  }

  return (
    <>
      <div
        className={`click-away-bg${emojiVisibility?" click-away-bg--active":""}`} 
        onClick={() => setEmojiVisibility(false)}
      />
      <div className={`emoji-container${emojiVisibility?" emoji-container--active":""}`}>
        <div className="emoji-container__inner">
          {emojis.map(emoji => <span className="emoji" onClick={() => clickEmoji(emoji)}>{emoji}</span>)}
        </div>
      </div>
      <button className="react-button" onClick={() => setEmojiVisibility(!emojiVisibility)}>😀 REACT</button>
      {Object.keys(tempStore).map((emoji:string, index: number) => <>{emoji} {tempStore[emoji].length}</>)}
    </>
  )
}