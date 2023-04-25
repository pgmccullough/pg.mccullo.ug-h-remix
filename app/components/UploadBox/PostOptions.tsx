export const PostOptions: React.FC = () => {
  return (
    <div className="upload__feedback">
      <div className='upload__feedback__checkbox'>
        <label className="upload__feedback__checkbox__label">Likes
          <input type="checkbox" className="upload__feedback__checkbox__input" />
        </label>
      </div>
      <div className='upload__feedback__checkbox'>
        <label className="upload__feedback__checkbox__label">Comments
          <input type="checkbox" className="upload__feedback__checkbox__input" />
        </label>
      </div>
      <div className='upload__feedback__checkbox'>
        <label className="upload__feedback__checkbox__label">Shares
            <input type="checkbox" className="upload__feedback__checkbox__input" />
        </label>
      </div>
      <br />
      <select 
        className="upload__feedback__privacy"
      >
        <option>Public</option>
        <option>Followers</option>
        <option>Friends</option>
        <option>Self</option>
        <option>Save Media</option>
      </select>
      <button className="upload__feedback__submit">POST</button>
    </div>
  )
}