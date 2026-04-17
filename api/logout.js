const { clearSessionCookie } = require('./_lib/session');
const { getOrigin } = require('./_lib/naver');

module.exports = function handler(req, res) {
  const origin = getOrigin(req);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Set-Cookie', clearSessionCookie(origin));
  res.end(JSON.stringify({ ok: true }));
};
