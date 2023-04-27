import { useEffect, useState } from "react"
import { useFetcher, Link } from "@remix-run/react";
import { GitHubLogo } from "~/assets/svgs/GitHubLogo";
import { GoogleLogo } from "~/assets/svgs/GoogleLogo";

export const SignInModal: React.FC = () => {
  const loginForm = useFetcher();
  const registerForm = useFetcher();
  const [loginError, setLoginError] = useState<string|null>(null);
  const [isRegister, setIsRegister] = useState<boolean>(false);

  useEffect(() => {
    if(registerForm.data?.registered) {
      registerForm.data.registered = null;
    }
  },[ registerForm ])

  useEffect(() => {
    if(loginForm.data?.logInError) {
      setLoginError(loginForm.data.logInError);
      loginForm.data.logInError = null;
    }
  },[ loginForm ])

  return (
    <>
      <div className="register">
        <Link className="register__background" to="/h" />
        <div className="register__card">
          <Link className="register__card__button" to="/h">
            <p className="register__card__button__x">+</p>
          </Link>
          <div className="register__card__head">
            {isRegister?"Create your account":"Log in"}
          </div>
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
              {isRegister
                ?<>
                  <registerForm.Form
                    className="register__card__body__signup"
                    method="post"
                    action={`/api/user/register?index`}
                  >
                    <input type="text" name="username" placeholder="Username" className="register__card__body__input" />
                    <input type="text" name="first_name" placeholder="First name" className="register__card__body__input" />
                    <input type="text" name="last_name" placeholder="Last name" className="register__card__body__input" />
                    <input type="text" name="email" placeholder="Email" className="register__card__body__input" />
                    <input type="password" name="password" placeholder="Password" className="register__card__body__input" />
                    <input type="password" name="confirm_password" placeholder="Confirm Password" className="register__card__body__input" />
                    {loginError
                      ?<div className="register__card__body__signup__error">{loginError}</div>
                      :<div className="register__card__body__signup__error"></div>
                    }
                    <button className="register__card__body__button">SIGN UP</button>
                  </registerForm.Form>
                  <div className="register__card__body__login">Already registered? <a href="/h/login" onClick={(e) => {e.preventDefault(); setIsRegister(false)}}>Log in</a>.</div>
                </>
                :<>
                  <loginForm.Form
                    className="register__card__body__signup"
                    method="post"
                    action={`/api/user/login?index`}
                  >
                    <input type="text" name="username" placeholder="User name" className="register__card__body__input" />
                    <input type="password" name="password" placeholder="Password" className="register__card__body__input" />
                    {loginError
                      ?<div className="register__card__body__signup__error">{loginError}</div>
                      :<div className="register__card__body__signup__error"></div>
                    }
                    <button className="register__card__body__button">LOG IN</button>
                  </loginForm.Form>
                  <div className="register__card__body__login">Don't have an account? <a href="/h/login" onClick={(e) => {e.preventDefault(); setIsRegister(true)}}>Sign up</a>.</div>
                </>
              }
          </div>
        </div>
      </div>
    </>
  )
}