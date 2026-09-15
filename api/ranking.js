const { fetchSupabase } = require('./_lib/supabase');
const { requireAuthSession } = require('./_lib/admin-auth');
const { buildTestAdminData } = require('./_lib/test-fixtures');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const auth = await requireAuthSession(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, { ok: false, message: auth.message });
      return;
    }

    if (auth.isTest) {
      const fixture = buildTestAdminData();
      const stats = fixture.users.map(user => {
        const records = fixture.records.filter(record => record.userId === user.id);
        return {
          id:user.id,
          name:user.name,
          attendanceCount:records.length,
          totalExerciseMins:records.reduce((sum, record) => sum + record.walking + record.running + record.customExercises.reduce((subtotal, exercise) => subtotal + exercise.duration, 0), 0),
        };
      });
      const attendance = [...stats].sort((a,b) => b.attendanceCount - a.attendanceCount || a.name.localeCompare(b.name));
      const exercise = [...stats].sort((a,b) => b.totalExerciseMins - a.totalExerciseMins || a.name.localeCompare(b.name));
      const currentAttendance = attendance.findIndex(user => user.id === auth.id);
      const currentExercise = exercise.findIndex(user => user.id === auth.id);
      sendJson(res, 200, {
        ok:true,
        topAttendance:attendance.slice(0,5).map(user => ({ name:user.name, value:user.attendanceCount })),
        topExercise:exercise.slice(0,5).map(user => ({ name:user.name, value:user.totalExerciseMins })),
        myAttendance:{ rank:currentAttendance + 1, value:attendance[currentAttendance].attendanceCount },
        myExercise:{ rank:currentExercise + 1, value:exercise[currentExercise].totalExerciseMins },
        demo:true,
      });
      return;
    }

    // 1. Calculate current month range (KST) or previous month if today is the 1st
    const now = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)); // UTC+9
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    let targetYear = year;
    let targetMonth = month;
    if (day === 1) {
      if (month === 1) {
        targetYear = year - 1;
        targetMonth = 12;
      } else {
        targetMonth = month - 1;
      }
    }

    const startOfMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 2. Fetch profiles and records (filtered by current month up to yesterday)
    const [profiles, records] = await Promise.all([
      fetchSupabase('/rest/v1/profiles?select=id,name,username&order=created_at.asc', {
        headers: { Accept: 'application/json' },
      }),
      fetchSupabase(`/rest/v1/daily_records?select=user_id,record_date,walking,running,custom_exercises&record_date=gte.${startOfMonth}&record_date=lt.${todayStr}`, {
        headers: { Accept: 'application/json' },
      }),
    ]);

    if (!Array.isArray(profiles) || !Array.isArray(records)) {
      throw new Error('Failed to fetch data from database.');
    }

    // 3. Process data for ranking
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

      // Attendance (unique date per user)
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

    // Sort for Attendance
    const sortedAttendance = [...userList]
      .sort((a, b) => b.attendanceCount - a.attendanceCount || a.name.localeCompare(b.name));

    // Sort for Exercise
    const sortedExercise = [...userList]
      .sort((a, b) => b.totalExerciseMins - a.totalExerciseMins || a.name.localeCompare(b.name));

    // Top 5 lists
    const topAttendance = sortedAttendance
      .slice(0, 5)
      .map(u => ({ name: u.name, value: u.attendanceCount }));

    const topExercise = sortedExercise
      .slice(0, 5)
      .map(u => ({ name: u.name, value: u.totalExerciseMins }));

    // Get logged-in user ranking
    const userId = auth.id;
    let myAttendance = null;
    let myExercise = null;

    if (userId) {
      const attIdx = sortedAttendance.findIndex(u => u.id === userId);
      if (attIdx >= 0) {
        myAttendance = {
          rank: attIdx + 1,
          value: sortedAttendance[attIdx].attendanceCount
        };
      } else {
        myAttendance = { rank: '-', value: 0 };
      }

      const exeIdx = sortedExercise.findIndex(u => u.id === userId);
      if (exeIdx >= 0) {
        myExercise = {
          rank: exeIdx + 1,
          value: sortedExercise[exeIdx].totalExerciseMins
        };
      } else {
        myExercise = { rank: '-', value: 0 };
      }
    }

    sendJson(res, 200, {
      ok: true,
      topAttendance,
      topExercise,
      myAttendance,
      myExercise
    });
  } catch (error) {
    console.error('[RankingAPI]', error);
    sendJson(res, 500, {
      ok: false,
      message: error.message || 'Internal Server Error'
    });
  }
};
