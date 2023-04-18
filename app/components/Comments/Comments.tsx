import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { TextEditor } from "../TextEditor/TextEditor";
import { Comment } from "./Comment";
 
export interface CommentI {
  id: string,
  parentId: string|null,
  timestamp: number,
  userId: string,
  body: string
}

export const Comments: React.FC<
  { comments: CommentI[], postId: string }
> = ({ comments, postId }) => {

  const [ inStateComments, setInStateComments ] = useState<CommentI[]>(comments);
  const [ commentBody, setCommentBody ] = useState<string>("");
  const [ guestUUID, setGuestUUID ] = useState<string>("");
  const [ clearContent, setClearContent ] = useState<boolean>(false);
  
  const { user } = useLoaderData<{
    user: {id: string, user_name: string, role: string, first_name: string, last_name: string, profile_image: string},
  }>();

  const postComment = useFetcher();

  useEffect(() => {
    if(postComment.data?.newCommentObj) {
      setInStateComments(postComment.data.newCommentObj);
      delete postComment.data.newCommentObj;
      setClearContent(true);
    }
    setGuestUUID(user?.id||window.localStorage.guestUUID||"anon");
  },[ postComment ]);

  useEffect(() => {
    setClearContent(false);
  },[commentBody])

  return (
    <>
      {inStateComments&&inStateComments
        .sort((a:CommentI, b:CommentI) => a.timestamp - b.timestamp)
        .map((comment: CommentI) => 
          !comment.parentId
            ?<Comment
              comment={comment}  
              inStateComments={inStateComments}
              postId={postId} 
              setInStateComments={setInStateComments}
              user={user}
            />
            :inStateComments
              .filter((subComment: CommentI) => subComment.parentId === comment.id)
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((subComment: CommentI) => 
                <Comment 
                  comment={subComment}  
                  inStateComments={inStateComments}
                  postId={postId} 
                  setInStateComments={setInStateComments}
                  user={user}
                />
              )
          
        )
      }
      {user?.role === "administrator"
        ?<>
          <TextEditor 
            contentStateSetter={setCommentBody}
            clearContent={clearContent}
            placeholderText={"Write a comment..."}
            styleClass={"comment__input"}
          />
          <postComment.Form
            method="post"
            action={`/api/comment/new?index`}
          >
            <input 
              name="commentBody"
              type="hidden"
              value={commentBody}
            />
            <input 
              name="postId"
              type="hidden"
              value={postId}
            />
            <input 
              name="userId"
              type="hidden"
              value={guestUUID}
            />
            <button>SUBMIT</button>
          </postComment.Form>
        </>
        :""}
    </>
  )
};