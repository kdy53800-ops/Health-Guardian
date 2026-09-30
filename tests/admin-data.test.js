const test = require('node:test');
const assert = require('node:assert/strict');

const calls = [];
const audits = [];
const profile = { id:'user-1', name:'관리자', is_admin:true, is_special:false, created_at:'2026-09-01T00:00:00Z' };
const record = { id:'record-1', user_id:'user-1', record_date:'2026-09-29', heart_rate:72, walking:20, custom_exercises:[] };

function stubModule(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename:id, loaded:true, exports };
}

stubModule('../api/_lib/supabase', {
  fetchSupabase: async path => {
    calls.push(path);
    if (path.startsWith('/rest/v1/profiles?')) return [profile];
    if (path.startsWith('/rest/v1/inbody_records?')) return [];
    if (path.startsWith('/rest/v1/daily_records?')) return [record];
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

test('full admin data includes heart rate and requests only needed columns', async () => {
  calls.length = 0;
  const result = await request('/api/admin-data');
  assert.equal(result.status, 200);
  assert.equal(result.body.records[0].heartRate, 72);
  assert.equal(calls.length, 3);
  const recordQuery = calls.find(path => path.startsWith('/rest/v1/daily_records?'));
  assert.match(recordQuery, /heart_rate/);
  assert.match(recordQuery, /order=record_date.desc,id.desc/);
  assert.doesNotMatch(recordQuery, /select=\*/);
});
