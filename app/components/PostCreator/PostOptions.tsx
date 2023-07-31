export const PostOptions: React.FC<{
  setPostPrivacy: any, submitPost: any
}> = ({setPostPrivacy, submitPost}) => {
  return (
    <div className="upload__feedback">
      <div className='upload__feedback__checkbox'>
        <label className="upload__feedback__checkbox__label">Likes
          <input 
            type="checkbox"
            className="upload__feedback__checkbox__input" 
            onChange={(e) => setPostPrivacy("likesOn",e.target.checked)}
          />
        </label>
      </div>
      <div className='upload__feedback__checkbox'>
        <label className="upload__feedback__checkbox__label">Comments
          <input
            type="checkbox"
            className="upload__feedback__checkbox__input"
            onChange={(e) => setPostPrivacy("commentsOn",e.target.checked)}
          />
        </label>
      </div>
      <div className='upload__feedback__checkbox'>
        <label className="upload__feedback__checkbox__label">Shares
          <input 
            type="checkbox" 
            className="upload__feedback__checkbox__input" 
            onChange={(e) => setPostPrivacy("sharesOn",e.target.checked)}
          />
        </label>
      </div>
      <br />
      <select 
        className="upload__feedback__privacy"
        onChange={(e) => setPostPrivacy("privacy",e.target.value)}
      >
        <option>Public</option>
        <option>Followers</option>
        <option>Friends</option>
        <option>Self</option>
        <option>Save Media</option>
        <option>Story</option>
      </select>
      <button onClick={submitPost} className="upload__feedback__submit">POST</button>
    </div>
  )
}