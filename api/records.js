const { randomUUID } = require('crypto');
const { fetchSupabase } = require('./_lib/supabase');
const { getOrigin } = require('./_lib/naver');
const { readSessionFromRequest } = require('./_lib/session');

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

function sanitizeText(value, fallback = '') {
  if (value == null) return fallback;
  return String(value);
}

function sanitizeCustomExercises(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => ({
      id: sanitizeText(item && item.id, randomUUID()),
      category: sanitizeText(item && item.category, ''),
      name: sanitizeText(item && item.name, '').trim(),
      duration: sanitizeNumber(item && item.duration),
      intensity: sanitizeText(item && item.intensity, '중'),
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
    water: sanitizeNumber(row.water),
    fasting: sanitizeNumber(row.fasting),
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('record.date must be in YYYY-MM-DD format.');
  }

  return {
    id: sanitizeText(source.id, '') || randomUUID(),
    user_id: userId,
    record_date: date,
    weight: sanitizeNumber(source.weight),
    walking: sanitizeNumber(source.walking),
    running: sanitizeNumber(source.running),
    walking_km: sanitizeNumber(source.walkingKm),
    running_km: sanitizeNumber(source.runningKm),
    water: sanitizeNumber(source.water),
    fasting: sanitizeNumber(source.fasting),
    diet: sanitizeText(source.diet, ''),
    condition: Number(source.condition) || 3,
    memo: sanitizeText(source.memo, '').trim(),
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

  const session = readSessionFromRequest(req);
  if (!session || !session.uid) {
    sendJson(res, 401, { ok: false, message: 'Login session is required.' });
    return;
  }

  const userId = session.uid;

  try {
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
    const message = error && error.message ? error.message : 'Failed to handle records.';
    sendJson(res, 500, { ok: false, message });
  }
};
