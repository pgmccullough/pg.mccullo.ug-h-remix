import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { TextEditor } from "../TextEditor/TextEditor";
import { Comment } from "./Comment";
import { SignInModal } from "../SignInModal/SignInModal";
import * as gtag from "~/utils/gtags.client";
 
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
  const [ clearContent, setClearContent ] = useState<boolean>(false);
  const [ showSignInModal, setShowSignInModal ] = useState<boolean>(false);

  const { user } = useLoaderData<{
    user: {id: string, user_name: string, role: string, first_name: string, last_name: string, profile_image: string},
  }>();

  const postComment = useFetcher<{ newCommentObj?: CommentI[]; error?: string }>();

  useEffect(() => {
    if(postComment.data?.newCommentObj) {
      setInStateComments(postComment.data.newCommentObj);
      // Don't mutate fetcher.data — it's frozen in v7.
      setClearContent(true);
      gtag.event({
        action: "comment_posted",
        category: "engagement",
        label: postId,
        value: "",
      });
    }
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
              key={comment.id}
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
                  key={subComment.id}
                  comment={subComment}  
                  inStateComments={inStateComments}
                  postId={postId} 
                  setInStateComments={setInStateComments}
                  user={user}
                />
              )
          
        )
      }
      {user?.id
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
            {/* userId is no longer trusted from the client — the server
                pulls it from the session cookie. */}
            <button>SUBMIT</button>
          </postComment.Form>
        </>
        :<>
          <style>{`
            .comment-signin {
              margin: 12px 0 4px 0;
            }
            /* NOTE: deliberately not resetting margin on the button so
               it keeps the global 0 8px margin from _global.scss and
               lines up horizontally with the React button. */
            .comment-signin__btn,
            .comment-signin__btn:visited {
              height: auto;
              display: inline-block;
              padding: 6px 14px;
              background: #4A6CBA;
              color: #fff;
              font: 600 12px 'PGM Sans', sans-serif;
              letter-spacing: 0.02em;
              border: 0;
              border-radius: 4px;
              text-decoration: none;
              line-height: 1.2;
              cursor: pointer;
              transition: box-shadow 0.2s ease, background-color 0.15s ease;
              box-sizing: border-box;
            }
            .comment-signin__btn:hover,
            .comment-signin__btn:focus-visible {
              background: #506982;
              box-shadow: 0 0 0 3px #ccc;
              outline: none;
            }
          `}</style>
          <div className="comment-signin">
            <button
              type="button"
              className="comment-signin__btn"
              onClick={() => setShowSignInModal(true)}
            >
              Sign in to comment
            </button>
          </div>
          {showSignInModal && (
            <SignInModal onClose={() => setShowSignInModal(false)} />
          )}
        </>}
    </>
  )
};