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
  if (req.method !== 'PATCH') {
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
    if (!body || !body.userId) {
      sendJson(res, 400, { ok: false, message: 'userId is required.' });
      return;
    }

    const userId = String(body.userId).trim();
    const isSpecial = !!body.isSpecial;


    const rows = await fetchSupabase(`/rest/v1/profiles?id=eq.${encodeEq(userId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ is_special: isSpecial }),
    });

    if (!Array.isArray(rows) || !rows.length) {
      sendJson(res, 404, { ok: false, message: 'User not found or update failed.' });
      return;
    }

    sendJson(res, 200, { ok: true, user: rows[0] });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      message: error && error.message ? error.message : 'Failed to update special status.',
    });
  }
};
