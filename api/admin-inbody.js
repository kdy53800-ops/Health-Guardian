const { fetchSupabase } = require('./_lib/supabase');
const { requireAdminSession } = require('./_lib/admin-auth');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  try {
    // 1. Check Admin Session
    const auth = await requireAdminSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }

    // --- GET: Fetch records for a specific user ---
    if (req.method === 'GET') {
      const { userId } = req.query;
      if (!userId) {
        sendJson(res, 400, { ok: false, message: 'Missing userId' });
        return;
      }

      const records = await fetchSupabase(`/rest/v1/inbody_records?user_id=eq.${userId}&order=record_date.desc`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      sendJson(res, 200, { ok: true, records: Array.isArray(records) ? records : [] });
      return;
    }

    // --- POST: Save or Update record ---
    if (req.method === 'POST') {
      const { userId, date, weight, skeletalMuscle, bodyFatMass, bmi, bodyFatPercent, ecwRatio, inbodyScore, imageBase64, fileName } = req.body;

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
      const { id } = req.query;
      if (!id) {
        sendJson(res, 400, { ok: false, message: 'Missing record id' });
        return;
      }

      await fetchSupabase(`/rest/v1/inbody_records?id=eq.${id}`, {
        method: 'DELETE'
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });

  } catch (error) {
    console.error('[AdminInbodyAPI]', error);
    sendJson(res, 500, { ok: false, message: error.message || 'Internal Server Error' });
  }
};
