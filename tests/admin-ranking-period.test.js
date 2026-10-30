const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function page() {
  const fields = Object.fromEntries(['rankingStartDate', 'rankingEndDate', 'rankingPeriodLabel', 'rankHead', 'rankBody'].map(id => [id, { value: '', textContent: '', innerHTML: '' }]));
  const messages = [];
  const context = vm.createContext({ document: { addEventListener() {}, getElementById: id => fields[id] || null }, location: { pathname: '/admin-ranking.html' }, console, showToast: message => messages.push(message), escapeHtml: String, formatPhone: String });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/admin.js'), 'utf8'), context);
  vm.runInContext(`renderAll = () => renderRanking(); fetchedUsers = [{id:'a',name:'A'}, {id:'b',name:'B'}]; fetchedRecords = [
    {id:'old',userId:'b',date:'2026-09-29',walking:999},
    {id:'start',userId:'a',date:'2026-09-30',walking:10},
    {id:'end',userId:'a',date:'2026-10-01',walking:20},
    {id:'later',userId:'b',date:'2026-10-02',walking:888}
  ];`, context);
  return { context, fields, messages };
}

test('ranking period includes both endpoints across months and computes only matching records', async () => {
  const { context, fields } = page();
  fields.rankingStartDate.value = '2026-09-30';
  fields.rankingEndDate.value = '2026-10-01';
  await vm.runInContext('updateFilters()', context);
  assert.equal(vm.runInContext('allRecords.length', context), 2);
  assert.equal(vm.runInContext('allUsers.length', context), 1);
  assert.match(fields.rankBody.innerHTML, /2일 🔥/);
  vm.runInContext("setRankMode('walking')", context);
  assert.match(fields.rankBody.innerHTML, />30<\/strong>/);
  assert.doesNotMatch(fields.rankBody.innerHTML, /999|888/);
});

test('reversed dates keep the applied period; open-ended dates and reset work', async () => {
  const { context, fields, messages } = page();
  fields.rankingStartDate.value = '2026-10-01';
  await vm.runInContext('updateFilters()', context);
  assert.equal(vm.runInContext('allRecords.length', context), 2);
  fields.rankingEndDate.value = '2026-09-01';
  await vm.runInContext('updateFilters()', context);
  assert.equal(fields.rankingEndDate.value, '');
  assert.equal(vm.runInContext('allRecords.length', context), 2);
  assert.equal(messages.length, 1);
  vm.runInContext('resetRankingPeriod()', context);
  assert.equal(fields.rankingStartDate.value, '');
  assert.equal(vm.runInContext('allRecords.length', context), 4);
});
