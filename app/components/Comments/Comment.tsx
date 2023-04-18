import { useCallback, useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";

interface CommentI {
  id: string,
  parentId: string|null,
  timestamp: number,
  userId: string,
  body: string
}

export const Comment: React.FC<
{ comment: CommentI  }
> = ({ comment }) => {

  const [ onlyCheckOnce, setOnlyCheckOnce ] = useState<boolean>(false);
  const [ commenterData, setCommenterData ] = useState<{name: string, image: string}>({name: " ", image: ""})


  const commenter = useFetcher();

  useEffect(() => {
      {commenter.submit(
        { userId: comment.userId },
        { method: "post", action: `/api/user/fetch?index` }
      )}
    },[])

  useEffect(() => {
    if(commenter.data?.userObj) {
      const first_name = commenter.data.userObj.first_name;
      const last_name = commenter.data.userObj.last_name;
      const profImage = commenter.data.userObj.profile_image.image;
      setCommenterData({name: first_name+" "+last_name, image: profImage});
      commenter.data.userObj = null;
    }
  },[commenter, setCommenterData])

  return (
    <>
      <div key={comment.id} className="comment">
        <div className="comment__poster">
          <div className="comment__user-image">{commenterData.image}</div>
        </div>
        <div className="comment__content">
          {commenterData.name}
          <div className="comment__content-inner" dangerouslySetInnerHTML={{__html: comment.body}} />
          <button>reply</button>
        </div>
      </div>
    </>
  )
}