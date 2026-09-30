const test = require('node:test');
const assert = require('node:assert/strict');

const calls = [];
const audits = [];
let recordPages = null;
const profile = { id:'user-1', name:'관리자', is_admin:true, is_special:false, created_at:'2026-09-01T00:00:00Z' };
const record = { id:'record-1', user_id:'user-1', record_date:'2026-09-29', heart_rate:72, walking:20, walking_km:2.4, running_km:1.5, custom_exercises:[] };

function stubModule(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename:id, loaded:true, exports };
}

stubModule('../api/_lib/supabase', {
  fetchSupabase: async path => {
    calls.push(path);
    if (path.startsWith('/rest/v1/profiles?')) return [profile];
    if (path.startsWith('/rest/v1/inbody_records?')) return [];
    if (path === '/rest/v1/rpc/admin_record_rollup') return [{
      user_id:'user-1', record_count:1, total_minutes:20, walking_sum:20, walking_entries:1,
      running_sum:0, running_entries:0, custom_sum:0, custom_entries:0,
      active_this_month:true, last_date:'2026-09-29',
    }];
    if (path.startsWith('/rest/v1/daily_records?')) {
      if (recordPages) return recordPages[Number(new URL(path, 'http://local').searchParams.get('offset'))] || [];
      return [record];
    }
    throw new Error(`Unexpected query: ${path}`);
  },
});
stubModule('../api/_lib/admin-auth', {
  requireAdminSession: async () => ({ ok:true, session:{ provider:'naver', uid:'user-1' }, profile }),
});
stubModule('../api/_lib/audit', {
  writeAdminAudit: async (_auth, action, options) => audits.push({ action, options }),
});
const handler = require('../api/admin-data');

async function request(url) {
  let body;
  const res = {
    statusCode:200,
    setHeader() {},
    end(value) { body = JSON.parse(value); },
  };
  await handler({ method:'GET', url }, res);
  return { status:res.statusCode, body };
}

test('inbody user list skips health records and preserves admin audit', async () => {
  calls.length = 0;
  audits.length = 0;
  const result = await request('/api/admin-data?view=users');
  assert.equal(result.status, 200);
  assert.equal(result.body.users.length, 1);
  assert.equal(result.body.records, undefined);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^\/rest\/v1\/profiles\?/);
  assert.equal(audits[0].options.targetType, 'users');
});

test('user management receives only record summaries', async () => {
  calls.length = 0;
  const result = await request('/api/admin-data?view=users-summary');
  assert.equal(result.status, 200);
  assert.equal(result.body.records, undefined);
  assert.equal(result.body.users[0].recordCount, 1);
  assert.equal(result.body.users[0].lastDate, '2026-09-29');
  assert.deepEqual(result.body.users[0].recordMonths, ['2026-09']);
  const recordQuery = calls.find(path => path.startsWith('/rest/v1/daily_records?'));
  assert.match(recordQuery, /select=id,user_id,record_date/);
  assert.doesNotMatch(recordQuery, /custom_exercises|heart_rate/);
  assert.equal(calls.length, 2);
});

test('user detail fetches only the selected user records', async () => {
  calls.length = 0;
  audits.length = 0;
  const userId = '11111111-1111-4111-8111-111111111111';
  const result = await request(`/api/admin-data?view=user-detail&userId=${userId}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.records[0].heartRate, 72);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /user_id=eq.11111111-1111-4111-8111-111111111111/);
  assert.equal(audits[0].action, 'view_admin_user_detail');
  assert.equal(audits[0].options.targetId, userId);
});

test('invalid user detail id is rejected before querying', async () => {
  calls.length = 0;
  const result = await request('/api/admin-data?view=user-detail&userId=bad-id');
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});

test('dashboard summary omits detailed exercise arrays', async () => {
  calls.length = 0;
  const result = await request('/api/admin-data?view=dashboard-summary');
  assert.equal(result.status, 200);
  assert.equal(result.body.records[0].customExercises, undefined);
  assert.equal(result.body.records[0].walking, 20);
  assert.equal(result.body.rollups[0].recordCount, 1);
  assert.equal(result.body.rollups[0].totalMinutes, 20);
  const recordQuery = calls.find(path => path.startsWith('/rest/v1/daily_records?'));
  assert.doesNotMatch(recordQuery, /heart_rate|saved_at/);
  assert.match(recordQuery, /record_date=gte\./);
  assert.equal(calls.length, 4);
});

test('full admin data includes heart rate and requests only needed columns', async () => {
  calls.length = 0;
  const result = await request('/api/admin-data');
  assert.equal(result.status, 200);
  assert.equal(result.body.records[0].heartRate, 72);
  assert.equal(result.body.records[0].walkingKm, 2.4);
  assert.equal(result.body.records[0].runningKm, 1.5);
  assert.equal(calls.length, 3);
  const recordQuery = calls.find(path => path.startsWith('/rest/v1/daily_records?'));
  assert.match(recordQuery, /heart_rate/);
  assert.match(recordQuery, /walking_km,running_km/);
  assert.match(recordQuery, /order=record_date.desc,id.desc/);
  assert.doesNotMatch(recordQuery, /select=\*/);
});

test('large record lists keep page order across paired requests', async () => {
  calls.length = 0;
  recordPages = {
    0:Array.from({ length:1000 }, (_, index) => ({ ...record, id:`first-${index}` })),
    1000:Array.from({ length:1000 }, (_, index) => ({ ...record, id:`second-${index}` })),
    2000:[{ ...record, id:'last' }],
  };
  try {
    const result = await request('/api/admin-data');
    assert.equal(result.status, 200);
    assert.equal(result.body.records.length, 2001);
    assert.equal(result.body.records[0].id, 'first-0');
    assert.equal(result.body.records[1000].id, 'second-0');
    assert.equal(result.body.records[2000].id, 'last');
    assert.equal(calls.filter(path => path.startsWith('/rest/v1/daily_records?')).length, 3);
  } finally {
    recordPages = null;
  }
});
