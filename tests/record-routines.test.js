const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createPage() {
  const storage = new Map();
  const fields = new Map();
  for (const id of ['fDate', 'fWeight', 'fHeartRate', 'fWalking', 'fWalkingKm', 'fRunning', 'fRunningKm', 'fWater', 'fFasting', 'fCondition', 'fMemo']) {
    fields.set(id, { value: '', checkValidity: () => true, reportValidity() {} });
  }
  fields.set('routineName', { value: '', focus() {} });
  fields.set('routineCount', { textContent: '' });
  fields.set('routineList', { innerHTML: '' });
  fields.set('saveRoutineBtn', { disabled: false });
  fields.set('routineSaveHint', { textContent: '' });
  fields.set('routineDialog', { close() {}, showModal() {} });
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
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'record.js'), 'utf8'), context);
  vm.runInContext(`
    currentUser = { id: 'user-1' };
    userGoals = { walking: 30, running: 20, water: 2000, customEx: 30 };
    showToast = (message) => testMessages.push(message);
    renderCustomExList = () => {};
    updateProgress = () => {};
    updateSummary = () => {};
    scheduleDraftSave = () => {};
  `, Object.assign(context, { testMessages: messages }));
  return { context, fields, storage, messages };
}

test('routines save at most four exercise templates for the current account', () => {
  const { context, fields, storage } = createPage();
  fields.get('fWalking').value = '35';
  for (let index = 1; index <= 5; index++) {
    fields.get('routineName').value = `루틴 ${index}`;
    vm.runInContext('saveCurrentRoutine()', context);
  }
  assert.equal(vm.runInContext('recordRoutines.length', context), 4);
  assert.equal(fields.get('routineCount').textContent, '4/4');
  assert.equal(fields.get('saveRoutineBtn').disabled, true);
  assert.equal(storage.has('HealthGuardian_recordRoutines_v1_user-1'), true);
  vm.runInContext("currentUser = { id: 'user-2' }; recordRoutines = loadRecordRoutines()", context);
  assert.equal(vm.runInContext('recordRoutines.length', context), 0);
});

test('applying a routine replaces only exercise fields and creates fresh exercise IDs', () => {
  const { context, fields } = createPage();
  Object.assign(fields.get('fDate'), { value: '2026-10-07' });
  fields.get('fWeight').value = '67.1';
  fields.get('fHeartRate').value = '72';
  fields.get('fWater').value = '800';
  fields.get('fWalking').value = '40';
  fields.get('fWalkingKm').value = '3.5';
  vm.runInContext(`customExercises = [{ id: 'old', category: '근력', name: '덤벨 운동', duration: 25, intensity: '중', sets: 3, reps: 10 }]`, context);
  fields.get('routineName').value = '아침 루틴';
  vm.runInContext('saveCurrentRoutine()', context);

  fields.get('fWalking').value = '10';
  fields.get('fWeight').value = '66.5';
  fields.get('fWater').value = '1500';
  vm.runInContext('customExercises = []', context);
  vm.runInContext('applyRecordRoutine(0)', context);

  assert.equal(fields.get('fWalking').value, 40);
  assert.equal(fields.get('fWalkingKm').value, 3.5);
  assert.equal(fields.get('fDate').value, '2026-10-07');
  assert.equal(fields.get('fWeight').value, '66.5');
  assert.equal(fields.get('fHeartRate').value, '72');
  assert.equal(fields.get('fWater').value, '1500');
  assert.equal(vm.runInContext('customExercises.length', context), 1);
  assert.notEqual(vm.runInContext('customExercises[0].id', context), 'old');
});

test('a routine does not overwrite exercise input when replacement is declined', () => {
  const { context, fields } = createPage();
  fields.get('fWalking').value = '40';
  fields.get('routineName').value = '걷기 루틴';
  vm.runInContext('saveCurrentRoutine()', context);
  fields.get('fWalking').value = '15';
  context.window.confirm = () => false;

  vm.runInContext('applyRecordRoutine(0)', context);

  assert.equal(fields.get('fWalking').value, '15');
});
