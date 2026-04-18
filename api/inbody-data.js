const { fetchSupabase } = require('./_lib/supabase');
const { requireAuthSession } = require('./_lib/admin-auth');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    // 1. Get Logged-in User from Session
    const auth = await requireAuthSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }

    // 2. Fetch Records for this user
    const records = await fetchSupabase(`/rest/v1/inbody_records?user_id=eq.${auth.id}&order=record_date.desc`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    sendJson(res, 200, { ok: true, records: Array.isArray(records) ? records : [] });

  } catch (error) {
    console.error('[UserInbodyAPI]', error);
    sendJson(res, 500, { ok: false, message: error.message || 'Internal Server Error' });
  }
};
