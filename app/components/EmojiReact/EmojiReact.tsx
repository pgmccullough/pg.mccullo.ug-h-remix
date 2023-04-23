import { useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { emojis } from '~/common/emojis';

export const EmojiReact: React.FC<{likes: any, postId: string}> = ({ likes, postId }) => {
  const [ emojiVisibility, setEmojiVisibility ] = useState<boolean>(false);
  const [ guestUUID, setGuestUUID ] = useState<string>("anon");
  const [tempStore, setTempStore] = useState<{[key:string]: any[]}>({})
  const emojiFetch = useFetcher();

  useEffect(() => { 
    setGuestUUID(window.localStorage.guestUUID||"anon");
    setTempStore(likes)
  },[])

  const clickEmoji = (emoji: string) => {
    emojiFetch.submit(
      { postId, emoji, userId: guestUUID },
      { method: "post", action: `/api/post/react?index` }
    );
    const cloneTS = {...tempStore};
    if(cloneTS[emoji]) {
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

  useEffect(() => {
    if(emojiFetch.data?.cloneTS) {
      setTempStore(emojiFetch.data.cloneTS);
      emojiFetch.data.cloneTS = null;
    }
  },[ emojiFetch ])

  return (
    <div className="emoji-parent">
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
        {tempStore&&Object.keys(tempStore).length
          ?<div className="emoji-votes">
            {
              Object.keys(tempStore)
                .map((emoji) => [emoji,tempStore[emoji]])
                .sort((a,b) => b[1].length-a[1].length)
                .map(([emoji, likes]:any[], index) =>
                  index < 6
                  ?<div 
                    key={emoji+postId+"_2_"+index} 
                    className={`emoji-vote${likes.includes(guestUUID)?" emoji-vote--mine":""}`}
                    onClick={() => clickEmoji(emoji)}
                  >
                    <div className="emoji-vote-emoji">{emoji}</div><div className="emoji-vote-count">{tempStore[emoji].length}</div>
                  </div>
                  :""
                )
            }
            {Object.keys(tempStore).length>6
              ?<div className="emoji-votes-remnants">
                {Object.keys(tempStore).reduce((a,_c) => a+1, -6)} others x
                {Object.keys(tempStore).reduce((a,c) => 
                  a+(Object.keys(tempStore).indexOf(c) >= 6?tempStore[c].length:0), 0)}
              </div>
              :""}
          </div>
          :""
        }
      </div>
    </div>
  )
}