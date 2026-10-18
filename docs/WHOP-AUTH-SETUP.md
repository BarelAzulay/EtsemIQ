# Sign in with Whop: setup guide

This guide turns on real PLUS access for etsemiq.com. Follow the steps in order.
It takes about 30 minutes. You need your Whop dashboard, your Cloudflare account
and a terminal with Node.js 18 or newer.

## How it works

```
etsemiq.com (GitHub Pages, static)            api.etsemiq.com (Cloudflare Worker, api/)
───────────────────────────────────           ─────────────────────────────────────────
"Sign in with Whop"  ───────────────────────▶ GET /auth/login
                                               sets a signed state + PKCE cookie
                                               302 to Whop's consent screen
                     Whop ─────────────────▶  GET /auth/callback?code&state
                                               checks state, swaps code (+ client secret
                                               + PKCE verifier) for a Whop token,
                                               reads the user id, asks Whop with your
                                               API key: does this user have PLUS?
etsemiq.com/#whop_session=<token> ◀──────────  302 with a signed 12-hour session token
page stores the token, strips it from the URL
GET /me (Authorization: Bearer) ────────────▶ verifies the signature; re-asks Whop
                                               if the last check is over 1 hour old
{plus, admin, exp, user} ◀────────────────────
```

The website never decides who has PLUS. The worker decides, using Whop's
answer, and signs the result with a secret that only the worker has.

Whop docs used (checked October 2026):

| Topic | Link |
|---|---|
| Sign in with Whop (OAuth 2.1 + PKCE) | https://docs.whop.com/developer/guides/oauth |
| OAuth endpoints and supported methods | https://api.whop.com/.well-known/openid-configuration |
| Check user access (`has_access`, `access_level`) | https://docs.whop.com/api-reference/beta/users/check-user-access |
| What `customer` / `admin` / `no_access` mean | https://docs.whop.com/developer/guides/authentication |
| API key types | https://docs.whop.com/developer/guides/auth-scoping |
| Creating an API key | https://docs.whop.com/developer/quickstart |
| Finding the product id, gating a web app | https://docs.whop.com/supported-business-models/saas |
| Where members cancel | https://docs.whop.com/memberships-and-access/cancellations-and-refunds/cancel-a-subscription |
| Errors and rate limits | https://docs.whop.com/developer/troubleshooting |

---

## Step 1: Set up the Whop OAuth app

You can add OAuth to your existing Whop app (`app_nSJaT3qoyoLIHJ`, the one in
`whop.app.json`) or create a new app just for the website. Both work. A
separate app keeps the website's settings apart from the in-Whop app.

1. Open the **[Developer dashboard](https://whop.com/dashboard/developer)**.
2. Select your app, or select **Create app** and name it, for example "Etsem.IQ website".
3. Open the **OAuth** section.
4. Add this redirect URI exactly. Whop requires an exact match, including no trailing slash:
   ```
   https://api.etsemiq.com/auth/callback
   ```
   For local testing you can also add `http://localhost:8787/auth/callback`.
5. Under **View available scopes**, select only `openid` and `profile`. The
   worker does not ask for email.
6. Copy the **client ID** (it looks like `app_xxxxx`) and the **client secret**.
   Keep the secret private. You will paste both in step 4.

## Step 2: Create an API key

The worker uses this key to ask Whop whether a user has PLUS. The key never
reaches the browser.

1. In the dashboard, go to **Developer → API keys** (under "Account API Keys")
   and select **Create**. Name it "etsemiq-api".
2. For permissions, the Admin role works. Once everything runs, you can switch
   to a custom permission set. If check-access then returns `403`, add back the
   permission the [endpoint page](https://docs.whop.com/api-reference/beta/users/check-user-access) lists.
3. Copy the key when Whop shows it.

Use an **Account** API key. An App API key is for apps that other businesses install.

## Step 3: Find the PLUS product id

1. In the dashboard, open **Products**.
2. Open the product that the live plan `plan_gov3K39kXZUmB` belongs to (Etsem.IQ PLUS).
3. Copy its product ID. It starts with `prod_`.

## Step 4: Install and set the secrets

In a terminal, from the repository folder:

```bash
cd api
npm i
npx wrangler login          # opens the browser once to connect your Cloudflare account
```

Set each secret. Every command asks you to paste the value:

```bash
npx wrangler secret put WHOP_CLIENT_ID       # app_... from step 1
npx wrangler secret put WHOP_CLIENT_SECRET   # client secret from step 1
npx wrangler secret put WHOP_API_KEY         # API key from step 2
npx wrangler secret put WHOP_PRODUCT_ID      # prod_... from step 3
npx wrangler secret put SESSION_SECRET       # see below
```

For `SESSION_SECRET`, generate a long random value and paste it:

```bash
openssl rand -base64 48
```

It must be at least 32 characters. If it ever leaks, set a new one: every
session ends at once and members simply sign in again.

If `wrangler secret put` says the Worker does not exist yet, run
`npx wrangler deploy` once (step 5), then set the secrets.

### Your own admin access (no payment needed)

Admin is granted only by the worker, in one of two ways:

- **(a) Your Whop user id is in `ADMIN_WHOP_USER_IDS`.** This is the reliable way.
- **(b) Whop reports `access_level: "admin"` for you.** Whop does this for team
  members of the business that owns the product: the owner, admins and also
  moderators ([Whop docs](https://docs.whop.com/developer/guides/authentication)).
  This is **off by default**, because it includes every moderator. To turn it on,
  set `"WHOP_TEAM_IS_ADMIN": "true"` (exactly `true`; any other value means off) in
  `api/wrangler.jsonc` and deploy again. With it off, team members still get PLUS
  if Whop gives them access, but not the Admin badge.

To find your Whop user id for (a):

1. Finish steps 5 and 6 first, so sign-in works.
2. Go to etsemiq.com, select **Log in → Sign in with Whop**, and sign in with your own Whop account.
3. Open **Account settings**. The membership card shows **Whop user ID: `user_…`**.
4. Set it:
   ```bash
   npx wrangler secret put ADMIN_WHOP_USER_IDS   # e.g. user_abc123  (comma-separate several)
   ```
5. Sign out of Whop in Account settings and sign in again. The **Admin** badge appears.

An email address never grants anything. Admin ids live only in this Cloudflare
secret, never in the repository.

### Optional but recommended: rate limiting

`/auth/callback` and `/me` can make the worker call Whop, and Whop limits calls
per credential. A script hammering those routes could use up that budget and
block real sign-ins. Add Cloudflare's rate-limiting binding to `api/wrangler.jsonc`:

```jsonc
  "ratelimits": [
    { "name": "RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 30, "period": 60 } }
  ],
```

The worker uses it automatically when the binding exists (30 requests per
minute per IP, per route). Without it, everything still works. If your wrangler
version rejects this block, use a Cloudflare WAF rate-limiting rule on
`api.etsemiq.com/auth/callback` and `/me` instead.

### Keep `EXTRA_ORIGIN` empty in production

`EXTRA_ORIGIN` exists for local testing only. Any origin you put there can
receive session tokens through `return=`, so `http://localhost:8080` in
production would hand tokens to whatever runs on a visitor's localhost. For
local work, use `npx wrangler dev` with a `.dev.vars` file
(`api/.dev.vars.example`).

## Step 5: Deploy the worker

```bash
npx wrangler deploy
```

This deploys only `etsemiq-api`. The root `wrangler.jsonc` (the Whop app) is a
separate Worker and is not touched.

Check it: open https://api.etsemiq.com/health. It should show
`{"ok":true,"configured":true}`. `"configured":false` means a secret is missing
or `SESSION_SECRET` is too short.

## Step 6: Connect api.etsemiq.com

etsemiq.com itself stays on GitHub Pages. Only the `api` subdomain points at the worker.

**Case A: etsemiq.com's DNS is already on Cloudflare** (the domain appears under
"Websites" in your Cloudflare dashboard).
The `routes` block in `api/wrangler.jsonc` makes `npx wrangler deploy` create the
`api.etsemiq.com` custom domain, its DNS record and its certificate. Nothing else
is needed. To do it by hand instead: **Workers & Pages → etsemiq-api → Settings →
Domains & Routes → Add → Custom domain → `api.etsemiq.com`**.

**Case B: DNS is somewhere else** (your registrar, for example).
Cloudflare custom domains only work for domains whose DNS is on Cloudflare. A
CNAME from your current DNS to `*.workers.dev` does not work. So first move
etsemiq.com's DNS to Cloudflare. It's free and GitHub Pages keeps working:

1. In Cloudflare, select **Add a site**, enter `etsemiq.com`, and choose the Free plan.
2. Cloudflare imports your current DNS records. Check that the GitHub Pages
   records are there: four `A` records for `etsemiq.com` (`185.199.108.153`,
   `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and a `CNAME` for
   `www` to your `<username>.github.io`. Set them to **DNS only** (grey cloud),
   so that GitHub keeps serving its own HTTPS certificate.
3. At your registrar, replace the nameservers with the two Cloudflare shows you.
   It can take up to a day. Cloudflare emails you when it is active.
4. Then continue as in Case A: run `npx wrangler deploy` again.

Until then, you can deploy without the `routes` block (comment it out) and test
on the `*.workers.dev` URL with the local override in the test checklist.

## Step 7: Whop return URL after checkout

Set Whop's post-checkout redirect, wherever your dashboard offers it, to:

```
https://etsemiq.com/?whop=return
```

That page asks the buyer to "Sign in with Whop to unlock PLUS".

Note: Whop documents a post-checkout `redirect_url` on *checkout configurations*
(`ch_…`, see [Checkout configurations](https://docs.whop.com/api-reference/checkout-configurations/checkout-configuration)).
The site's checkout link is the plain plan link
`https://whop.com/checkout/plan_gov3K39kXZUmB?promoCode=FIRSTMONTH199`, and it
stays as it is. If your plan or product settings have no redirect option, nothing
breaks. The site remembers that the visitor went to checkout, and for 6 hours
afterwards it shows the same "Sign in with Whop to unlock PLUS" prompt when they
come back.

## Step 8: Test checklist

On the live site, after steps 1 to 7:

- [ ] https://api.etsemiq.com/health shows `"configured":true`.
- [ ] Logged out: games other than the free one are locked, and the free test works.
- [ ] Pricing shows one plan: "$1.99 for your first month, then $19.99/month. Cancel anytime."
- [ ] The CTA opens exactly `https://whop.com/checkout/plan_gov3K39kXZUmB?promoCode=FIRSTMONTH199`.
- [ ] Create a local free account: PLUS stays locked.
- [ ] **Sign in with Whop** with an account that has **no** membership: "No PLUS membership found", and everything stays locked.
- [ ] Sign in with a **paying** account: the PLUS badge appears and everything unlocks. The address bar shows no `#whop_session`.
- [ ] Sign in with **your** account: the Admin badge appears in the nav and in Account settings.
- [ ] Account settings → **Cancel / manage subscription** opens your orders on Whop.
- [ ] Cancel a test membership on Whop. Within about an hour, after Whop ends access, the site shows it as free.
- [ ] Sign out of Whop in Account settings: PLUS locks again.
- [ ] In DevTools, edit `etsem_whop_ent` in localStorage to `"admin":true` and reload. The `/me` check that runs on load sets it back within a second, and without a token it counts for nothing.

Local testing without the live domain: run `npx wrangler dev` in `api/` with a
`.dev.vars` file (copy `api/.dev.vars.example`). Serve `index.html` from
`http://localhost:8080`, then run this once in that page's console:
`localStorage.setItem('etsem_api','http://localhost:8787')`. The override only
works on `localhost` and `file://` pages.

Automated tests for the worker: `cd api && npm test`.

---

## Security model and tradeoffs

**What is protected**

- **PLUS and Admin cannot be forged.** The worker grants them only from Whop's
  server-side answer, or from your user id in a Cloudflare secret. It signs the
  result with HMAC-SHA256 (`SESSION_SECRET`). Anyone who changes `plus` or
  `admin` in the token breaks the signature, and `/me` rejects it.
- **Typing an email unlocks nothing.** No email address and no admin id is in
  the code or the repository. Local email/password accounts are free accounts.
  Old `plus` flags in localStorage are ignored.
- **The OAuth flow is protected against CSRF and code injection.** It uses a
  random `state` and PKCE (S256), both kept in a signed, HttpOnly, Secure,
  SameSite=Lax cookie on api.etsemiq.com that lives 10 minutes. The client
  secret and the API key exist only as Cloudflare secrets.
- **The token stays out of server logs.** It travels in the URL fragment
  (`#whop_session=`), which browsers never send to a server. The page removes
  it from the address bar straight away. The worker responses send
  `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- **Redirects and CORS use an allow-list.** They only go to
  `https://etsemiq.com`, `https://www.etsemiq.com` and an optional `EXTRA_ORIGIN`
  for local testing. They use exact matches, never `*`, and never echo an origin
  they don't know.
- **Whop's own tokens are not kept.** The worker uses Whop's access token once.
  It revokes the refresh token right away.
- **Cancellations take effect.** `/me` re-checks with Whop when the last check is
  more than 1 hour old (`REVERIFY_AFTER_SECONDS`). Sessions last 12 hours
  (`SESSION_TTL_SECONDS`), and each successful re-check extends them. If Whop or
  the worker can't be reached, the page keeps the last signed answer only until
  its expiry. After that, PLUS is closed until a check succeeds. The free test
  and free content never depend on the API.
- **Load stays well under Whop's rate limit.** Whop allows 600 requests per
  minute per operation and per key. The worker calls Whop at most about once an
  hour per signed-in user, plus a 60-second cache for repeated calls.

**What is not protected (yet)**

- **The game code ships in the public page.** The page decides what to show from
  `isMember()`, and a technical user can override that in DevTools (for example
  `isMember = () => true`) and play the PLUS games locally. The entitlement stays
  unforgeable: such a user has no valid token, the server never treats them as a
  member, and they never get an Admin session. But the client-side lock is a
  convenience, not a vault. To close this fully, the worker would have to serve
  PLUS content itself (the full report, the certificate, the game levels), and
  serve it only for a valid session token. That is a future step.
- **Sessions are stateless.** "Sign out" removes the token from this browser. A
  copied token stays valid until its expiry (at most 12 hours). Renewal through
  `/me` can't keep it alive forever: every session ends 30 days after the Whop
  sign-in that started it, and then the person signs in again. The `/me`
  re-check still cuts off a cancelled membership within about an hour. To end
  every session at once, rotate `SESSION_SECRET`.
- **Only sign-ins this tab started are accepted.** The page drops a
  `#whop_session=` token unless this tab began a Whop sign-in in the last 15
  minutes. A crafted link can't sign someone into another person's account.
- **Team members as admins is opt-in.** With `WHOP_TEAM_IS_ADMIN` set to `true`,
  every team member of your Whop business gets Admin, moderators included,
  because Whop reports them all as `admin`. It is off by default. Your own
  admin access comes from `ADMIN_WHOP_USER_IDS`.
- **Logs.** Workers observability is on in `api/wrangler.jsonc`. In the
  Cloudflare dashboard, check that request headers (`Authorization`) aren't
  stored in your logs. If they are, turn header logging off, or set
  `"observability": { "enabled": false }`.
- **A token in localStorage can be read by injected scripts.** Any script that
  ran in the page (an XSS bug) could read it. The page loads no third-party
  scripts, and the token only proves membership. It grants nothing on Whop itself.
