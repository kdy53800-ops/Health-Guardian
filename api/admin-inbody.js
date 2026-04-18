const { fetchSupabase } = require('./_lib/supabase');
const { requireAdminSession } = require('./_lib/admin-auth');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  // Only POST allowed for saving
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    // 1. Check Admin Session
    const auth = await requireAdminSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }

    const { userId, date, weight, skeletalMuscle, bodyFatMass, bmi, bodyFatPercent, ecwRatio, inbodyScore, imageBase64, fileName } = req.body;

    if (!userId || !date) {
      sendJson(res, 400, { ok: false, message: 'Missing required fields' });
      return;
    }

    let imageUrl = null;

    // 2. Handle Image Upload if provided (Base64)
    if (imageBase64 && fileName) {
      const buffer = Buffer.from(imageBase64.split(',')[1], 'base64');
      const uploadPath = `inbody_images/${userId}/${date}_${Math.random().toString(36).substring(2, 7)}_${fileName}`;
      
      const uploadRes = await fetchSupabase(`/storage/v1/object/${uploadPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png', // Default or detect from fileName
        },
        body: buffer
      });

      // Get Public URL
      const { supabaseUrl } = require('./_lib/supabase').getSupabaseEnv();
      imageUrl = `${supabaseUrl}/storage/v1/object/public/${uploadPath}`;
    }

    // 3. Upsert Record into DB
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

  } catch (error) {
    console.error('[AdminInbodyAPI]', error);
    sendJson(res, 500, { ok: false, message: error.message || 'Internal Server Error' });
  }
};
