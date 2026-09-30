const test = require('node:test');
const assert = require('node:assert/strict');

const queries = [];
function stubModule(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename:id, loaded:true, exports };
}

stubModule('../api/_lib/supabase', {
  fetchSupabase: async path => {
    queries.push(path);
    if (path.startsWith('/rest/v1/profiles?')) return [{ id:'user-1', name:'대상자', is_special:true }];
    if (path.startsWith('/rest/v1/inbody_records?')) return [{
      id:'record-1', user_id:'user-1', record_date:'2026-09-01', weight:70,
      skeletal_muscle:25, body_fat_mass:20, bmi:23.8, body_fat_percent:28,
      ecw_ratio:0.382, inbody_score:75, phase_angle:null,
    }];
    throw new Error(`Unexpected query: ${path}`);
  },
});
stubModule('../api/_lib/admin-auth', {
  requireAdminSession: async () => ({ ok:true, session:{ provider:'naver', uid:'admin-1' } }),
});
stubModule('../api/_lib/audit', { writeAdminAudit: async () => {} });
stubModule('../api/_lib/inbody-storage', { BUCKET:'inbody', extractObjectPath:() => null, privateImageUrl:() => null });

const handler = require('../api/admin-inbody');

test('inbody improvement overview includes every measured metric without inventing missing values', async () => {
  let body;
  const response = {
    statusCode:200,
    setHeader() {},
    end(value) { body = JSON.parse(value); },
  };
  await handler({ method:'GET', url:'/api/admin-inbody' }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.records.length, 1);
  assert.equal(body.records[0].bodyFatMass, 20);
  assert.equal(body.records[0].bmi, 23.8);
  assert.equal(body.records[0].ecwRatio, 0.382);
  assert.equal(body.records[0].phaseAngle, null);
  const recordQuery = queries.find(path => path.startsWith('/rest/v1/inbody_records?'));
  for (const field of ['body_fat_mass', 'bmi', 'ecw_ratio', 'phase_angle', 'inbody_score']) {
    assert.match(recordQuery, new RegExp(field));
  }
});
