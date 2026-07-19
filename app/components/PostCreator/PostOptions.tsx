import { useState } from "react";

export const PostOptions: React.FC<{
  setPostPrivacy: any,
  submitPost: (opts?: { state?: "draft" | "scheduled"; scheduledFor?: number }) => void,
}> = ({setPostPrivacy, submitPost}) => {
  const [showSchedule, setShowSchedule] = useState<boolean>(false);
  const [scheduleValue, setScheduleValue] = useState<string>(() => {
    // Default the picker to "1 hour from now" so opening it feels
    // useful rather than showing a zero value.
    const d = new Date(Date.now() + 60 * 60 * 1000);
    // datetime-local wants "YYYY-MM-DDTHH:MM" in *local* time.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const submitScheduled = () => {
    const localDate = new Date(scheduleValue);
    if (isNaN(localDate.getTime())) return;
    submitPost({ state: "scheduled", scheduledFor: Math.floor(localDate.getTime() / 1000) });
    setShowSchedule(false);
  };

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

      {/* Post / Save Draft / Schedule — three actions on the same row.
          Schedule reveals a datetime picker + confirm button beneath. */}
      <button
        onClick={() => submitPost()}
        className="upload__feedback__submit"
      >POST</button>
      <button
        onClick={() => submitPost({ state: "draft" })}
        className="upload__feedback__submit upload__feedback__submit--ghost"
        style={{ marginLeft: 4 }}
      >SAVE DRAFT</button>
      <button
        onClick={() => setShowSchedule((v) => !v)}
        className="upload__feedback__submit upload__feedback__submit--ghost"
        style={{ marginLeft: 4 }}
      >SCHEDULE</button>

      {showSchedule ? (
        <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="datetime-local"
            value={scheduleValue}
            onChange={(e) => setScheduleValue(e.target.value)}
            style={{
              padding: "4px 6px",
              fontFamily: "'PGM Sans', sans-serif",
              fontSize: 13,
              border: "1px solid #979997",
              borderRadius: 4,
            }}
          />
          <button
            onClick={submitScheduled}
            className="upload__feedback__submit"
          >SCHEDULE POST</button>
        </div>
      ) : null}

      <style>{`
        /* Ghost variant of the submit button — matches the site's
           existing button chrome but with a lighter surface so the
           primary POST button still reads as primary. */
        .upload__feedback__submit--ghost,
        .upload__feedback__submit--ghost:visited {
          background: #fff !important;
          color: #4A6CBA !important;
          border: 1px solid #979997 !important;
        }
        .upload__feedback__submit--ghost:hover {
          background: #f3f3f3 !important;
          color: #506982 !important;
        }
      `}</style>
    </div>
  )
}
