# Etsem.IQ — architecture notes

The product is one file, `index.html`. GitHub Pages serves it at etsemiq.com,
and Whop deploys it as a Whop app through Cloudflare Workers assets
(`wrangler.jsonc`). There is no build step for the app itself. The only server
code is the small sign-in Worker in `api/` (see PLUS below and
`docs/WHOP-AUTH-SETUP.md`).

```
index.html
├── <style>                     theme tokens → components → Bob → breakpoints
├── <script> 1  i18n            T (5 languages) + T_EXT, t(), category names
├── <script> 2  content         shapes, figures, free-test bank, audit table,
│                               Hardcore bank
├── <script> 3  core            storage, accounts, quiz engine, scoring, plans
├── <script> 4  Bob + UI kit    mascot renderer, voice, dialog, exit guard,
│                               mobile sheet, screen effects
├── <script> 5  app             games, level maps, Hardcore run, Bob's brain,
│                               language, nav, settings, theme, music, boot
└── <script id="newgames">      Brain Bites (trivia) + Brain Twins (pass the
                                phone); registers itself with CATALOG.push
```

Feature CSS lives in its own `<style id="…">` block before `</head>`:
`fixes-a11y`, `whop-auth-css`, `games-v2`, `ft-items` and `newgames`. All of
them read the theme tokens in the main `<style>`, so a palette change reaches
every screen. The sign-in client is `<script id="whop-auth">`, placed just
before script 3.

## Games

`CATALOG` lists the 8 games. An entry can carry these optional fields:

- `launch()`: the card calls `launchGame(key)`, which does the PLUS check and
  then calls `launch()` instead of opening a level map;
- `metaText()` and `progressText()`;
- `free:true`.

The hub renders `CATALOG` each time it opens, so a block that loads later can
add a game. Delayed steps (flashes, hide timers, auto-advance) run on a run
token tied to their screen (`gLater`), so a Restart or leaving the screen
cancels the old run.

Progress lives in `gameProgress`, in localStorage, per account:

- stars per level;
- the personal best per game and level;
- `_meta`: XP, player level, the day streak and achievements.

Self-checks, callable from the console:

- `gamesSelfCheck(n)` generates n items per generator and asserts the key is
  right, the options are distinct, and only one option fits the rule.
- `ngSelfCheck()` checks that every trivia question has all 5 languages,
  4 unique options and a valid key.
- `auditSelfCheck()` checks the free test.

Run the whole browser suite with `npm run test:e2e` (see `tests/e2e/README.md`).

Script blocks are parsed in order but only the last one runs anything at load
(the boot IIFE), so cross-block calls are all resolved by the time they happen.

---

## Bob — the mascot system

`BOB_PARTS` / `BOB_EYES` / `BOB_MOUTH` / `BOB_BROW` / `BOB_FX` are the vocabulary;
`BOB_STATES` is the grammar. One state is one row:

```js
correct: {eyes:'happy', mouth:'grin', brow:'none', fx:'sparks'}
```

`bobInner(state)` assembles the markup, `bobSVG(state, opts)` wraps it in an
`<svg class="bob bob--correct">`, and the CSS drives movement off that class.
Every Bob on the site — the floating button, the chat header, the lobby card,
the quiz stage, the dialogs, the Hardcore banner — comes from this one function
at the same 64×64 viewBox, which is why he is recognisably the same character
everywhere.

**The October 2026 redesign** changed Bob's look but kept the API:

- He has blinking eyes, cheeks, a highlight and an idle bounce.
- New states: `wave`, `cheer` and `thinkingHard`.
- `bobSVG(state, {size:'xl'})`, or `data-bob-size="xl"` on a mount, gives the
  large hero and end-of-round Bob.
- On desktop his eyes follow the cursor. That is off on touch screens and with
  reduced motion.
- `celebrate()` is the one shared burst, and it reuses `fxBurst` and the games'
  confetti.

**Adding a state** is one entry in `BOB_STATES` plus, if it needs new movement,
one `@keyframes` rule and one `.bob--<name> .bob-body{animation:…}` line. No
other file or function has to change.

Runtime helpers:

| Function | Use |
|---|---|
| `bobSVG(state, opts)` | Bob as a string, for templates |
| `mountBobs(root)` | fills every `[data-bob]` placeholder; idempotent |
| `setBobState(el, state, hold, restTo)` | swap state in place; `hold` returns him to rest after N ms |
| `bobSetStage(mountId, state, text, tone, hold)` | Bob + one line of copy, the in-game reaction surface |
| `bobReact(beat)` | the quiz stage, choosing copy from the matching pool |
| `bobMoment(state, text, ms)` | a corner drop-in that never blocks input |

**Voice.** `BOB_LINES` holds 2–5 phrasings per beat per language and `bobLine()`
never returns the same one twice in a row. Personality: intelligent, curious,
supportive, a little dry. He does not mock a wrong answer and he does not pad.

**Performance.** Inline SVG plus CSS; animations only touch `transform` and
`opacity`. No runtime dependency, no image requests, no layout thrash. Reactions
never gate input — the next question is answerable while Bob is still moving.

**Reduced motion.** `prefers-reduced-motion` removes the movement and keeps the
state: expressions still change, effects fade instead of flying, and every
correct/wrong signal is also carried by colour and text, never by motion alone.

### Where Bob reacts

| Moment | State |
|---|---|
| First ever visit | `greeting` (once, then never again) |
| Test / level start | `testStart` |
| Hard or extreme item | `thinking` |
| Correct answer (games only) | `correct` |
| 3 in a row / 5+ in a row | `streak` |
| Wrong answer | `wrong` |
| Level passed / 3 stars | `celebrate` / `highScore` |
| Personal best beaten | `newRecord` |
| Test finished | `testComplete` |
| Entering Hardcore | `hardcore` |
| Locked content | `plus` |

In the **scored Free Test** Bob never says whether an answer was right. Showing
the key mid-assessment would turn an assessment into a quiz with an answer
sheet. He reacts to difficulty and progress there instead; immediate
correct/wrong feedback is for the training games and Hardcore, where it is the
point.

---

## Bob — understanding

No backend means nowhere to keep an API key, and a key in client JavaScript is
readable by every visitor. So Bob is local, but a real engine rather than a
lookup table:

```
normalise → tokenise → score every intent → fuzzy-match the rest →
pick, or fall back → answer from a pool, coloured by what we know
```

* **Normalisation** folds case, strips all combining marks after NFD (Latin
  accents, Hebrew niqqud, Arabic tashkeel and the hamza that NFD splits off an
  alef), and folds ta-marbuta, alef forms and alef maqsura.
* **Scoring** is the strongest single piece of evidence plus sharply diminishing
  credit for the rest. A multi-word key scores by how much of it is present, so
  a typo in one word does not lose the phrase; function words are excluded from
  that coverage, so "what is the capital of Peru" cannot match "what is the
  average" on its function words alone.
* **Fuzzy matching** is a Dice coefficient over character bigrams, with a prefix
  fallback that refuses to fire on words shorter than three characters.
* **Context**: a bare follow-up ("why?", "more", "למה") re-opens the previous
  topic.
* **Fallback** names what Bob does know and offers three suggestions chosen for
  where the person actually is. He never invents a number: facts come from
  `bobFacts()`, and an intent whose answer needs results has separate `r` and
  `nor` pools.

38 intents, keyed in all five languages; 38 answer sets, each with 1–3 phrasings
per language.

**Swapping in a real model** later means replacing `bobAnswer()` and nothing
else — but it needs a backend to hold the key. See LIMITATIONS below.

---

## Leaving an active test

Every navigation on the site goes through `showScreen()`, so the exit warning
lives there: one check covers the logo, the nav links, the mobile sheet, Bob's
action buttons and the in-game back links, instead of a handler on each.

`armActivity('test'|'game')` marks an activity as running; `ACTIVITY_FLOW` lists
the screens that belong to it, and any other target is held back and confirmed
first. `disarmActivity()` runs the moment the activity is scored. Answering a
question never touches `showScreen`, so it never triggers the warning.
`beforeunload` is registered only while an activity is armed.

The dialog is always escapable — scrim click and Escape both take the cancel
branch — so nobody can be trapped in it.

---

## Music

A small generative arrangement, synthesised in the browser: five chord
progressions in D major, four arrangement sections (open / build / lift / air)
that change every sixteen bars with a filter-sweep transition, and six melodic
motifs drawn from the D major pentatonic so no motif can clash with any chord in
the key. Scheduling uses the standard Web Audio lookahead pattern, so timing
does not drift when the main thread is busy rendering a question.

Everything runs through one bus, which is what makes "stop" immediate: the
scheduler is cleared and the bus is faded over 120 ms, so anything already
queued on the audio clock is silent. Music is off until the user turns it on,
the choice is remembered per device, and a remembered "on" is armed on the first
gesture rather than at load, so autoplay policy is never violated.

Measured over a 150-second offline render: peak ≈ −22 dBFS, no silent seconds,
RMS coefficient of variation ≈ 0.35 (i.e. it breathes), and 10-second windows
taken 10 / 20 / 40 / 80 seconds apart are uncorrelated — it is not a loop.

---

## PLUS

One paid tier, one plan: monthly on Whop, $1.99 for the first month (the
`FIRSTMONTH199` promo on the checkout link), then $19.99/month. The checkout URL
is `https://whop.com/checkout/plan_gov3K39kXZUmB?promoCode=FIRSTMONTH199` and the
CTAs are plain links to it. The 6-month and annual plans and the simulated card
form were removed: the form granted PLUS without taking money.

`isLocked(key)` is still the single gate in the UI; `CATALOG` entries can carry
`free:true` and bypass it. A locked game opens `showPlusGate()`. The Free Test and
the estimated range are never gated.

**Who has PLUS** is decided by the `etsemiq-api` Worker (`api/`, deployed to
`api.etsemiq.com`, separate from the root `wrangler.jsonc`), never by the page:

```
Sign in with Whop → api /auth/login (state + PKCE) → Whop consent →
api /auth/callback: code → Whop token → user id → Whop check-access(product) →
signed session {sub, plus, admin, exp} → etsemiq.com/#whop_session=<token>
```

`script#whop-auth` (right before the core script) takes the token from the
fragment, strips it with `history.replaceState`, re-checks it with `GET /me`,
and caches `{plus, admin, exp, user}` until `exp`. After that it fails closed.
`isMember()` is `whopEntitled() || isAdmin()` and nothing else. Local
email/password accounts are free accounts that save progress, and they never
grant PLUS.

Admin (full access, an "Admin" badge in nav and settings) comes from the Worker
alone. It is granted for a Whop user id listed in the `ADMIN_WHOP_USER_IDS`
secret, or for Whop's `access_level: "admin"` (team members of the business).

Cancelling and billing happen on Whop. Settings links to
`https://whop.com/@me/settings/orders/`. Setup, secrets and the security model:
[`docs/WHOP-AUTH-SETUP.md`](WHOP-AUTH-SETUP.md).

---

## Responsive layout

`--gutter` is one token every shell reads, so narrowing the page narrows every
layout at once and no screen can be left wide enough to push the page sideways.
The hero uses `clamp(28px, 7.2vw, 54px)`: `7.2vw` only passes 54px above roughly
750px and the ceiling holds it there, so **desktop is pixel-identical to before**
while the floor still fits a 320px screen with gutters.

At ≤820px the desktop control strip is replaced — not shrunk — by a phone
cluster: the primary action stays a button, and everything else moves into a
labelled bottom sheet where each control is a full-width row with its name and
its current state in words. Nothing is removed. Tap targets are ≥44px.

Verified at 320 / 360 / 375 / 390 / 414 / 430 / 768 / 1024 / 1280 / 1440 / 1920
across all 21 screens, in both themes and in both text directions, with font
metrics stressed 12% wider than the fallback: no horizontal overflow anywhere.

---

## LIMITATIONS

There is now one small backend, the `api/` Worker, and it handles only
sign-in and entitlement. These still need more server work, and are **not**
done here:

* **A real language model for Bob.** The `api/` Worker can now hold an API key,
  so this is possible. It is planned as its own PR:
  * add a `POST /bob/chat` route on the Worker, calling Claude Haiku 5.5 with
    Bob's persona as a cached system prompt;
  * PLUS sessions only, with a daily per-user cap and the rate limiter;
  * the local engine stays as the fallback for free users, offline use and
    errors.

  `bobAnswer()` is still the only function that would change on the page.
* **Server-held PLUS content.** Payments and the PLUS/admin entitlement are now
  real and server-verified (Whop checkout + the `api/` Worker). But the game
  code and the report logic still ship in this static page, so a technical user
  can flip `isMember()` in DevTools and play locally. They still cannot obtain a
  valid session or Admin. Closing that gap means serving PLUS content from the
  Worker against the session token.
* **Instant session revocation.** Sessions are stateless signed tokens (12 h,
  re-checked with Whop hourly). Signing out forgets the token in this browser.
  Ending every session at once means rotating `SESSION_SECRET`.
* **Server-side accounts.** The free local accounts, results and progress live in
  `localStorage` (PLUS itself follows the Whop account to any device). Consequences, which Bob explains when asked: no password-reset
  email is possible, clearing site data deletes the account, and results do not
  follow a user to another device or browser.
* **Certificate verification.** `etsemiq.com/verify` is printed on the
  certificate but there is no endpoint behind it.
* **Real usage statistics.** The ticker, "6,204 people took the test today" and
  the testimonials are static marketing copy, not live data.
