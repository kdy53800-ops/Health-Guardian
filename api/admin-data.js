const { fetchSupabase } = require('./_lib/supabase');
const { requireAdminSession } = require('./_lib/admin-auth');
const { writeAdminAudit } = require('./_lib/audit');
const { buildTestAdminData, buildTestAuditLogs } = require('./_lib/test-fixtures');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
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
    heartRate: Number(row.heart_rate) || 0,
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

    const requestUrl = new URL(req.url, 'http://localhost');
    if (requestUrl.searchParams.get('view') === 'audit') {
      if (auth.session.provider === 'test') {
        sendJson(res, 200, { ok: true, logs: buildTestAuditLogs(), demo: true });
        return;
      }
      const logs = await fetchSupabase('/rest/v1/admin_audit_logs?select=id,actor_name,action,target_type,target_id,details,created_at&order=created_at.desc&limit=50', {
        headers: { Accept: 'application/json' },
      });
      sendJson(res, 200, { ok: true, logs: Array.isArray(logs) ? logs : [] });
      return;
    }

    if (auth.session.provider === 'test') {
      const data = buildTestAdminData();
      sendJson(res, 200, requestUrl.searchParams.get('view') === 'users'
        ? { ok:true, users:data.users, demo:true }
        : { ok:true, ...data, demo:true });
      return;
    }

    const profilesPromise = fetchSupabase('/rest/v1/profiles?select=id,name,username,email,phone,is_admin,is_special,created_at,auth_provider,gender,birthyear&order=created_at.asc', {
      headers: { Accept: 'application/json' },
    });
    if (requestUrl.searchParams.get('view') === 'users') {
      const profiles = await profilesPromise;
      await writeAdminAudit(auth, 'view_admin_dashboard', {
        targetType: 'users',
        details: { userCount: Array.isArray(profiles) ? profiles.length : 0 },
      });
      sendJson(res, 200, { ok:true, users:Array.isArray(profiles) ? profiles.map(mapProfile) : [] });
      return;
    }

    // 독립적인 조회는 함께 시작해 첫 화면의 대기 시간을 줄입니다.
    const inbodyDatesPromise = fetchSupabase('/rest/v1/inbody_records?select=user_id,record_date&order=record_date.desc&limit=1000', {
      headers: { Accept: 'application/json' },
    });

    // 2. 일별 기록은 1000건 제한을 피하기 위해 페이지네이션 수행 (최대 30,000건까지)
    const recordsPromise = (async () => {
      const allRecords = [];
      for (let i = 0; i < 30; i++) {
        const from = i * 1000;
        const records = await fetchSupabase(`/rest/v1/daily_records?select=id,user_id,record_date,weight,walking,running,water,fasting,heart_rate,condition,custom_exercises,saved_at&order=record_date.desc,id.desc&limit=1000&offset=${from}`, {
          headers: { Accept: 'application/json' },
        });
        if (!Array.isArray(records) || records.length === 0) break;
        allRecords.push(...records);
        if (records.length < 1000) break;
      }
      return allRecords;
    })();
    const [profiles, inbodyDates, allRecords] = await Promise.all([profilesPromise, inbodyDatesPromise, recordsPromise]);

    const inbodyLatest = {};
    if (Array.isArray(inbodyDates)) {
      inbodyDates.forEach(record => {
        if (record.user_id && !inbodyLatest[record.user_id]) inbodyLatest[record.user_id] = record.record_date;
      });
    }

    await writeAdminAudit(auth, 'view_admin_dashboard', {
      targetType: 'health_records',
      details: { userCount: Array.isArray(profiles) ? profiles.length : 0, recordCount: allRecords.length },
    });

    sendJson(res, 200, {
      ok: true,
      users: Array.isArray(profiles) ? profiles.map(mapProfile) : [],
      records: Array.isArray(allRecords) ? allRecords.map(mapRecord) : [],
      inbodyLatest,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      message: error && error.message ? error.message : 'Failed to load admin data.',
    });
  }
};
