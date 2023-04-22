import { RemixBrowser } from "@remix-run/react";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { LocaleContextProvider } from "./utils/LocaleProvider";
const locales = window.navigator.languages;

function hydrate() {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <LocaleContextProvider locales={locales}>
          <RemixBrowser />
        </LocaleContextProvider>
      </StrictMode>
    );
  });
}

if (window.requestIdleCallback) {
  window.requestIdleCallback(hydrate);
} else {
  // Safari doesn't support requestIdleCallback
  // https://caniuse.com/requestidlecallback
  window.setTimeout(hydrate, 1);
}
