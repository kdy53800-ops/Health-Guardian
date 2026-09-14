const { randomUUID } = require('crypto');
const { fetchSupabase } = require('./_lib/supabase');
const { getOrigin } = require('./_lib/naver');
const { requireAuthSession } = require('./_lib/admin-auth');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function encodeEq(value) {
  return encodeURIComponent(String(value));
}

function sanitizeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function numberInRange(value, label, min, max) {
  if (value == null || value === '') return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    const error = new Error(`${label} 값이 허용 범위를 벗어났습니다.`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function sanitizeText(value, fallback = '') {
  if (value == null) return fallback;
  return String(value);
}

function sanitizeCustomExercises(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > 30) {
    const error = new Error('개인 운동은 한 기록에 최대 30개까지 저장할 수 있습니다.');
    error.statusCode = 400;
    throw error;
  }
  const categories = new Set(['유산소', '근력', '유연성', '스포츠']);
  const intensities = new Set(['하', '중', '상']);
  return value
    .map(item => ({
      id: sanitizeText(item && item.id, randomUUID()).slice(0, 100),
      category: categories.has(item && item.category) ? item.category : '유산소',
      name: sanitizeText(item && item.name, '').trim().slice(0, 80),
      duration: numberInRange(item && item.duration, '개인 운동 시간', 1, 999),
      intensity: intensities.has(item && item.intensity) ? item.intensity : '중',
    }))
    .filter(item => item.name);
}

function mapRowToRecord(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.record_date,
    weight: sanitizeNumber(row.weight),
    walking: sanitizeNumber(row.walking),
    running: sanitizeNumber(row.running),
    walkingKm: sanitizeNumber(row.walking_km),
    runningKm: sanitizeNumber(row.running_km),
    squats: sanitizeNumber(row.squats),
    pushups: sanitizeNumber(row.pushups),
    situps: sanitizeNumber(row.situps),
    water: sanitizeNumber(row.water),
    fasting: sanitizeNumber(row.fasting),
    heartRate: sanitizeNumber(row.heart_rate),
    diet: sanitizeText(row.diet, ''),
    condition: Number(row.condition) || 3,
    memo: sanitizeText(row.memo, ''),
    customExercises: Array.isArray(row.custom_exercises) ? row.custom_exercises : [],
    savedAt: row.saved_at || row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function normalizeRecord(input, userId) {
  const source = input || {};
  const date = sanitizeText(source.date, '').trim();
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    const error = new Error('날짜 형식이 올바르지 않습니다.');
    error.statusCode = 400;
    throw error;
  }
  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  const todayInKorea = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  if (date > todayInKorea) {
    const error = new Error('미래 날짜는 기록할 수 없습니다.');
    error.statusCode = 400;
    throw error;
  }

  const condition = Number(source.condition || 3);
  if (!Number.isInteger(condition) || condition < 1 || condition > 5) {
    const error = new Error('컨디션 값이 올바르지 않습니다.');
    error.statusCode = 400;
    throw error;
  }
  const memo = sanitizeText(source.memo, '').trim();
  if (memo.length > 1000) {
    const error = new Error('메모는 1,000자 이내로 입력해 주세요.');
    error.statusCode = 400;
    throw error;
  }

  return {
    id: sanitizeText(source.id, '').slice(0, 100) || randomUUID(),
    user_id: userId,
    record_date: date,
    weight: numberInRange(source.weight, '체중', 0, 300),
    walking: numberInRange(source.walking, '걷기 시간', 0, 999),
    running: numberInRange(source.running, '러닝 시간', 0, 999),
    walking_km: numberInRange(source.walkingKm, '걷기 거리', 0, 999),
    running_km: numberInRange(source.runningKm, '러닝 거리', 0, 999),
    squats: numberInRange(source.squats, '스쿼트', 0, 99999),
    pushups: numberInRange(source.pushups, '푸쉬업', 0, 99999),
    situps: numberInRange(source.situps, '윗몸일으키기', 0, 99999),
    water: numberInRange(source.water, '수분 섭취량', 0, 9999),
    fasting: numberInRange(source.fasting, '공복 시간', 0, 48),
    heart_rate: numberInRange(source.heartRate, '심박수', 0, 300),
    diet: sanitizeText(source.diet, '').slice(0, 2000),
    condition,
    memo,
    custom_exercises: sanitizeCustomExercises(source.customExercises),
    saved_at: sanitizeText(source.savedAt, '') || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
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

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function getRecords(userId) {
  const rows = await fetchSupabase(
    `/rest/v1/daily_records?select=*&user_id=eq.${encodeEq(userId)}&order=record_date.asc`,
    { headers: { Accept: 'application/json' } }
  );
  return Array.isArray(rows) ? rows.map(mapRowToRecord) : [];
}

async function findRecordById(userId, recordId) {
  const rows = await fetchSupabase(
    `/rest/v1/daily_records?select=*&id=eq.${encodeEq(recordId)}&user_id=eq.${encodeEq(userId)}&limit=1`,
    { headers: { Accept: 'application/json' } }
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function findRecordByDate(userId, recordDate) {
  const rows = await fetchSupabase(
    `/rest/v1/daily_records?select=*&user_id=eq.${encodeEq(userId)}&record_date=eq.${encodeEq(recordDate)}&limit=1`,
    { headers: { Accept: 'application/json' } }
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function insertRecord(row) {
  const rows = await fetchSupabase('/rest/v1/daily_records', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : row;
}

async function updateRecord(userId, recordId, row) {
  const rows = await fetchSupabase(
    `/rest/v1/daily_records?id=eq.${encodeEq(recordId)}&user_id=eq.${encodeEq(userId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    }
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    const origin = getOrigin(req);
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  try {
    const auth = await requireAuthSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }
    const userId = auth.id;

    if (req.method === 'GET') {
      const records = await getRecords(userId);
      sendJson(res, 200, { ok: true, records });
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body) {
        sendJson(res, 400, { ok: false, message: 'JSON body is required.' });
        return;
      }

      const row = normalizeRecord(body.record || body, userId);
      const existingById = await findRecordById(userId, row.id);
      const existingByDate = await findRecordByDate(userId, row.record_date);
      if (existingByDate && (!existingById || existingByDate.id !== existingById.id)) {
        sendJson(res, 409, {
          ok: false,
          code: 'duplicate_date',
          message: 'A record already exists for this date.',
          existingRecord: mapRowToRecord(existingByDate),
        });
        return;
      }

      const savedRow = existingById
        ? await updateRecord(userId, row.id, row)
        : await insertRecord(row);

      sendJson(res, 200, { ok: true, record: mapRowToRecord(savedRow) });
      return;
    }

    if (req.method === 'DELETE') {
      const requestUrl = new URL(req.url, 'http://localhost');
      const recordId = (requestUrl.searchParams.get('id') || '').trim();
      if (!recordId) {
        sendJson(res, 400, { ok: false, message: 'Record id is required.' });
        return;
      }

      const rows = await fetchSupabase(
        `/rest/v1/daily_records?id=eq.${encodeEq(recordId)}&user_id=eq.${encodeEq(userId)}`,
        {
          method: 'DELETE',
          headers: { Prefer: 'return=representation' },
        }
      );
      if (!Array.isArray(rows) || !rows.length) {
        sendJson(res, 404, { ok: false, message: 'Record not found.' });
        return;
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
  } catch (error) {
    const statusCode = error && error.statusCode ? error.statusCode : 500;
    if (statusCode >= 500) console.error('[RecordsAPI]', error);
    const message = statusCode < 500 && error && error.message
      ? error.message
      : '기록 처리 중 서버 오류가 발생했습니다.';
    sendJson(res, statusCode, { ok: false, message });
  }
};
