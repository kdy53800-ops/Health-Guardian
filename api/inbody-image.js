const { requireAdminSession, requireAuthSession } = require('./_lib/admin-auth');
const { extractObjectPath } = require('./_lib/inbody-storage');
const { fetchSupabase, getSupabaseEnv } = require('./_lib/supabase');

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
    const auth = await requireAuthSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }

    const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
    if (!id) {
      sendJson(res, 400, { ok: false, message: 'Record id is required.' });
      return;
    }
    const rows = await fetchSupabase(
      `/rest/v1/inbody_records?select=id,user_id,image_url&id=eq.${encodeURIComponent(id)}&limit=1`,
      { headers: { Accept: 'application/json' } }
    );
    const record = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!record || !record.image_url) {
      sendJson(res, 404, { ok: false, message: 'Image not found.' });
      return;
    }

    if (record.user_id !== auth.id) {
      const admin = await requireAdminSession(req);
      if (!admin.ok) {
        sendJson(res, 403, { ok: false, message: 'Access denied.' });
        return;
      }
    }

    const objectPath = extractObjectPath(record.image_url);
    if (!objectPath) {
      sendJson(res, 404, { ok: false, message: 'Image path is invalid.' });
      return;
    }
    const { supabaseUrl, serviceRoleKey } = getSupabaseEnv();
    const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodedPath}`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!response.ok) {
      sendJson(res, response.status === 404 ? 404 : 502, { ok: false, message: 'Image could not be loaded.' });
      return;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(bytes);
  } catch (error) {
    console.error('[InbodyImageAPI]', error);
    sendJson(res, 500, { ok: false, message: 'Failed to load image.' });
  }
};
