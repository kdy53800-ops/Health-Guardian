const { randomUUID } = require('crypto');
const { requireAuthSession } = require('./admin-auth');
const { fetchSupabase } = require('./supabase');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function encodeEq(value) { return encodeURIComponent(String(value)); }

function numberInRange(value, max) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw Object.assign(new Error('운동 값이 허용 범위를 벗어났습니다.'), { statusCode: 400 });
  return parsed;
}

function normalizeExercise(item) {
  const categories = ['유산소', '근력', '유연성', '스포츠'];
  const intensities = ['하', '중', '상'];
  const name = String(item && item.name || '').trim().slice(0, 80);
  if (!name) return null;
  const duration = numberInRange(item.duration, 999);
  if (!duration) throw Object.assign(new Error('개인 운동 시간은 1분 이상이어야 합니다.'), { statusCode: 400 });
  return {
    category: categories.includes(item.category) ? item.category : '유산소',
    name,
    duration,
    intensity: intensities.includes(item.intensity) ? item.intensity : '중',
    sets: numberInRange(item.sets || 3, 99) || 3,
    reps: numberInRange(item.reps || 10, 999) || 10,
  };
}

function normalizeRoutine(input, userId) {
  if (!input || typeof input !== 'object') throw Object.assign(new Error('루틴 정보가 필요합니다.'), { statusCode: 400 });
  const slot = Number(input.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw Object.assign(new Error('루틴 번호는 1~4여야 합니다.'), { statusCode: 400 });
  const name = String(input.name || '').trim();
  if (!name || name.length > 30) throw Object.assign(new Error('루틴 이름은 1~30자여야 합니다.'), { statusCode: 400 });
  if (!Array.isArray(input.customExercises) || input.customExercises.length > 30) throw Object.assign(new Error('개인 운동은 최대 30종목까지 저장할 수 있습니다.'), { statusCode: 400 });
  const exercises = input.customExercises.map(normalizeExercise).filter(Boolean);
  const row = {
    user_id: userId,
    slot,
    routine_id: String(input.id || randomUUID()).slice(0, 100),
    name,
    walking: numberInRange(input.walking, 999),
    walking_km: numberInRange(input.walkingKm, 999),
    running: numberInRange(input.running, 999),
    running_km: numberInRange(input.runningKm, 999),
    custom_exercises: exercises,
    updated_at: new Date().toISOString(),
  };
  if (!row.walking && !row.walking_km && !row.running && !row.running_km && !exercises.length) {
    throw Object.assign(new Error('운동 내용이 없는 루틴은 저장할 수 없습니다.'), { statusCode: 400 });
  }
  return row;
}

function mapRow(row) {
  return {
    id: row.routine_id, slot: row.slot, name: row.name,
    walking: Number(row.walking) || 0, walkingKm: Number(row.walking_km) || 0,
    running: Number(row.running) || 0, runningKm: Number(row.running_km) || 0,
    customExercises: Array.isArray(row.custom_exercises) ? row.custom_exercises : [],
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (error) { return null; }
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 20000) throw Object.assign(new Error('루틴 내용이 너무 큽니다.'), { statusCode: 413 });
    chunks.push(buffer);
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null; }
  catch (error) { return null; }
}

module.exports = async function handler(req, res) {
  try {
    const auth = await requireAuthSession(req);
    if (!auth.ok) return sendJson(res, auth.statusCode, { ok: false, message: auth.message });
    if (auth.isTest) return sendJson(res, 403, { ok: false, message: '테스트 계정 루틴은 기기에만 저장됩니다.' });
    const userId = auth.id;
    if (req.method === 'GET') {
      const rows = await fetchSupabase(`/rest/v1/record_routines?select=*&user_id=eq.${encodeEq(userId)}&order=slot.asc&limit=4`, { headers: { Accept: 'application/json' } });
      return sendJson(res, 200, { ok: true, routines: Array.isArray(rows) ? rows.map(mapRow) : [] });
    }
    if (req.method === 'POST') {
      const row = normalizeRoutine(await readBody(req), userId);
      const existing = await fetchSupabase(`/rest/v1/record_routines?select=routine_id&user_id=eq.${encodeEq(userId)}&slot=eq.${row.slot}&limit=1`, { headers: { Accept: 'application/json' } });
      if (Array.isArray(existing) && existing[0] && existing[0].routine_id !== row.routine_id) {
        return sendJson(res, 409, { ok: false, message: '이 루틴 자리는 이미 사용 중입니다. 목록을 새로고침해 주세요.' });
      }
      const isUpdate = Array.isArray(existing) && existing.length > 0;
      const path = isUpdate
        ? `/rest/v1/record_routines?user_id=eq.${encodeEq(userId)}&slot=eq.${row.slot}&routine_id=eq.${encodeEq(row.routine_id)}`
        : '/rest/v1/record_routines';
      const saved = await fetchSupabase(path, {
        method: isUpdate ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      if (!Array.isArray(saved) || !saved.length) return sendJson(res, 409, { ok: false, message: '루틴이 다른 기기에서 변경됐습니다. 목록을 새로고침해 주세요.' });
      return sendJson(res, 200, { ok: true, routine: mapRow(saved[0] || row) });
    }
    if (req.method === 'DELETE') {
      const slot = Number(new URL(req.url, 'http://localhost').searchParams.get('slot'));
      if (!Number.isInteger(slot) || slot < 1 || slot > 4) return sendJson(res, 400, { ok: false, message: '루틴 번호가 올바르지 않습니다.' });
      const deleted = await fetchSupabase(`/rest/v1/record_routines?user_id=eq.${encodeEq(userId)}&slot=eq.${slot}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      if (!Array.isArray(deleted) || !deleted.length) return sendJson(res, 404, { ok: false, message: '루틴을 찾을 수 없습니다.' });
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
  } catch (error) {
    const status = error.statusCode || (error.status === 409 ? 409 : 500);
    if (status >= 500) console.error('[RecordRoutinesAPI]', error);
    return sendJson(res, status, { ok: false, message: status >= 500 ? '루틴 서버에 연결하지 못했습니다.' : error.message });
  }
};
