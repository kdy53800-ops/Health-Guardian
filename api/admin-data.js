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

async function fetchRecordPages(select, filter = '') {
  const fetchPage = page => fetchSupabase(`/rest/v1/daily_records?select=${select}${filter}&order=record_date.desc,id.desc&limit=1000&offset=${page * 1000}`, {
    headers: { Accept: 'application/json' },
  });
  const rows = [];
  const first = await fetchPage(0);
  if (!Array.isArray(first) || !first.length) return rows;
  rows.push(...first);
  if (first.length < 1000) return rows;
  for (let page = 1; page < 30; page += 2) {
    const pages = await Promise.all([page, page + 1].filter(index => index < 30).map(fetchPage));
    for (const batch of pages) {
      if (!Array.isArray(batch) || !batch.length) return rows;
      rows.push(...batch);
      if (batch.length < 1000) return rows;
    }
  }
  return rows;
}

function summarizeUsers(users, records) {
  const datesByUser = new Map();
  for (const record of records) {
    if (!datesByUser.has(record.user_id)) datesByUser.set(record.user_id, []);
    datesByUser.get(record.user_id).push(record.record_date);
  }
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const previousDay = date => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return users.map(user => {
    const dates = datesByUser.get(user.id) || [];
    const dateSet = new Set(dates.filter(date => date <= today));
    let cursor = dateSet.has(today) ? today : previousDay(today);
    let streak = 0;
    while (dateSet.has(cursor)) { streak += 1; cursor = previousDay(cursor); }
    return { ...user, recordCount:dates.length, lastDate:dates[0] || '', streak,
      recordMonths:[...new Set(dates.map(date => date.slice(0, 7)))] };
  });
}

function mapDashboardRecord(row) {
  const exercises = Array.isArray(row.custom_exercises) ? row.custom_exercises : [];
  return { userId:row.user_id, date:row.record_date, weight:Number(row.weight) || 0,
    walking:Number(row.walking) || 0, running:Number(row.running) || 0,
    customMinutes:exercises.reduce((sum, item) => sum + (Number(item.duration) || 0), 0),
    water:Number(row.water) || 0, fasting:Number(row.fasting) || 0,
    condition:Number(row.condition) || 3 };
}

function seoulDateDaysAgo(days) {
  return new Date(Date.now() + 9 * 3600000 - days * 86400000).toISOString().slice(0, 10);
}

function monthBounds(month) {
  const [year, number] = month.split('-').map(Number);
  return { start:`${month}-01`, end:new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10) };
}

function mapRollup(row) {
  return { userId:row.user_id, recordCount:Number(row.record_count) || 0,
    totalMinutes:Number(row.total_minutes) || 0,
    walkingSum:Number(row.walking_sum) || 0, walkingEntries:Number(row.walking_entries) || 0,
    runningSum:Number(row.running_sum) || 0, runningEntries:Number(row.running_entries) || 0,
    customSum:Number(row.custom_sum) || 0, customEntries:Number(row.custom_entries) || 0,
    activeThisMonth:!!row.active_this_month, lastDate:row.last_date || '' };
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
    const view = requestUrl.searchParams.get('view') || '';
    if (view === 'audit') {
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
      if (view === 'user-detail') {
        const userId = requestUrl.searchParams.get('userId');
        if (!data.users.some(user => user.id === userId)) {
          sendJson(res, 404, { ok:false, message:'사용자를 찾을 수 없습니다.' });
          return;
        }
        sendJson(res, 200, { ok:true, records:data.records.filter(record => record.userId === userId), demo:true });
        return;
      }
      if (view === 'users-summary') {
        const records = data.records.map(record => ({ user_id:record.userId, record_date:record.date }));
        sendJson(res, 200, { ok:true, users:summarizeUsers(data.users, records), demo:true });
        return;
      }
      if (view === 'dashboard-summary') {
        sendJson(res, 200, { ok:true, users:data.users,
          records:data.records.map(record => ({ ...record, customMinutes:record.customExercises.reduce((sum, item) => sum + (Number(item.duration) || 0), 0), customExercises:undefined })),
          inbodyLatest:data.inbodyLatest, demo:true });
        return;
      }
      sendJson(res, 200, view === 'users' ? { ok:true, users:data.users, demo:true } : { ok:true, ...data, demo:true });
      return;
    }

    if (view === 'user-detail') {
      const userId = requestUrl.searchParams.get('userId') || '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        sendJson(res, 400, { ok:false, message:'올바르지 않은 사용자 ID입니다.' });
        return;
      }
      const records = await fetchRecordPages('id,user_id,record_date,weight,walking,running,water,fasting,heart_rate,condition,custom_exercises,saved_at', `&user_id=eq.${encodeURIComponent(userId)}`);
      await writeAdminAudit(auth, 'view_admin_user_detail', { targetType:'user', targetId:userId, details:{ recordCount:records.length } });
      sendJson(res, 200, { ok:true, records:records.map(mapRecord) });
      return;
    }

    const profilesPromise = fetchSupabase('/rest/v1/profiles?select=id,name,username,email,phone,is_admin,is_special,created_at,auth_provider,gender,birthyear&order=created_at.asc', {
      headers: { Accept: 'application/json' },
    });
    if (view === 'users') {
      const profiles = await profilesPromise;
      await writeAdminAudit(auth, 'view_admin_dashboard', {
        targetType: 'users',
        details: { userCount: Array.isArray(profiles) ? profiles.length : 0 },
      });
      sendJson(res, 200, { ok:true, users:Array.isArray(profiles) ? profiles.map(mapProfile) : [] });
      return;
    }

    if (view === 'users-summary') {
      const recordsPromise = fetchRecordPages('id,user_id,record_date');
      const [profiles, records] = await Promise.all([profilesPromise, recordsPromise]);
      const users = summarizeUsers(Array.isArray(profiles) ? profiles.map(mapProfile) : [], records);
      await writeAdminAudit(auth, 'view_admin_dashboard', { targetType:'users', details:{ userCount:users.length, recordCount:records.length } });
      sendJson(res, 200, { ok:true, users });
      return;
    }

    if (view === 'dashboard-summary') {
      const month = requestUrl.searchParams.get('month') || '';
      if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        sendJson(res, 400, { ok:false, message:'올바르지 않은 월입니다.' });
        return;
      }
      const { start, end } = month ? monthBounds(month) : { start:seoulDateDaysAgo(29), end:seoulDateDaysAgo(-1) };
      const rollupPromise = fetchSupabase('/rest/v1/rpc/admin_record_rollup', {
        method:'POST', headers:{ Accept:'application/json', 'Content-Type':'application/json' },
        body:JSON.stringify({ p_month:month || null }),
      });
      const inbodyDatesPromise = fetchSupabase('/rest/v1/inbody_records?select=user_id,record_date&order=record_date.desc&limit=1000', {
        headers:{ Accept:'application/json' },
      });
      const recordsPromise = fetchRecordPages('id,user_id,record_date,weight,walking,running,water,fasting,condition,custom_exercises', `&record_date=gte.${start}&record_date=lt.${end}`);
      try {
        const [profiles, rollup, inbodyDates, records] = await Promise.all([profilesPromise, rollupPromise, inbodyDatesPromise, recordsPromise]);
        const inbodyLatest = {};
        for (const row of Array.isArray(inbodyDates) ? inbodyDates : []) {
          if (row.user_id && !inbodyLatest[row.user_id]) inbodyLatest[row.user_id] = row.record_date;
        }
        await writeAdminAudit(auth, 'view_admin_dashboard', {
          targetType:'health_records', details:{ userCount:profiles.length, recordCount:records.length, summary:true },
        });
        sendJson(res, 200, { ok:true, users:profiles.map(mapProfile), rollups:rollup.map(mapRollup),
          records:records.map(mapDashboardRecord), inbodyLatest });
        return;
      } catch (error) {
        // Older deployments can continue to render while the SQL migration is being applied.
        if (error.status !== 404 && error.status !== 42883 && error.status !== 400) throw error;
      }
    }

    // 독립적인 조회는 함께 시작해 첫 화면의 대기 시간을 줄입니다.
    const inbodyDatesPromise = fetchSupabase('/rest/v1/inbody_records?select=user_id,record_date&order=record_date.desc&limit=1000', {
      headers: { Accept: 'application/json' },
    });

    // 2. 일별 기록은 1000건 제한을 피하기 위해 페이지네이션 수행 (최대 30,000건까지)
    const isDashboardSummary = view === 'dashboard-summary';
    const recordSelect = isDashboardSummary
      ? 'id,user_id,record_date,weight,walking,running,water,fasting,condition,custom_exercises'
      : 'id,user_id,record_date,weight,walking,running,walking_km,running_km,water,fasting,heart_rate,condition,custom_exercises,saved_at';
    const recordsPromise = fetchRecordPages(recordSelect);
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
      records: Array.isArray(allRecords) ? allRecords.map(isDashboardSummary ? mapDashboardRecord : mapRecord) : [],
      inbodyLatest,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      message: error && error.message ? error.message : 'Failed to load admin data.',
    });
  }
};
