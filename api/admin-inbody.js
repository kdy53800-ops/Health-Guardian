const { randomUUID } = require('crypto');
const { fetchSupabase } = require('./_lib/supabase');
const { requireAdminSession } = require('./_lib/admin-auth');
const { BUCKET, extractObjectPath, privateImageUrl } = require('./_lib/inbody-storage');
const { writeAdminAudit } = require('./_lib/audit');
const { buildTestAdminData, buildTestInbodyRecords } = require('./_lib/test-fixtures');

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

function mapOverviewUser(row) {
  return {
    id: row.id,
    name: row.name || row.username || '사용자',
    username: row.username || '',
    isSpecial: row.isSpecial === true || row.is_special === true,
  };
}

function mapOverviewRecord(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.record_date,
    weight: Number(row.weight) || 0,
    muscle: Number(row.skeletal_muscle) || 0,
    fat: Number(row.body_fat_percent) || 0,
    score: Number(row.inbody_score) || 0,
  };
}

function validatedNumber(value, label, min, max, integer = false) {
  if (value === '' || value == null) {
    throw Object.assign(new Error(`${label} 값을 입력해 주세요.`), { statusCode: 400 });
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw Object.assign(new Error(`${label} 값이 허용 범위를 벗어났습니다.`), { statusCode: 400 });
  }
  return number;
}

function validateRecordDate(value) {
  const date = String(value || '');
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error('측정일자 형식이 올바르지 않습니다.'), { statusCode: 400 });
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (date > today) {
    throw Object.assign(new Error('미래 날짜의 인바디 기록은 저장할 수 없습니다.'), { statusCode: 400 });
  }
  return date;
}

async function getAllInbodyRecords() {
  const records = [];
  for (let offset = 0; offset < 30000; offset += 1000) {
    const page = await fetchSupabase(
      `/rest/v1/inbody_records?select=id,user_id,record_date,weight,skeletal_muscle,body_fat_percent,inbody_score&order=record_date.desc&limit=1000&offset=${offset}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!Array.isArray(page) || !page.length) break;
    records.push(...page);
    if (page.length < 1000) break;
  }
  return records;
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
        if (!userId) {
          const users = buildTestAdminData().users;
          const records = users.flatMap(user => buildTestInbodyRecords(user.id)).map(mapOverviewRecord);
          sendJson(res, 200, { ok:true, users, records, demo:true });
          return;
        }
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
        const [profiles, records] = await Promise.all([
          fetchSupabase('/rest/v1/profiles?select=id,name,username,is_special&order=created_at.asc', {
            headers: { Accept: 'application/json' },
          }),
          getAllInbodyRecords(),
        ]);
        await writeAdminAudit(auth, 'view_inbody_overview', {
          targetType: 'inbody_records',
          details: {
            userCount: Array.isArray(profiles) ? profiles.length : 0,
            recordCount: records.length,
          },
        });
        sendJson(res, 200, {
          ok: true,
          users: Array.isArray(profiles) ? profiles.map(mapOverviewUser) : [],
          records: records.map(mapOverviewRecord),
        });
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

      const safeUserId = String(userId || '').trim();
      if (!safeUserId || !/^[A-Za-z0-9_-]{1,100}$/.test(safeUserId) || !date) {
        sendJson(res, 400, { ok: false, message: 'Missing required fields' });
        return;
      }

      const recordDate = validateRecordDate(date);
      const values = {
        weight: validatedNumber(weight, '체중', 20, 500),
        skeletalMuscle: validatedNumber(skeletalMuscle, '골격근량', 0, 200),
        bodyFatMass: validatedNumber(bodyFatMass, '체지방량', 0, 300),
        bmi: validatedNumber(bmi, 'BMI', 5, 100),
        bodyFatPercent: validatedNumber(bodyFatPercent, '체지방률', 0, 100),
        ecwRatio: validatedNumber(ecwRatio, '세포외수분비', 0.1, 1),
        inbodyScore: validatedNumber(inbodyScore, '인바디 점수', 0, 200, true),
        phaseAngle: validatedNumber(phaseAngle, '위상각', 0, 30),
      };
      const profiles = await fetchSupabase(`/rest/v1/profiles?select=id&id=eq.${encodeURIComponent(safeUserId)}&limit=1`, {
        headers: { Accept: 'application/json' },
      });
      if (!Array.isArray(profiles) || !profiles.length) {
        sendJson(res, 404, { ok: false, message: '사용자를 찾을 수 없습니다.' });
        return;
      }

      const existingRows = await fetchSupabase(
        `/rest/v1/inbody_records?select=id,image_url&user_id=eq.${encodeURIComponent(safeUserId)}&record_date=eq.${encodeURIComponent(recordDate)}&limit=1`,
        { headers: { Accept: 'application/json' } }
      );
      const existing = Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;

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
        const imageFormat = match[1];
        const imageType = imageFormat === 'png' ? 'image/png' : imageFormat === 'webp' ? 'image/webp' : 'image/jpeg';
        const imageExtension = imageFormat === 'jpeg' ? 'jpg' : imageFormat;
        const uploadPath = `${BUCKET}/${safeUserId}/${recordDate}_${randomUUID()}.${imageExtension}`;
        
        await fetchSupabase(`/storage/v1/object/${uploadPath}`, {
          method: 'POST',
          headers: { 'Content-Type': imageType, 'x-upsert': 'false' },
          body: buffer
        });
        imageUrl = uploadPath;
      }

      const recordId = existing && existing.id ? existing.id : `inbody_${Date.now()}_${Math.random().toString(36).slice(2,11)}`;
      const payload = {
        id: recordId,
        user_id: safeUserId,
        record_date: recordDate,
        weight: values.weight,
        skeletal_muscle: values.skeletalMuscle,
        body_fat_mass: values.bodyFatMass,
        bmi: values.bmi,
        body_fat_percent: values.bodyFatPercent,
        ecw_ratio: values.ecwRatio,
        inbody_score: values.inbodyScore,
        phase_angle: values.phaseAngle,
      };
      if (imageUrl) payload.image_url = imageUrl;
      else if (existing && existing.image_url) payload.image_url = existing.image_url;

      let dbRes;
      try {
        dbRes = await fetchSupabase('/rest/v1/inbody_records?on_conflict=user_id,record_date', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(payload)
        });
      } catch (error) {
        if (imageUrl) {
          try { await fetchSupabase(`/storage/v1/object/${imageUrl}`, { method: 'DELETE' }); } catch (cleanupError) {
            console.warn('[AdminInbodyAPI] Failed to clean up uploaded image:', cleanupError.message);
          }
        }
        throw error;
      }

      if (imageUrl && existing && existing.image_url && existing.image_url !== imageUrl) {
        try {
          const previousPath = extractObjectPath(existing.image_url);
          if (previousPath) await fetchSupabase(`/storage/v1/object/${previousPath}`, { method: 'DELETE' });
        } catch (cleanupError) {
          console.warn('[AdminInbodyAPI] Failed to delete replaced image:', cleanupError.message);
        }
      }
      await writeAdminAudit(auth, 'upsert_inbody_record', { targetType: 'user', targetId: safeUserId, details: { recordDate, hasImage: !!imageUrl } });
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
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, {
      ok: false,
      message: statusCode < 500 && error.message ? error.message : '인바디 기록 처리 중 서버 오류가 발생했습니다.',
    });
  }
};
