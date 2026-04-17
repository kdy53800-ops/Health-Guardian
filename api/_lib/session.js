const { createHmac, timingSafeEqual } = require('crypto');
const { parseCookies } = require('./naver');

const SESSION_COOKIE = 'HealthGuardian_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getSessionSecret() {
  return String(
    process.env.SESSION_SECRET
    || process.env.NAVER_STATE_SECRET
    || process.env.NAVER_CLIENT_SECRET
    || ''
  );
}

function sign(encodedPayload) {
  const secret = getSessionSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(encodedPayload).digest('hex');
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

function createSessionToken(payload) {
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(encoded);
  if (!signature) return '';
  return `${encoded}.${signature}`;
}

function createSessionCookie(payload, origin) {
  const token = createSessionToken(payload);
  return buildCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'Lax',
  });
}

function clearSessionCookie(origin) {
  return buildCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'Lax',
  });
}

function readSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const dotIndex = token.lastIndexOf('.');
  if (dotIndex < 1) return null;

  const encoded = token.slice(0, dotIndex);
  const providedSig = token.slice(dotIndex + 1);
  const expectedSig = sign(encoded);
  if (!providedSig || !expectedSig) return null;

  const provided = Buffer.from(providedSig, 'utf8');
  const expected = Buffer.from(expectedSig, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encoded));
    if (!payload || !payload.uid) return null;
    if (payload.exp && Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  createSessionCookie,
  readSessionFromRequest,
};
