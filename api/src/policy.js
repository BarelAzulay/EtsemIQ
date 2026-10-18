/* Pure decisions: who is allowed to call us (CORS), where we may redirect to,
 * and what a Whop access answer means for PLUS and admin. No I/O here, so all
 * of it is unit-tested directly. */

export const PROD_ORIGINS = ['https://etsemiq.com', 'https://www.etsemiq.com'];

/* The allow-list: the two production origins plus, optionally, ONE extra origin
 * from env (EXTRA_ORIGIN) for local development, e.g. "http://localhost:8080".
 * The extra value must itself be a bare origin; anything else is ignored. */
export function allowedOrigins(env = {}) {
  const list = [...PROD_ORIGINS];
  const extra = normaliseOrigin(env.EXTRA_ORIGIN);
  if (extra && !list.includes(extra)) list.push(extra);
  return list;
}

function normaliseOrigin(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    /* Only accept a bare origin: no path, query or fragment. */
    if ((u.pathname && u.pathname !== '/') || u.search || u.hash) return null;
    return u.origin;
  } catch { return null; }
}

/* Exact string match against the allow-list. Never a suffix/prefix/regex match,
 * so "https://etsemiq.com.evil.example" and "http://etsemiq.com" are refused. */
export function isAllowedOrigin(origin, env) {
  return typeof origin === 'string' && allowedOrigins(env).includes(origin);
}

/* CORS response headers for a request Origin. A disallowed origin gets no
 * Access-Control-Allow-Origin at all; we never reflect an arbitrary origin and
 * never send "*". No cookies are used cross-origin (Bearer header only), so
 * Allow-Credentials is not sent. */
export function corsHeaders(origin, env) {
  const h = { 'Vary': 'Origin' };
  if (isAllowedOrigin(origin, env)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}

/* Where /auth/callback may send the browser afterwards. The `return` value must
 * be an absolute URL whose origin is on the allow-list; otherwise the default
 * (the first production origin) is used. Any fragment is dropped, because we
 * write our own fragment. Returns a string URL. */
export function safeReturnUrl(raw, env) {
  const fallback = PROD_ORIGINS[0] + '/';
  if (typeof raw !== 'string' || !raw || raw.length > 2048) return fallback;
  let u;
  try { u = new URL(raw); } catch { return fallback; }
  if (u.username || u.password) return fallback;
  if (!isAllowedOrigin(u.origin, env)) return fallback;
  u.hash = '';
  return u.toString();
}

/* ADMIN_WHOP_USER_IDS: comma/space separated Whop user ids ("user_..."). */
export function parseAdminIds(raw) {
  if (typeof raw !== 'string') return [];
  return raw.split(/[\s,]+/).map(s => s.trim()).filter(s => /^user_[A-Za-z0-9]+$/.test(s));
}

export function isWhopUserId(v) {
  return typeof v === 'string' && /^user_[A-Za-z0-9]{1,64}$/.test(v);
}

/**
 * The entitlement decision. `access` is Whop's answer from
 * GET /api/v1/users/{id}/access/{product_id}: {has_access, access_level}
 * (access_level is "customer" | "admin" | "no_access"), or null when we could
 * not get an answer.
 *
 *  admin = the user id is listed in ADMIN_WHOP_USER_IDS
 *          OR (WHOP_TEAM_IS_ADMIN is not "false" AND Whop says access_level "admin",
 *              which Whop returns for team members of the business that owns the product)
 *  plus  = admin OR Whop says has_access with level "customer"/"admin"
 *
 * Nothing the browser sends (an email, a name, a flag) is an input here.
 */
export function decideEntitlement({ userId, access, env = {} }) {
  if (!isWhopUserId(userId)) return { plus: false, admin: false };
  const idAdmin = parseAdminIds(env.ADMIN_WHOP_USER_IDS).includes(userId);
  const teamIsAdmin = String(env.WHOP_TEAM_IS_ADMIN ?? 'true').toLowerCase() !== 'false';
  const hasAccess = !!(access && access.has_access === true);
  const level = access && typeof access.access_level === 'string' ? access.access_level : 'no_access';
  const teamAdmin = teamIsAdmin && hasAccess && level === 'admin';
  const admin = idAdmin || teamAdmin;
  const customer = hasAccess && (level === 'customer' || level === 'admin');
  return { plus: admin || customer, admin };
}
