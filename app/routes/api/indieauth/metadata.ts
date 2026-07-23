/**
 * IndieAuth server metadata — GET /api/indieauth/metadata
 *
 * IndieAuth 2022-02-12 (draft) formalized a discovery document at a
 * canonical URL, mirroring OAuth 2.0 Authorization Server Metadata
 * (RFC 8414). Modern clients fetch this instead of parsing rel-links
 * out of the HTML head. We advertise both — HTML link tags stay in
 * root.tsx for older clients.
 *
 * https://indieauth.spec.indieweb.org/#indieauth-server-metadata
 */

import { SITE_URL } from "~/utils/indieauth.server";

export const loader = () => {
  return Response.json(
    {
      issuer: SITE_URL,
      authorization_endpoint: `${SITE_URL}/api/indieauth/authorize`,
      token_endpoint: `${SITE_URL}/api/indieauth/token`,
      micropub: `${SITE_URL}/api/micropub`,
      scopes_supported: ["create", "update", "delete", "media"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      // The introspection endpoint is optional. Skipping for Phase 1
      // — we only issue tokens to ourselves so external validation
      // isn't a concern.
      service_documentation: "https://indieauth.spec.indieweb.org/",
    },
    {
      headers: {
        // Metadata is stable; caching lets clients avoid a round trip
        // on every authorize.
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  );
};
