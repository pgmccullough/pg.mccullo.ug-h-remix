import { ActionFunction, LinksFunction, json, LoaderFunction } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useSearchParams } from "@remix-run/react";
import { createUserSession, login } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import { SignInModal } from "~/components/SignInModal/SignInModal";
import { clientPromise } from "~/lib/mongodb";


/* temp import */
import { useEffect, useState } from "react"
import { GitHubLogo } from "~/assets/svgs/GitHubLogo";
import { GoogleLogo } from "~/assets/svgs/GoogleLogo";
/* end temp */

export const loader: LoaderFunction = async ({ request }) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const posts = await db.collection("myPosts").find({ privacy : "Public" }).sort({created:-1}).limit(25).toArray();
  return { posts };
}

export const action: ActionFunction = async ({ request }) => {
  const form = await request.formData();
  const username = form.get("username");
  const password = form.get("password");
  const redirectTo = form.get("redirectTo") || "/h/"

  const fields = { username, password };
  const fieldErrors = {
      username,
      password,
  };

  const user = await login({ username, password });
  console.log({ user });
  if (!user) {
    return "error";
  }
  return createUserSession(user.id, redirectTo);

}

export default function Index() {
  const { posts } = useLoaderData();
  const actionData = useActionData();
  const [searchParams] = useSearchParams();

  /* more temp stuff */
            const registerOrLoginInit = 2;
            const [loginError, setLoginError] = useState(null);
            const [regVisibility, setRegVisibility] = useState(true);
            const [registerOrLogin, setRegisterOrLogin] = useState(registerOrLoginInit);

            const cancelLogin = () => {
              setRegVisibility(!regVisibility);
            }

            const toggleRegisterOrLogin = () => {
              setRegisterOrLogin((prev:any) =>
                prev===1?2:1
              )
            }

            useEffect(() => {
              !regVisibility?window.history.pushState({}, '', '/h/'):null;
            },[regVisibility])

  /* end more temp stuff */

  return (
    <>
      {/* <SignInModal 
        registerOrLoginInit={2}
        actionData={actionData}
      /> */}


      {/* direct temp import */}

                        <>
                        {regVisibility?
                              <div className="register">
                                  <div className="register__background" onClick={cancelLogin} />
                                  <div className="register__card">
                                      <div className="register__card__button" onClick={cancelLogin}><p className="register__card__button__x">+</p></div>

                                      <div className="register__card__head">{registerOrLogin===1?"Create your account":"Log in"}</div>
                                      <div className="register__card__body">
                                          <div className="register__card__body__apis">
                                              <a href={`#`} className="register__card__body__apis__button">
                                                  <div className="register__card__body__apis__button__item"><GoogleLogo /></div>
                                                  <div className="register__card__body__apis__button__item">Google</div>
                                              </a>
                                              <a href={`#`} className="register__card__body__apis__button">
                                                  <div className="register__card__body__apis__button__item"><GitHubLogo /></div>
                                                  <div className="register__card__body__apis__button__item">GitHub</div>
                                              </a>
                                          </div>
                                          <div className="register__card__body__or">or</div>
                                          {registerOrLogin===1?
                                          <>
                                          {/* <form className="register__card__body__signup" method="post">
                                              <input type="text" name="user_name" placeholder="User name" className="register__card__body__input" />
                                              <input type="text" name="first_name" placeholder="First name" className="register__card__body__input" />
                                              <input type="text" name="last_name" placeholder="Last name" className="register__card__body__input" />
                                              <input type="text" name="email" placeholder="Email" className="register__card__body__input" />
                                              <input type="password" name="password" placeholder="Password" className="register__card__body__input" />
                                              <input type="password" name="confirm_password" placeholder="Confirm Password" className="register__card__body__input" />
                                              {loginError?<div className="register__card__body__signup__error">{loginError}</div>:<div className="register__card__body__signup__error"></div>}
                                              <button className="register__card__body__button">SIGN UP</button>
                                          </form>
                                          <div className="register__card__body__login">Already registered? <a href="#" onClick={toggleRegisterOrLogin}>Log in</a>.</div> */}
                                          </>
                                          :
                                          <>
                                          <Form className="register__card__body__signup" method="post">
                                      <input
                                          type="hidden"
                                          name="redirectTo"
                                          value={
                                              searchParams.get("redirectTo") ?? undefined
                                          }
                                      />
                                              <input type="text" name="username" placeholder="User name" className="register__card__body__input" />
                                              <input type="password" name="password" placeholder="Password" className="register__card__body__input" />
                                              {loginError?<div className="register__card__body__signup__error">{actionData?.fieldErrors?.username}</div>:<div className="register__card__body__signup__error"></div>}
                                              <button className="register__card__body__button">LOG IN</button>
                                          </Form>
                                          <div className="register__card__body__login">Don't have an account? <a href="#" onClick={toggleRegisterOrLogin}>Sign up</a>.</div>
                                          </>
                                          }
                                      </div>
                                  </div>
                              </div>
                          :""}
                      </>
    {/* end direct temp import */}


      {posts?.map((post:any) =>
          <PostCard 
              key={post._id} 
              post={post}
          />
      )}
    </>
  );
}