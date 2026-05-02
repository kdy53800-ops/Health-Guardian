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

    const [profiles, records] = await Promise.all([
      fetchSupabase('/rest/v1/profiles?select=*&order=created_at.asc', {
        headers: { Accept: 'application/json' },
      }),
      fetchSupabase('/rest/v1/daily_records?select=*&order=record_date.asc', {
        headers: { Accept: 'application/json' },
      }),
    ]);

    sendJson(res, 200, {
      ok: true,
      users: Array.isArray(profiles) ? profiles.map(mapProfile) : [],
      records: Array.isArray(records) ? records.map(mapRecord) : [],
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      message: error && error.message ? error.message : 'Failed to load admin data.',
    });
  }
};
