const test = require('node:test');
const assert = require('node:assert/strict');

const rows = [];
let authenticatedId = 'user-1';
const queries = [];
function stubModule(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stubModule('../api/_lib/admin-auth', {
  requireAuthSession: async () => ({ ok: true, id: authenticatedId, isTest: false }),
});
stubModule('../api/_lib/supabase', {
  fetchSupabase: async (path, options = {}) => {
    queries.push({ path, method: options.method || 'GET' });
    const url = new URL(path, 'http://local');
    const userId = url.searchParams.get('user_id')?.slice(3);
    const slot = Number(url.searchParams.get('slot')?.slice(3));
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      if (rows.some(item => item.user_id === row.user_id && item.slot === row.slot)) throw Object.assign(new Error('duplicate'), { status: 409 });
      rows.push(row);
      return [row];
    }
    if (options.method === 'PATCH') {
      const row = JSON.parse(options.body);
      const current = rows.find(item => item.user_id === userId && item.slot === slot && item.routine_id === url.searchParams.get('routine_id')?.slice(3));
      if (!current) return [];
      Object.assign(current, row);
      return [current];
    }
    if (options.method === 'DELETE') {
      const index = rows.findIndex(item => item.user_id === userId && item.slot === slot);
      return index >= 0 ? rows.splice(index, 1) : [];
    }
    return rows.filter(item => item.user_id === userId && (!Number.isFinite(slot) || item.slot === slot))
      .map(item => url.searchParams.get('select') === 'routine_id' ? { routine_id: item.routine_id } : item);
  },
});
const handler = require('../api/record-routines');

async function request(method, body, url = '/api/record-routines') {
  let payload;
  const res = { statusCode: 200, setHeader() {}, end(value) { payload = JSON.parse(value); } };
  await handler({ method, url, body }, res);
  return { status: res.statusCode, body: payload };
}

test('routine API scopes reads and writes to the authenticated user', async () => {
  rows.length = 0;
  queries.length = 0;
  authenticatedId = 'user-1';
  const first = await request('POST', { slot: 1, id: 'routine-1', name: '걷기', walking: 30, customExercises: [] });
  assert.equal(first.status, 200);
  assert.equal(rows[0].user_id, 'user-1');

  authenticatedId = 'user-2';
  const second = await request('GET');
  assert.deepEqual(second.body.routines, []);
  assert.equal(queries.at(-1).path.includes('user_id=eq.user-2'), true);
  assert.equal((await request('DELETE', null, '/api/record-routines?slot=1')).status, 404);
  assert.equal(rows.length, 1);
});

test('routine API rejects slot outside the four allowed places and keeps an occupied slot intact', async () => {
  authenticatedId = 'user-1';
  assert.equal((await request('POST', { slot: 5, id: 'routine-5', name: '다섯 번째', walking: 20, customExercises: [] })).status, 400);
  const conflict = await request('POST', { slot: 1, id: 'different', name: '덮어쓰기', walking: 20, customExercises: [] });
  assert.equal(conflict.status, 409);
  assert.equal(rows[0].name, '걷기');
});
