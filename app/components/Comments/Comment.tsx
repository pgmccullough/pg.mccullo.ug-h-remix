import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "@remix-run/react";
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import relativeTime from 'dayjs/plugin/relativeTime';
import advancedFormat from 'dayjs/plugin/advancedFormat';
dayjs.extend(relativeTime)
dayjs.extend(advancedFormat)
dayjs().format();
dayjs.locale('en');

interface CommentI {
  id: string,
  parentId: string|null,
  timestamp: number,
  userId: string,
  body: string
}

export const Comment: React.FC<{
  comment: CommentI, 
  postId: string, 
  inStateComments: CommentI[], 
  setInStateComments: any, 
  user: {
    id: string, 
    user_name: string, 
    role: string, 
    first_name: string, 
    last_name: string, 
    profile_image: string
  }
}> = ({ comment, inStateComments, postId, setInStateComments, user }) => {

  const [ commenterData, setCommenterData ] = useState<{name: string, image: string}>({name: "", image: ""})

  const commenter = useFetcher();
  const commentDeleter = useFetcher();

  useEffect(() => {
      {commenter.submit(
        { userId: comment.userId },
        { method: "post", action: `/api/user/fetch?index` }
      )}
    },[ inStateComments ])

  useEffect(() => {
    if(commenter.data?.userObj) {
      const { first_name, last_name, profile_image } = commenter.data.userObj;
      const profImage = profile_image.image;
      setCommenterData({name: first_name+" "+last_name, image: profImage});
      commenter.data.userObj = null;
    }
  },[commenter, setCommenterData]);

  useEffect(() => {
    if(commentDeleter.data?.deleteCommentObj) {
      setInStateComments(commentDeleter.data.deleteCommentObj);
      commentDeleter.data.deleteCommentObj = null;
    }
  },[ commentDeleter ])

  const deleteComment = (commentId:string) => {
    {commentDeleter.submit(
      { userId: comment.userId, commentId, postId, parentId: comment.parentId||"" },
      { method: "post", action: `/api/comment/delete?index` }
    )}
  }

  return (
    <div key={comment.id} className="comment">
      <div className="comment__poster">
        <div className="comment__user-image">
          {commenterData.image
            ?<img className="comment__user-image--img" src={commenterData.image} alt={commenterData.name}/>
            :""
          }
        </div>
      </div>
      <div className="comment__content">
        <div className="comment__user-name">{commenterData.name||"Unknown user"}</div>
        <div className="comment__date">{dayjs().to(dayjs(comment.timestamp))}</div>
        <div className="comment__content-inner" dangerouslySetInnerHTML={{__html: comment.body}} />
        {user?.role==="administrator"
          ?<>
            <button>REPLY</button>
            <button onClick={() => deleteComment(comment.id)}>DELETE</button>
          </>
          :""
        }
        </div>
    </div>
  )
}