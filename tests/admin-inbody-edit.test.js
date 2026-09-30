const test = require('node:test');
const assert = require('node:assert/strict');

const calls = [];
const audits = [];
let existingRecord = { id:'inbody_1', record_date:'2026-09-01', image_url:'inbody_images/user-1/old.jpg' };
let conflictingRecord = null;

function stubModule(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename:id, loaded:true, exports };
}

stubModule('../api/_lib/supabase', {
  fetchSupabase: async (path, options = {}) => {
    calls.push({ path, options });
    if (path.startsWith('/rest/v1/profiles?')) return [{ id:'user-1' }];
    if (path.startsWith('/rest/v1/inbody_records?select=id,record_date,image_url&id=eq.')) {
      return existingRecord ? [existingRecord] : [];
    }
    if (path.startsWith('/rest/v1/inbody_records?select=id&user_id=eq.')) {
      return conflictingRecord ? [conflictingRecord] : [{ id:'inbody_1' }];
    }
    if (path.startsWith('/storage/v1/object/')) return {};
    if (path.startsWith('/rest/v1/inbody_records?id=eq.') && options.method === 'PATCH') {
      return [{ id:'inbody_1' }];
    }
    throw new Error(`Unexpected query: ${path}`);
  },
});
stubModule('../api/_lib/admin-auth', {
  requireAdminSession: async () => ({ ok:true, session:{ provider:'naver', uid:'admin-1' } }),
});
stubModule('../api/_lib/audit', { writeAdminAudit: async (_auth, action) => audits.push(action) });
stubModule('../api/_lib/inbody-storage', {
  BUCKET:'inbody_images', extractObjectPath:value => value, privateImageUrl:() => null,
});

const handler = require('../api/admin-inbody');
const input = {
  userId:'user-1', recordId:'inbody_1', date:'2026-09-02',
  weight:70, skeletalMuscle:25, bodyFatMass:20, bmi:23.8,
  bodyFatPercent:28, ecwRatio:0.382, inbodyScore:75, phaseAngle:5.1,
};

async function request(body) {
  let payload;
  const res = {
    statusCode:200,
    setHeader() {},
    end(value) { payload = JSON.parse(value); },
  };
  await handler({ method:'POST', url:'/api/admin-inbody', body }, res);
  return { status:res.statusCode, payload };
}

test('editing an inbody record updates its ID and preserves the current image', async () => {
  calls.length = 0;
  audits.length = 0;
  existingRecord = { id:'inbody_1', record_date:'2026-09-01', image_url:'inbody_images/user-1/old.jpg' };
  conflictingRecord = null;

  const result = await request(input);
  assert.equal(result.status, 200);
  const patch = calls.find(call => call.options.method === 'PATCH');
  assert.match(patch.path, /id=eq.inbody_1&user_id=eq.user-1/);
  assert.equal(JSON.parse(patch.options.body).record_date, '2026-09-02');
  assert.equal(JSON.parse(patch.options.body).image_url, undefined);
  assert.equal(calls.some(call => call.options.method === 'DELETE'), false);
  assert.deepEqual(audits, ['update_inbody_record']);
});

test('a new image replaces the previous image after the record update succeeds', async () => {
  calls.length = 0;
  conflictingRecord = null;
  const result = await request({
    ...input,
    imageBase64:`data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`,
    fileName:'scan.jpg',
  });
  assert.equal(result.status, 200);
  const upload = calls.find(call => call.options.method === 'POST' && call.path.startsWith('/storage/'));
  const patch = calls.find(call => call.options.method === 'PATCH');
  const removal = calls.find(call => call.options.method === 'DELETE');
  assert.ok(upload);
  assert.match(JSON.parse(patch.options.body).image_url, /^inbody_images\/user-1\//);
  assert.equal(removal.path, '/storage/v1/object/inbody_images/user-1/old.jpg');
});

test('editing cannot overwrite a different record on the same measurement date', async () => {
  calls.length = 0;
  conflictingRecord = { id:'inbody_2' };
  const result = await request(input);
  assert.equal(result.status, 409);
  assert.equal(calls.some(call => call.options.method === 'PATCH'), false);
  conflictingRecord = null;
});

test('editing a record outside the selected user is rejected', async () => {
  calls.length = 0;
  existingRecord = null;
  const result = await request(input);
  assert.equal(result.status, 404);
  assert.equal(calls.some(call => call.options.method === 'PATCH'), false);
});

test('creating on an existing measurement date requires an explicit edit', async () => {
  calls.length = 0;
  existingRecord = { id:'inbody_1', record_date:'2026-09-01', image_url:null };
  conflictingRecord = null;
  const result = await request({ ...input, recordId:null });
  assert.equal(result.status, 409);
  assert.equal(calls.some(call => call.options.method === 'POST'), false);
});
