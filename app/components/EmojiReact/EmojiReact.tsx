import { useEffect, useState } from 'react';
import { Post } from '~/common/types';
import { emojis } from '~/common/emojis';

export const EmojiReact: React.FC<{likes: any, postId: string}> = ({ likes, postId }) => {
  const [ emojiVisibility, setEmojiVisibility ] = useState<boolean>(false);
  const [ guestUUID, setGuestUUID ] = useState<string>("anon");
  const [tempStore, setTempStore] = useState<{[key:string]: any[]}>({})

  useEffect(() => { 
    setGuestUUID(window.localStorage.guestUUID||"anon");
    const randomReactsToPlayWith = {
      "😆":["a","b","c"],
      "😂":[window.localStorage.guestUUID,"b","c"],
      "🤣":["a"],
      "😊":[window.localStorage.guestUUID],
      "🥰":["a","c"],
      "😛":["a","b","c"],
      "🤬":["a","b"],
      "🤯":["a","b","c","a","b","c","a","b","c"],
      "😳":[window.localStorage.guestUUID,"b","c","d"],
      "💀":["a","c","a","b"],
    }
    setTempStore(randomReactsToPlayWith)
  },[])

  const clickEmoji = (emoji: string) => {
    const cloneTS = {...tempStore};
    if(cloneTS[emoji]) { // emoji is on this post already
      if(cloneTS[emoji].includes(guestUUID)) {
        cloneTS[emoji] = cloneTS[emoji].filter((guest:string) => guest !== guestUUID);
        if(!cloneTS[emoji].length) delete cloneTS[emoji];
      } else {
        cloneTS[emoji].push(guestUUID);
        console.log("adding first of one");
      }
    } else {
      cloneTS[emoji] = [ guestUUID ];
    }
    setTempStore(cloneTS);
  }

  return (
    <>
      <div
        className={`click-away-bg${emojiVisibility?" click-away-bg--active":""}`} 
        onClick={() => setEmojiVisibility(false)}
      />
      <div className={`emoji-container${emojiVisibility?" emoji-container--active":""}`}>
        <div className="emoji-container__inner">
          {emojis.map(emoji => <span key={emoji+"_"+postId+"_1"} className="emoji" onClick={() => clickEmoji(emoji)}>{emoji}</span>)}
        </div>
      </div>
      <div className="emoji-button-and-votes">
        <button className="react-button" onClick={() => setEmojiVisibility(!emojiVisibility)}>😀 REACT</button>
        {Object.keys(tempStore).length
          ?<div className="emoji-votes">
            {
              // Object.keys(tempStore).map((emoji:string, index: number) =>
              Object.keys(tempStore)
                .map((emoji, index) => [emoji,tempStore[emoji]])
                .sort((a,b) => b[1].length-a[1].length)
                .map(([emoji, likes]:any[], index) =>
                <div 
                  key={emoji+postId+"_2_"+index} 
                  className={`emoji-vote${likes.includes(guestUUID)?" emoji-vote--mine":""}`}
                  onClick={() => clickEmoji(emoji)}
                >
                  <div className="emoji-vote-emoji">{emoji}</div><div className="emoji-vote-count">{tempStore[emoji].length}</div>
                </div>
              )
            }
          </div>
          :""
        }
      </div>
    </>
  )
}