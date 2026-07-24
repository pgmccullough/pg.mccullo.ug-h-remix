import { useEffect, useState } from "react"
import { useFetcher, Link, useSearchParams } from "react-router";
import { GitHubLogo } from "~/assets/svgs/GitHubLogo";
import { GoogleLogo } from "~/assets/svgs/GoogleLogo";
import { MastodonLogo } from "~/assets/svgs/MastodonLogo";

/**
 * Whitelist for returnTo values — same rule the server-side
 * sanitizeReturnTo uses. Duplicated here (client-side) so we don't
 * dangle broken URLs on OAuth links before the server rejects them.
 */
function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "";
  if (raw.includes("\\")) return "";
  if (raw.length > 500) return "";
  return raw;
}

/**
 * SignInModal can be used two ways:
 *
 *   1) As a full route at /h/login — close interactions navigate back to /h.
 *   2) As an in-page overlay opened by a button — caller passes `onClose`
 *      and the close interactions call that callback instead of navigating.
 */
export const SignInModal: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const loginForm = useFetcher();
  const registerForm = useFetcher();
  const [loginError, setLoginError] = useState<string|null>(null);
  const [isRegister, setIsRegister] = useState<boolean>(false);
  // Mastodon sign-in needs to know which instance the user is on — the
  // button click reveals an inline input rather than navigating straight
  // away (we don't know where to send them yet).
  const [mastodonOpen, setMastodonOpen] = useState<boolean>(false);
  const [mastodonInstance, setMastodonInstance] = useState<string>("");
  // ?returnTo=/... deep-links the user back to wherever they were
  // trying to go (e.g. /api/indieauth/authorize?...). Empty string
  // means "use default /h" and we skip appending any params.
  const [searchParams] = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  const returnQuery = returnTo
    ? `?returnTo=${encodeURIComponent(returnTo)}`
    : "";

  // Close-on-Escape for the overlay variant.
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  // Close interactions: callback for the overlay variant, navigation for
  // the standalone /h/login route variant.
  const backdrop = onClose
    ? <button
        type="button"
        aria-label="Close"
        className="register__background"
        onClick={onClose}
        style={{ border: 0, padding: 0 }}
      />
    : <Link className="register__background" to="/h" aria-label="Close" />;

  const closeButton = onClose
    ? <button
        type="button"
        aria-label="Close"
        className="register__card__button"
        onClick={onClose}
        style={{ border: 0 }}
      >
        <p className="register__card__button__x">+</p>
      </button>
    : <Link className="register__card__button" to="/h" aria-label="Close">
        <p className="register__card__button__x">+</p>
      </Link>;

  return (
    <>
      <div className="register">
        {backdrop}
        <div className="register__card">
          {closeButton}
          <div className="register__card__head">
            {isRegister?"Create your account":"Log in"}
          </div>
          <div className="register__card__body">
            {/* OAuth buttons — real submissions to /api/auth/<provider>. */}
            <style>{`
              .oauth-btn-row { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 10px; }
              .oauth-btn-row > * { flex: 1 1 30%; min-width: 0; }
              .oauth-btn-row .register__card__body__apis__button {
                width: auto;
                margin: 5px 0 10px 0;
              }
              .mastodon-instance-row {
                display: flex;
                gap: 8px;
                padding: 0 10px 10px;
                align-items: stretch;
              }
              .mastodon-instance-row input {
                flex: 1;
                padding: 8px 12px;
                font: 14px 'PGM Sans', sans-serif;
                border: 1px solid #979997;
                border-radius: 4px;
              }
              .mastodon-instance-row button {
                height: auto;
                padding: 8px 16px;
                margin: 0;
              }
            `}</style>
            <div className="register__card__body__apis oauth-btn-row">
              <a
                href={`/api/auth/google${returnQuery}`}
                className="register__card__body__apis__button"
              >
                <div className="register__card__body__apis__button__item">
                  <GoogleLogo />
                </div>
                <div className="register__card__body__apis__button__item">
                  Google
                </div>
              </a>
              <a
                href={`/api/auth/github${returnQuery}`}
                className="register__card__body__apis__button"
              >
                <div className="register__card__body__apis__button__item">
                  <GitHubLogo />
                </div>
                <div className="register__card__body__apis__button__item">
                  GitHub
                </div>
              </a>
              <button
                type="button"
                onClick={() => setMastodonOpen((o) => !o)}
                className="register__card__body__apis__button"
                style={{
                  background: "transparent",
                  cursor: "pointer",
                  font: "inherit",
                  color: "#000",
                }}
              >
                <div className="register__card__body__apis__button__item">
                  <MastodonLogo />
                </div>
                <div className="register__card__body__apis__button__item">
                  Mastodon
                </div>
              </button>
            </div>
            {mastodonOpen && (
              <form
                method="post"
                action="/api/auth/mastodon"
                className="mastodon-instance-row"
              >
                <input
                  type="text"
                  name="instance"
                  placeholder="mastodon.social"
                  autoFocus
                  value={mastodonInstance}
                  onChange={(e) => setMastodonInstance(e.target.value)}
                />
                {returnTo ? (
                  <input type="hidden" name="returnTo" value={returnTo} />
                ) : null}
                <button type="submit">CONTINUE</button>
              </form>
            )}
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
                    {returnTo ? (
                      <input type="hidden" name="returnTo" value={returnTo} />
                    ) : null}
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