/* The four Whop calls the worker makes. Endpoints and payloads are taken from
 * Whop's current docs (checked 2026-10-18):
 *
 *  - OAuth 2.1 + PKCE guide ......... https://docs.whop.com/developer/guides/oauth
 *  - OIDC discovery ................. https://api.whop.com/.well-known/openid-configuration
 *      authorization_endpoint  https://api.whop.com/oauth/authorize
 *      token_endpoint          https://api.whop.com/oauth/token
 *      userinfo_endpoint       https://api.whop.com/oauth/userinfo
 *      revocation_endpoint     https://api.whop.com/oauth/revoke
 *      token_endpoint_auth_methods_supported: none, client_secret_basic, client_secret_post
 *      code_challenge_methods_supported:      S256
 *  - Check User Access .............. https://docs.whop.com/api-reference/beta/users/check-user-access
 *      GET https://api.whop.com/api/v1/users/{id}/access/{resource_id}
 *      -> {has_access: boolean, access_level: "customer" | "admin" | "no_access"}
 *      Authorization: Bearer <Account API key>
 *  - Access levels .................. https://docs.whop.com/developer/guides/authentication#check-access
 *      admin = team member of the business (any role, including moderator)
 *  - API keys ....................... https://docs.whop.com/developer/guides/auth-scoping
 *  - Rate limits .................... https://docs.whop.com/developer/troubleshooting#rate-limits
 *      600 requests / minute per operation per API credential
 */

export const WHOP = {
  authorize: 'https://api.whop.com/oauth/authorize',
  token: 'https://api.whop.com/oauth/token',
  userinfo: 'https://api.whop.com/oauth/userinfo',
  revoke: 'https://api.whop.com/oauth/revoke',
  api: 'https://api.whop.com/api/v1',
};

const TIMEOUT_MS = 8000;

export class WhopError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status || 0; }
}

async function call(fetchImpl, url, init) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new WhopError('unreachable');
  }
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    /* Never log or forward Whop's body: it can echo request details. */
    const code = res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'upstream' : 'rejected';
    throw new WhopError(code, res.status);
  }
  return body || {};
}

/* Authorization-code exchange, confidential client (client_secret_post) + PKCE.
 * The JSON body matches the docs' example; client_secret is added because the
 * worker is a server and the discovery document lists client_secret_post. */
export function exchangeCode(fetchImpl, { code, verifier, redirectUri, clientId, clientSecret }) {
  return call(fetchImpl, WHOP.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: verifier,
    }),
  });
}

/* {sub: "user_...", preferred_username?, name?, picture?} */
export function getUserInfo(fetchImpl, accessToken) {
  return call(fetchImpl, WHOP.userinfo, {
    headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' },
  });
}

/* Server-side entitlement check with the business's Account API key. */
export async function checkAccess(fetchImpl, { userId, resourceId, apiKey }) {
  const url = `${WHOP.api}/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(resourceId)}`;
  const body = await call(fetchImpl, url, {
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' },
  });
  if (typeof body.has_access !== 'boolean') throw new WhopError('upstream');
  return { has_access: body.has_access, access_level: String(body.access_level || 'no_access') };
}

/* We never keep Whop's tokens, so the refresh token is revoked straight away. */
export async function revokeToken(fetchImpl, { token, clientId, clientSecret }) {
  try {
    await call(fetchImpl, WHOP.revoke, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, client_id: clientId, client_secret: clientSecret }),
    });
  } catch { /* best effort */ }
}
