const { randomBytes } = require('crypto');

const STATE_COOKIE = 'HealthGuardian_naver_state';

function getOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function getRequestUrl(req, origin, fallbackPath) {
  return new URL(req.url || fallbackPath, origin);
}

function resolveRedirectTo(requestUrl, origin) {
  const fallback = `${origin}/index.html`;
  const requested = requestUrl.searchParams.get('redirect_to');
  if (!requested) return fallback;

  try {
    const candidate = new URL(requested, origin);
    if (candidate.origin !== origin) return fallback;
    return candidate.toString();
  } catch (error) {
    return fallback;
  }
}

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = String(value)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function createState(redirectTo) {
  const nonce = randomBytes(18).toString('hex');
  const payload = encodeBase64Url(JSON.stringify({ nonce, redirectTo }));
  return { nonce, payload };
}

function readStatePayload(payload) {
  try {
    const decoded = JSON.parse(decodeBase64Url(payload));
    if (!decoded || !decoded.nonce) return null;
    return decoded;
  } catch (error) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, item) => {
    const [key, ...rest] = item.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function createCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

function clearStateCookie(origin) {
  return createCookie(STATE_COOKIE, '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'Lax',
  });
}

function createStateCookie(nonce, origin) {
  return createCookie(STATE_COOKIE, nonce, {
    maxAge: 600,
    path: '/',
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'Lax',
  });
}

function buildNaverAuthorizeUrl({ clientId, callbackUrl, state }) {
  const authorizeUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizeUrl.searchParams.set('state', state);
  return authorizeUrl.toString();
}

function buildCallbackUrl(origin) {
  return `${origin}/api/naver-callback`;
}

function redirectWithError(res, redirectTo, code, message, cookie) {
  const target = new URL(redirectTo);
  target.searchParams.set('error', code);
  if (message) target.searchParams.set('error_description', message);

  if (cookie) {
    res.setHeader('Set-Cookie', cookie);
  }

  res.statusCode = 302;
  res.setHeader('Location', target.toString());
  res.end();
}

module.exports = {
  STATE_COOKIE,
  buildCallbackUrl,
  buildNaverAuthorizeUrl,
  clearStateCookie,
  createState,
  createStateCookie,
  decodeBase64Url,
  encodeBase64Url,
  getOrigin,
  getRequestUrl,
  parseCookies,
  readStatePayload,
  redirectWithError,
  resolveRedirectTo,
};
