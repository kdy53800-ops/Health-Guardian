const { buildCookie } = require('./_lib/session');

module.exports = async function handler(req, res) {
  // Clear the session cookie
  res.setHeader('Set-Cookie', buildCookie('app_session', '', { maxAge: -1 }));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true }));
};
