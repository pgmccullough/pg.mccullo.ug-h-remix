import axios from "axios";
import { useEffect, useState } from "react"
import { GitHubLogo } from "~/assets/svgs/GitHubLogo";
import { GoogleLogo } from "~/assets/svgs/GoogleLogo";

export const SignInModal: React.FC<{registerOrLoginInit:1|2}> = ({registerOrLoginInit }) => {
  const [loginError, setLoginError] = useState(null);
  const [regVisibility, setRegVisibility] = useState(true);
  const [registerOrLogin, setRegisterOrLogin] = useState(registerOrLoginInit);

  const cancelLogin = () => {
    setRegVisibility(!regVisibility);
  }

  const registerSubmit = (e:any) => {
    e.preventDefault();
    console.log("register submit");
  }

  const login = (e:any) => {
    e.preventDefault();
    // axios.post('https://api.mccullo.ug/user/login', {
      axios.post('http://localhost:8080/user/login', {
      username: e.target.username.value,
      password: e.target.password.value
    })
    .then(response => {
      const { sessionToken, user } = response.data;
      localStorage.setItem("sessionToken",JSON.stringify({sessionToken,user}))
    })
    .catch(error => {
      setLoginError(error.response.data);
    })
  }

  const toggleRegisterOrLogin = () => {
    setRegisterOrLogin((prev:any) =>
      prev===1?2:1
    )
  }

  useEffect(() => {
    !regVisibility?window.history.pushState({}, '', '/h/'):null;
  },[regVisibility])

  return (
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
                        <form className="register__card__body__signup" onSubmit={registerSubmit}>
                            <input type="text" name="user_name" placeholder="User name" className="register__card__body__input" />
                            <input type="text" name="first_name" placeholder="First name" className="register__card__body__input" />
                            <input type="text" name="last_name" placeholder="Last name" className="register__card__body__input" />
                            <input type="text" name="email" placeholder="Email" className="register__card__body__input" />
                            <input type="password" name="password" placeholder="Password" className="register__card__body__input" />
                            <input type="password" name="confirm_password" placeholder="Confirm Password" className="register__card__body__input" />
                            {loginError?<div className="register__card__body__signup__error">{loginError}</div>:<div className="register__card__body__signup__error"></div>}
                            <button className="register__card__body__button">SIGN UP</button>
                        </form>
                        <div className="register__card__body__login">Already registered? <a href="#" onClick={toggleRegisterOrLogin}>Log in</a>.</div>
                        </>
                        :
                        <>
                        <form className="register__card__body__signup" onSubmit={login}>
                            <input type="text" name="username" placeholder="User name" className="register__card__body__input" />
                            <input type="password" name="password" placeholder="Password" className="register__card__body__input" />
                            {loginError?<div className="register__card__body__signup__error">{loginError}</div>:<div className="register__card__body__signup__error"></div>}
                            <button className="register__card__body__button">LOG IN</button>
                        </form>
                        <div className="register__card__body__login">Don't have an account? <a href="#" onClick={toggleRegisterOrLogin}>Sign up</a>.</div>
                        </>
                        }
                    </div>
                </div>
            </div>
        :""}
    </>
  )
}