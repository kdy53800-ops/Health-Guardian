const { createSessionCookie } = require('./_lib/session');
const { getOrigin } = require('./_lib/naver');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    const origin = getOrigin(req);
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, message: 'Method Not Allowed' }));
    return;
  }

  try {
    let body = {};
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyStr = Buffer.concat(chunks).toString();
      if (bodyStr) body = JSON.parse(bodyStr);
    }

    const { type } = body;

    const uid = type === 'admin' ? 'test_admin_001' : 'test_user_001';
    const origin = getOrigin(req);
    const cookie = createSessionCookie({
      uid,
      provider: 'test',
      exp: Date.now() + 1000 * 60 * 60 * 24 * 14
    }, origin);

    res.setHeader('Set-Cookie', cookie);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, uid }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, message: 'Server error' }));
  }
};
