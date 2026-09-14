const {
  buildCallbackUrl,
  buildNaverAuthorizeUrl,
  createState,
  createStateCookie,
  getOrigin,
  getRequestUrl,
  redirectWithError,
  resolveRedirectTo,
} = require('./_lib/naver');

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

function handleTestLogin(req, res, origin) {
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
  const cookie = createSessionCookie({ uid: user.id, provider: 'test', exp: user.exp }, origin);
  if (!cookie) {
    sendJson(res, 503, { ok: false, message: '서버 세션 암호가 설정되지 않았습니다.' });
    return;
  }
  res.setHeader('Set-Cookie', cookie);
  sendJson(res, 200, { ok: true, user });
}

module.exports = function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID || '';
  const clientSecret = process.env.NAVER_CLIENT_SECRET || '';
  const origin = getOrigin(req);
  if (req.method === 'POST') {
    handleTestLogin(req, res, origin);
    return;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }
  const requestUrl = getRequestUrl(req, origin, '/api/naver-login');
  const redirectTo = resolveRedirectTo(requestUrl, origin);

  if (!clientId || !clientSecret) {
    redirectWithError(
      res,
      redirectTo,
      'naver_config_missing',
      'NAVER_CLIENT_ID or NAVER_CLIENT_SECRET is missing.'
    );
    return;
  }

  const state = createState(redirectTo);

  res.statusCode = 302;
  res.setHeader('Set-Cookie', createStateCookie(state.nonce, origin));
  res.setHeader('Location', buildNaverAuthorizeUrl({
    clientId,
    callbackUrl: buildCallbackUrl(origin),
    state: state.payload,
  }));
  res.end();
};
const { timingSafeEqual } = require('crypto');
const { createSessionCookie, SESSION_TTL_SECONDS } = require('./_lib/session');
