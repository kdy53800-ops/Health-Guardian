const { fetchSupabase } = require('./_lib/supabase');
const { requireAdminSession } = require('./_lib/admin-auth');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function mapProfile(row) {
  return {
    id: row.id,
    name: row.name || row.username || row.email || 'User',
    username: row.username || '',
    email: row.email || '',
    phone: row.phone || '',
    isAdmin: !!row.is_admin,
    isSpecial: !!row.is_special,
    createdAt: row.created_at || new Date().toISOString(),
    supabaseUserId: row.id,
    authProvider: row.auth_provider || 'naver',
    gender: row.gender || '',
    birthyear: row.birthyear || '',
  };
}

function mapRecord(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.record_date,
    weight: Number(row.weight) || 0,
    walking: Number(row.walking) || 0,
    running: Number(row.running) || 0,
    walkingKm: Number(row.walking_km) || 0,
    runningKm: Number(row.running_km) || 0,
    squats: Number(row.squats) || 0,
    pushups: Number(row.pushups) || 0,
    situps: Number(row.situps) || 0,
    water: Number(row.water) || 0,
    fasting: Number(row.fasting) || 0,
    diet: row.diet || '',
    condition: Number(row.condition) || 3,
    memo: row.memo || '',
    customExercises: Array.isArray(row.custom_exercises) ? row.custom_exercises : [],
    savedAt: row.saved_at || row.updated_at || row.created_at || new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const auth = await requireAdminSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }

    // 1. 프로필은 그대로 가져옴 (사용자 수가 1000명을 넘는 경우는 드물지만, 안전을 위해 기본 유지)
    const profiles = await fetchSupabase('/rest/v1/profiles?select=*&order=created_at.asc', {
      headers: { Accept: 'application/json' },
    });

    // 2. 일별 기록은 1000건 제한을 피하기 위해 페이지네이션 수행 (최대 30,000건까지)
    let allRecords = [];
    for (let i = 0; i < 30; i++) {
      const from = i * 1000;
      const to = from + 999;
      const records = await fetchSupabase(`/rest/v1/daily_records?select=*&order=record_date.desc&limit=1000&offset=${from}`, {
        headers: { 
          Accept: 'application/json',
          'Range-Unit': 'items',
          'Range': `${from}-${to}` 
        },
      });

      if (!Array.isArray(records) || records.length === 0) break;
      allRecords = allRecords.concat(records);
      if (records.length < 1000) break;
    }

    sendJson(res, 200, {
      ok: true,
      users: Array.isArray(profiles) ? profiles.map(mapProfile) : [],
      records: Array.isArray(allRecords) ? allRecords.map(mapRecord) : [],
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      message: error && error.message ? error.message : 'Failed to load admin data.',
    });
  }
};
