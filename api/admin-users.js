const { fetchSupabase } = require('./_lib/supabase');
const { requireAdminSession } = require('./_lib/admin-auth');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function encodeEq(value) {
  return encodeURIComponent(String(value));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return null;
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return null;

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const auth = await requireAdminSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }

    const body = await readBody(req);
    const userId = body && body.userId ? String(body.userId).trim() : '';
    if (!userId) {
      sendJson(res, 400, { ok: false, message: 'userId is required.' });
      return;
    }
    if (userId === auth.profile.id) {
      sendJson(res, 400, { ok: false, message: 'Cannot delete yourself.' });
      return;
    }

    const profiles = await fetchSupabase(
      `/rest/v1/profiles?select=id,is_admin&id=eq.${encodeEq(userId)}&limit=1`,
      { headers: { Accept: 'application/json' } }
    );
    const targetProfile = Array.isArray(profiles) && profiles[0] ? profiles[0] : null;
    if (!targetProfile) {
      sendJson(res, 404, { ok: false, message: 'User not found.' });
      return;
    }
    if (targetProfile.is_admin) {
      sendJson(res, 400, { ok: false, message: 'Cannot delete an admin user.' });
      return;
    }

    await fetchSupabase(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });

    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      message: error && error.message ? error.message : 'Failed to delete user.',
    });
  }
};
