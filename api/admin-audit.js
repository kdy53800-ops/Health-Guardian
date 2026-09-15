const { fetchSupabase } = require('./_lib/supabase');
const { requireAdminSession } = require('./_lib/admin-auth');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }
  try {
    const auth = await requireAdminSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }
    if (auth.session.provider === 'test') {
      sendJson(res, 200, { ok: true, logs: [] });
      return;
    }
    const rows = await fetchSupabase('/rest/v1/admin_audit_logs?select=id,actor_name,action,target_type,target_id,details,created_at&order=created_at.desc&limit=50', {
      headers: { Accept: 'application/json' },
    });
    sendJson(res, 200, { ok: true, logs: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message || 'Failed to load audit logs.' });
  }
};
