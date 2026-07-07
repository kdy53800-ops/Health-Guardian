const { clearSessionCookie } = require('./_lib/session');
const { getOrigin } = require('./_lib/naver');

module.exports = async function handler(req, res) {
  const origin = getOrigin(req);
  // Clear the session cookie
  res.setHeader('Set-Cookie', clearSessionCookie(origin));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true }));
};
