const { fetchSupabase } = require('./_lib/supabase');
const { readSessionFromRequest } = require('./_lib/session');
const { getOrigin } = require('./_lib/naver');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    const origin = getOrigin(req);
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const session = readSessionFromRequest(req);
    if (!session || !session.uid) {
      sendJson(res, 401, { ok: false, message: 'Login session is required to delete account.' });
      return;
    }

    const userId = session.uid;

    // Supabase Admin API를 통해 유저 삭제
    // (ON DELETE CASCADE에 의해 profiles 및 daily_records도 삭제됨)
    await fetchSupabase(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });

    sendJson(res, 200, { ok: true, message: 'Account deleted successfully.' });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      message: error && error.message ? error.message : 'Failed to delete account.',
    });
  }
};
