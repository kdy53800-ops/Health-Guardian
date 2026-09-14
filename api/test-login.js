const { timingSafeEqual } = require('crypto');
const { createSessionCookie, SESSION_TTL_SECONDS } = require('./_lib/session');
const { getOrigin } = require('./_lib/naver');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  const configuredPassword = String(process.env.TEST_LOGIN_PASSWORD || '');
  if (!configuredPassword) {
    sendJson(res, 503, { ok: false, message: '테스트 로그인이 설정되지 않았습니다.' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!safeEqual(body.password, configuredPassword)) {
    sendJson(res, 401, { ok: false, message: '테스트 계정 비밀번호가 올바르지 않습니다.' });
    return;
  }

  const isAdmin = body.type === 'admin';
  const user = {
    id: isAdmin ? 'test_admin_001' : 'test_user_001',
    name: isAdmin ? '테스트 관리자' : '테스트 유저',
    username: isAdmin ? 'test_admin' : 'test_user',
    isAdmin,
    isSpecial: true,
    authProvider: 'test',
    exp: Date.now() + (SESSION_TTL_SECONDS * 1000),
  };
  const origin = getOrigin(req);
  const cookie = createSessionCookie({
    uid: user.id,
    provider: 'test',
    exp: user.exp,
  }, origin);
  if (!cookie) {
    sendJson(res, 503, { ok: false, message: '서버 세션 암호가 설정되지 않았습니다.' });
    return;
  }
  res.setHeader('Set-Cookie', cookie);
  sendJson(res, 200, { ok: true, user });
};
