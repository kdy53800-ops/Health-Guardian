const { fetchSupabase } = require('./_lib/supabase');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    // 1. Calculate current month range (KST)
    const now = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)); // UTC+9
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    
    const nextMonthDate = new Date(Date.UTC(year, month, 1));
    const endOfMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, '0')}-01`;

    // 2. Fetch profiles and records (filtered by current month)
    const [profiles, records] = await Promise.all([
      fetchSupabase('/rest/v1/profiles?select=id,name,username&order=created_at.asc', {
        headers: { Accept: 'application/json' },
      }),
      fetchSupabase(`/rest/v1/daily_records?select=user_id,record_date,walking,running,custom_exercises&record_date=gte.${startOfMonth}&record_date=lt.${endOfMonth}`, {
        headers: { Accept: 'application/json' },
      }),
    ]);

    if (!Array.isArray(profiles) || !Array.isArray(records)) {
      throw new Error('Failed to fetch data from database.');
    }

    // 2. Process data for ranking
    const userMap = {};
    profiles.forEach(p => {
      userMap[p.id] = {
        name: p.name || p.username || '사용자',
        attendanceCount: 0,
        totalExerciseMins: 0,
        id: p.id
      };
    });

    records.forEach(r => {
      const u = userMap[r.user_id];
      if (!u) return;

      // Attendance (unique date per user) - records are already daily unique usually
      u.attendanceCount += 1;

      // Exercise Time
      let mins = (Number(r.walking) || 0) + (Number(r.running) || 0);
      if (Array.isArray(r.custom_exercises)) {
        r.custom_exercises.forEach(ex => {
          mins += (Number(ex.duration) || 0);
        });
      }
      u.totalExerciseMins += mins;
    });

    const userList = Object.values(userMap);

    // Top 5 by Attendance
    const topAttendance = [...userList]
      .sort((a, b) => b.attendanceCount - a.attendanceCount || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map(u => ({ name: u.name, value: u.attendanceCount, id: u.id }));

    // Top 5 by Exercise Time
    const topExercise = [...userList]
      .sort((a, b) => b.totalExerciseMins - a.totalExerciseMins || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map(u => ({ name: u.name, value: u.totalExerciseMins, id: u.id }));

    sendJson(res, 200, {
      ok: true,
      topAttendance,
      topExercise
    });
  } catch (error) {
    console.error('[RankingAPI]', error);
    sendJson(res, 500, {
      ok: false,
      message: error.message || 'Internal Server Error'
    });
  }
};
