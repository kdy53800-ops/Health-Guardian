const { randomUUID } = require('crypto');
const { fetchSupabase } = require('./_lib/supabase');
const { requireAdminSession } = require('./_lib/admin-auth');
const { BUCKET, extractObjectPath, privateImageUrl } = require('./_lib/inbody-storage');
const { writeAdminAudit } = require('./_lib/audit');
const { buildTestInbodyRecords } = require('./_lib/test-fixtures');

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(buffer);
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

    if (auth.session.provider === 'test') {
      if (req.method === 'GET') {
        const userId = requestUrl.searchParams.get('userId');
        if (!userId) { sendJson(res, 400, { ok:false, message:'Missing userId' }); return; }
        sendJson(res, 200, { ok:true, records:buildTestInbodyRecords(userId), demo:true });
        return;
      }
      sendJson(res, 403, { ok:false, message:'테스트 계정에서는 가상 데이터를 변경할 수 없습니다.' });
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
      const safeRecords = Array.isArray(records)
        ? records.map(record => ({ ...record, image_url: record.image_url ? privateImageUrl(record.id) : null }))
        : [];
      await writeAdminAudit(auth, 'view_inbody_records', { targetType: 'user', targetId: userId, details: { recordCount: safeRecords.length } });
      sendJson(res, 200, { ok: true, records: safeRecords });
      return;
    }

    // --- POST: Save or Update record ---
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body) {
        sendJson(res, 400, { ok: false, message: 'JSON body is required' });
        return;
      }

      const { userId, date, weight, skeletalMuscle, bodyFatMass, bmi, bodyFatPercent, ecwRatio, inbodyScore, phaseAngle, imageBase64, fileName } = body;

      if (!userId || !date) {
        sendJson(res, 400, { ok: false, message: 'Missing required fields' });
        return;
      }

      const numericFields = { weight, skeletalMuscle, bodyFatMass, bmi, bodyFatPercent, ecwRatio, inbodyScore, phaseAngle };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Object.values(numericFields).some(value => !Number.isFinite(Number(value)))) {
        sendJson(res, 400, { ok: false, message: '날짜와 측정값을 올바르게 입력해 주세요.' });
        return;
      }

      let imageUrl = null;
      if (imageBase64 && fileName) {
        const match = String(imageBase64).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
        if (!match) {
          sendJson(res, 400, { ok: false, message: '지원하지 않는 이미지 형식입니다.' });
          return;
        }
        const buffer = Buffer.from(match[2], 'base64');
        if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
          sendJson(res, 413, { ok: false, message: '이미지는 2MB 이하만 업로드할 수 있습니다.' });
          return;
        }
        const uploadPath = `${BUCKET}/${userId}/${date}_${randomUUID()}.jpg`;
        
        await fetchSupabase(`/storage/v1/object/${uploadPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
          body: buffer
        });
        imageUrl = uploadPath;
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
        phase_angle: parseFloat(phaseAngle || 0),
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
      await writeAdminAudit(auth, 'upsert_inbody_record', { targetType: 'user', targetId: userId, details: { recordDate: date, hasImage: !!imageUrl } });
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
          const storagePath = extractObjectPath(record.image_url);
          if (storagePath) {
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

      await writeAdminAudit(auth, 'delete_inbody_record', { targetType: 'inbody_record', targetId: id, details: { hadImage: !!(record && record.image_url) } });
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });

  } catch (error) {
    console.error('[AdminInbodyAPI]', error);
    sendJson(res, error.statusCode || 500, { ok: false, message: error.message || 'Internal Server Error' });
  }
};
