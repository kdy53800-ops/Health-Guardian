const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createPage() {
  const storage = new Map();
  const fields = new Map();
  for (const id of ['fDate', 'fWeight', 'fHeartRate', 'fWalking', 'fWalkingKm', 'fRunning', 'fRunningKm', 'fWater', 'fFasting', 'fCondition', 'fMemo']) {
    fields.set(id, { value: '', checkValidity: () => true, reportValidity() {}, dispatchEvent() {} });
  }
  fields.set('routineName', { value: '', focus() {} });
  fields.set('routineCount', { textContent: '' });
  fields.set('openRoutineBtn', { disabled: true });
  fields.set('routineList', { innerHTML: '' });
  fields.set('routineQuickSection', { hidden: true });
  fields.set('routineQuickList', { innerHTML: '' });
  fields.set('saveRoutineBtn', { disabled: false });
  fields.set('routineSaveHint', { textContent: '' });
  fields.set('routineDialog', { open: false, close() { this.open = false; }, showModal() { this.open = true; } });
  fields.set('recordImportDialog', { open: false, close() { this.open = false; }, showModal() { this.open = true; } });
  fields.set('recordImportTitle', { textContent: '' });
  fields.set('recordImportContent', { innerHTML: '' });
  fields.set('duplicateModal', { style: { display: 'none' } });
  fields.set('duplicateModalDate', { textContent: '' });
  fields.set('replaceRecordNotice', { hidden: true });
  fields.set('saveBtn', { textContent: '💾 기록 저장하기', disabled: false });
  for (let index = 1; index <= 5; index++) {
    fields.set(`cond${index}`, { classList: { toggle() {} }, setAttribute() {} });
  }
  fields.set('recordForm', { dataset: {} });
  const messages = [];
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById: id => fields.get(id) || null },
    window: { confirm: () => true },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    Event: class Event { constructor(type) { this.type = type; } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'record.js'), 'utf8'), context);
  vm.runInContext(`
    currentUser = { id: 'user-1', authProvider: 'test' };
    userGoals = { walking: 30, running: 20, water: 2000, customEx: 30 };
    showToast = (message) => testMessages.push(message);
    renderCustomExList = () => {};
    updateProgress = () => {};
    updateSummary = () => {};
    scheduleDraftSave = () => {};
  `, Object.assign(context, { testMessages: messages }));
  return { context, fields, storage, messages };
}

test('routines save at most five exercise templates for the current account', async () => {
  const { context, fields, storage } = createPage();
  fields.get('fWalking').value = '35';
  for (let index = 1; index <= 6; index++) {
    fields.get('routineName').value = `루틴 ${index}`;
    await vm.runInContext('saveCurrentRoutine()', context);
  }
  assert.equal(vm.runInContext('recordRoutines.length', context), 5);
  assert.equal(fields.get('routineCount').textContent, '5/5');
  assert.equal(fields.get('saveRoutineBtn').disabled, true);
  assert.equal(storage.has('HealthGuardian_recordRoutines_v1_user-1'), true);
  assert.equal(fields.get('routineQuickSection').hidden, false);
  assert.equal((fields.get('routineQuickList').innerHTML.match(/class="routine-quick-card"/g) || []).length, 5);
  vm.runInContext("currentUser = { id: 'user-2' }; recordRoutines = loadRecordRoutines()", context);
  assert.equal(vm.runInContext('recordRoutines.length', context), 0);
});

test('applying a routine replaces only exercise fields and creates fresh exercise IDs', async () => {
  const { context, fields } = createPage();
  Object.assign(fields.get('fDate'), { value: '2026-10-07' });
  fields.get('fWeight').value = '67.1';
  fields.get('fHeartRate').value = '72';
  fields.get('fWater').value = '800';
  fields.get('fWalking').value = '40';
  fields.get('fWalkingKm').value = '3.5';
  vm.runInContext(`customExercises = [{ id: 'old', category: '근력', name: '덤벨 운동', duration: 25, intensity: '중', sets: 3, reps: 10 }]`, context);
  fields.get('routineName').value = '아침 루틴';
  await vm.runInContext('saveCurrentRoutine()', context);

  fields.get('fWalking').value = '10';
  fields.get('fWeight').value = '66.5';
  fields.get('fWater').value = '1500';
  vm.runInContext('customExercises = []', context);
  vm.runInContext('applyRecordRoutine(0)', context);

  assert.equal(fields.get('fWalking').value, '10');
  assert.equal(fields.get('recordImportDialog').open, true);
  assert.match(fields.get('recordImportContent').innerHTML, /덤벨 운동/);
  assert.match(fields.get('recordImportContent').innerHTML, /현재 입력한 해당 항목/);
  vm.runInContext('confirmRecordImport(false)', context);

  assert.equal(fields.get('fWalking').value, 40);
  assert.equal(fields.get('fWalkingKm').value, 3.5);
  assert.equal(fields.get('fDate').value, '2026-10-07');
  assert.equal(fields.get('fWeight').value, '66.5');
  assert.equal(fields.get('fHeartRate').value, '72');
  assert.equal(fields.get('fWater').value, '1500');
  assert.equal(vm.runInContext('customExercises.length', context), 1);
  assert.notEqual(vm.runInContext('customExercises[0].id', context), 'old');
});

test('canceling a routine preview keeps current exercise input', async () => {
  const { context, fields } = createPage();
  fields.get('fWalking').value = '40';
  fields.get('routineName').value = '걷기 루틴';
  await vm.runInContext('saveCurrentRoutine()', context);
  fields.get('fWalking').value = '15';
  vm.runInContext('applyRecordRoutine(0)', context);
  vm.runInContext('closeRecordImportPreview()', context);

  assert.equal(fields.get('fWalking').value, '15');
  assert.equal(fields.get('recordImportDialog').open, false);
});

test('recent record preview preserves current inputs until confirmed', () => {
  const { context, fields } = createPage();
  fields.get('fDate').value = '2026-10-07';
  fields.get('fWeight').value = '65';
  vm.runInContext(`userRecords = [{ id:'past', date:'2026-10-06', weight:67, walking:30, water:1200, memo:'지난 메모', customExercises:[] }]`, context);
  vm.runInContext('loadRecentRecord()', context);
  assert.equal(fields.get('fWeight').value, '65');
  assert.match(fields.get('recordImportContent').innerHTML, /지난 메모/);
  vm.runInContext('confirmRecordImport(false)', context);
  assert.equal(fields.get('fDate').value, '2026-10-07');
  assert.equal(fields.get('fWeight').value, 67);
  assert.equal(fields.get('fMemo').value, '');
});

test('real account migrates device routine into an empty cloud slot without replacing cloud routines', async () => {
  const { context, storage, fields } = createPage();
  const local = { id: 'local-1', name: '집 걷기', walking: 25, walkingKm: 2, running: 0, runningKm: 0, customExercises: [] };
  const cloud = { id: 'cloud-1', slot: 1, name: '공원 러닝', walking: 0, walkingKm: 0, running: 30, runningKm: 4, customExercises: [] };
  storage.set('HealthGuardian_recordRoutines_v1_user-1', JSON.stringify([local]));
  const calls = [];
  context.URL = URL;
  context.window.location = { href: 'https://health-guardian-snh.vercel.app/record.html' };
  context.fetch = async (url, options) => {
    calls.push({ url, options });
    const body = options.method === 'GET'
      ? { ok: true, routines: [cloud] }
      : { ok: true, routine: JSON.parse(options.body) };
    return { ok: true, async json() { return body; } };
  };
  vm.runInContext("currentUser = { id: 'user-1', authProvider: 'naver' }; recordRoutines = loadRecordRoutines()", context);

  await vm.runInContext('syncRecordRoutines()', context);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(JSON.parse(calls[1].options.body).slot, 2);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(recordRoutines.map(item => item.name))', context)), ['공원 러닝', '집 걷기']);
  assert.equal(fields.get('openRoutineBtn').disabled, false);
  assert.equal(JSON.parse(storage.get('HealthGuardian_recordRoutines_v1_user-1')).length, 2);
  assert.equal(storage.get('HealthGuardian_recordRoutinesMigrated_v1_user-1'), '1');
});

test('a routine deleted on another device is not restored from an old local cache', async () => {
  const { context, storage } = createPage();
  storage.set('HealthGuardian_recordRoutinesMigrated_v1_user-1', '1');
  storage.set('HealthGuardian_recordRoutines_v1_user-1', JSON.stringify([
    { id: 'stale-1', slot: 1, name: '옛 루틴', walking: 20, customExercises: [] },
  ]));
  const calls = [];
  context.URL = URL;
  context.window.location = { href: 'https://health-guardian-snh.vercel.app/record.html' };
  context.fetch = async (_url, options) => {
    calls.push(options.method);
    return { ok: true, async json() { return { ok: true, routines: [] }; } };
  };
  vm.runInContext("currentUser = { id: 'user-1', authProvider: 'naver' }; recordRoutines = loadRecordRoutines()", context);

  await vm.runInContext('syncRecordRoutines()', context);

  assert.deepEqual(calls, ['GET']);
  assert.equal(vm.runInContext('recordRoutines.length', context), 0);
});

test('five quick routine slots remain visible when no routine is saved', () => {
  const { context, fields } = createPage();
  vm.runInContext('updateRoutineCount()', context);
  assert.equal(fields.get('routineQuickSection').hidden, false);
  assert.equal((fields.get('routineQuickList').innerHTML.match(/routine-quick-placeholder/g) || []).length, 5);
});

test('saved routines keep their numbered slots with placeholders between them', () => {
  const { context, fields } = createPage();
  vm.runInContext(`recordRoutines = [
    normalizeRoutine({ id:'second', slot:2, name:'걷기', walking:30, customExercises:[] }),
    normalizeRoutine({ id:'fifth', slot:5, name:'근력', customExercises:[{name:'덤벨 운동', duration:20}] })
  ]; updateRoutineCount()`, context);
  const html = fields.get('routineQuickList').innerHTML;
  assert.equal((html.match(/class="routine-quick-card/g) || []).length, 5);
  assert.equal((html.match(/routine-quick-placeholder/g) || []).length, 3);
  assert.ok(html.indexOf('루틴 1') < html.indexOf('2. 걷기'));
  assert.ok(html.indexOf('2. 걷기') < html.indexOf('루틴 3'));
  assert.ok(html.indexOf('루틴 4') < html.indexOf('5. 근력'));
  assert.match(html, /applyRecordRoutine\(1\)/);
});

test('new-record default date can be changed per account and survives reopening', () => {
  const { context, fields, storage } = createPage();
  assert.equal(vm.runInContext('getDefaultRecordDate()', context), 'yesterday');
  vm.runInContext("changeDefaultRecordDate('today')", context);
  assert.equal(fields.get('fDate').value, vm.runInContext('today()', context));
  assert.equal(storage.get('HealthGuardian_recordDefaultDate_v1_user-1'), 'today');
  assert.equal(vm.runInContext('getDefaultRecordDate()', context), 'today');
  vm.runInContext("editingId = 'record-1'; changeDefaultRecordDate('yesterday')", context);
  assert.equal(fields.get('fDate').value, vm.runInContext('today()', context));
  assert.equal(vm.runInContext('getDefaultRecordDate()', context), 'yesterday');
});

test('a date-only draft does not override the selected default on reopening', () => {
  const { context, fields, storage } = createPage();
  fields.get('fDate').value = '2026-10-07';
  storage.set('HealthGuardian_recordDraft_v1_user-1_new', JSON.stringify({
    fields: { fDate: '2026-10-06' }, condition: 3, customExercises: [], updatedAt: Date.now(),
  }));
  vm.runInContext('restoreRecordDraft()', context);
  assert.equal(fields.get('fDate').value, '2026-10-07');
  assert.equal(storage.has('HealthGuardian_recordDraft_v1_user-1_new'), false);
});

test('new writing replaces an existing date only after the user chooses replacement', async () => {
  const { context, fields } = createPage();
  const date = vm.runInContext('today()', context);
  fields.get('fDate').value = date;
  fields.get('fWalking').value = '45';
  vm.runInContext('userRecords = [{ id:"existing", userId:"user-1", date:today(), walking:20 }]', context);
  const saved = [];
  context.testSaved = saved;
  vm.runInContext('Records.saveAsync = async record => { testSaved.push(record); return record; }', context);
  const submit = { preventDefault() {}, currentTarget: { reportValidity: () => true } };

  await vm.runInContext('handleSave(testSubmit)', Object.assign(context, { testSubmit: submit }));
  assert.equal(saved.length, 0);
  assert.equal(fields.get('duplicateModal').style.display, 'flex');

  vm.runInContext('startNewRecordForExistingDate()', context);
  assert.equal(fields.get('replaceRecordNotice').hidden, false);
  assert.match(fields.get('saveBtn').textContent, /기존 기록 대체 저장/);
  assert.equal(fields.get('fWalking').value, '45');

  await vm.runInContext('handleSave(testSubmit)', context);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'existing');
  assert.equal(saved[0].walking, 45);
  assert.equal(vm.runInContext('userRecords.length', context), 1);
});

test('changing the date cancels the existing-record replacement choice', () => {
  const { context, fields } = createPage();
  vm.runInContext('userRecords = [{ id:"existing", date:today() }]; showDuplicateModal(userRecords[0]); startNewRecordForExistingDate()', context);
  vm.runInContext("handleRecordDateChange('2026-01-01')", context);
  assert.equal(vm.runInContext('replacingRecord', context), null);
  assert.equal(fields.get('replaceRecordNotice').hidden, true);
  assert.equal(fields.get('saveBtn').textContent, '💾 기록 저장하기');
});

test('choosing new writing during an edit targets the conflicting date instead of the original edit', () => {
  const { context, fields } = createPage();
  vm.runInContext('editingId = "original"; userRecords = [{ id:"conflicting", date:today() }]; showDuplicateModal(userRecords[0]); startNewRecordForExistingDate()', context);
  assert.equal(vm.runInContext('editingId', context), null);
  assert.equal(vm.runInContext('replacingRecord.id', context), 'conflicting');
  assert.equal(fields.get('saveBtn').textContent, '💾 기존 기록 대체 저장');
});
