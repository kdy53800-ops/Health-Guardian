const { fetchSupabase } = require('./_lib/supabase');
const { requireAdminSession } = require('./_lib/admin-auth');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');

  try {
    // 1. Check Admin Session
    const auth = await requireAdminSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }

    // --- GET: Fetch records for a specific user ---
    if (req.method === 'GET') {
      const userId = requestUrl.searchParams.get('userId');
      if (!userId) {
        sendJson(res, 400, { ok: false, message: 'Missing userId' });
        return;
      }

      const records = await fetchSupabase(`/rest/v1/inbody_records?user_id=eq.${encodeURIComponent(userId)}&order=record_date.desc`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      sendJson(res, 200, { ok: true, records: Array.isArray(records) ? records : [] });
      return;
    }

    // --- POST: Save or Update record ---
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body) {
        sendJson(res, 400, { ok: false, message: 'JSON body is required' });
        return;
      }

      const { userId, date, weight, skeletalMuscle, bodyFatMass, bmi, bodyFatPercent, ecwRatio, inbodyScore, imageBase64, fileName } = body;

      if (!userId || !date) {
        sendJson(res, 400, { ok: false, message: 'Missing required fields' });
        return;
      }

      let imageUrl = null;
      if (imageBase64 && fileName) {
        const buffer = Buffer.from(imageBase64.split(',')[1], 'base64');
        const uploadPath = `inbody_images/${userId}/${date}_${Math.random().toString(36).substring(2, 7)}_${fileName}`;
        await fetchSupabase(`/storage/v1/object/${uploadPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png' },
          body: buffer
        });
        const { supabaseUrl } = require('./_lib/supabase').getSupabaseEnv();
        imageUrl = `${supabaseUrl}/storage/v1/object/public/${uploadPath}`;
      }

      const recordId = `inbody_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
      const payload = {
        id: recordId,
        user_id: userId,
        record_date: date,
        weight: parseFloat(weight),
        skeletal_muscle: parseFloat(skeletalMuscle),
        body_fat_mass: parseFloat(bodyFatMass),
        bmi: parseFloat(bmi),
        body_fat_percent: parseFloat(bodyFatPercent),
        ecw_ratio: parseFloat(ecwRatio),
        inbody_score: parseInt(inbodyScore),
      };
      if (imageUrl) payload.image_url = imageUrl;

      const dbRes = await fetchSupabase('/rest/v1/inbody_records?on_conflict=user_id,record_date', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(payload)
      });
      sendJson(res, 200, { ok: true, data: dbRes });
      return;
    }

    // --- DELETE: Remove a record ---
    if (req.method === 'DELETE') {
      const id = requestUrl.searchParams.get('id');
      if (!id) {
        sendJson(res, 400, { ok: false, message: 'Missing record id' });
        return;
      }

      // 1. Get the record first to check for image_url
      const records = await fetchSupabase(`/rest/v1/inbody_records?id=eq.${encodeURIComponent(id)}&select=image_url`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      const record = Array.isArray(records) && records[0] ? records[0] : null;
      
      if (record && record.image_url) {
        try {
          // Extract storage path: /public/inbody_images/userId/fileName
          const urlParts = record.image_url.split('/storage/v1/object/public/inbody_images/');
          if (urlParts.length === 2) {
            const storagePath = `inbody_images/${urlParts[1]}`;
            await fetchSupabase(`/storage/v1/object/${storagePath}`, {
              method: 'DELETE'
            });
          }
        } catch (storageErr) {
          console.warn('[AdminInbodyAPI] Failed to delete storage object:', storageErr.message);
          // Continue with DB deletion even if storage fails
        }
      }

      // 2. Perform DB delete
      const deletedRows = await fetchSupabase(`/rest/v1/inbody_records?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Prefer': 'return=representation' }
      });
      
      const success = Array.isArray(deletedRows) && deletedRows.length > 0;
      if (!success) {
        sendJson(res, 404, { ok: false, message: 'Record not found or already deleted.' });
        return;
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });

  } catch (error) {
    console.error('[AdminInbodyAPI]', error);
    sendJson(res, 500, { ok: false, message: error.message || 'Internal Server Error' });
  }
};
