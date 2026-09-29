const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createReportContext(records) {
  const context = vm.createContext({
    Chart: { defaults: { font: {} } },
    window: {},
    document: { addEventListener() {} },
    today: () => '2026-09-29',
    localDateStr: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    GoalDefaults: { walking: 30, running: 0, water: 0, fasting: 0, customEx: 0 },
    records,
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard.js'), 'utf8');
  vm.runInContext(source, context);
  vm.runInContext('userRecords = records; userGoals = GoalDefaults;', context);
  return context;
}

test('current monthly report compares only the same elapsed days of the prior month', () => {
  const context = createReportContext([
    { date: '2026-08-05', walking: 30, weight: 69 },
    { date: '2026-08-30', walking: 100, weight: 68 },
    { date: '2026-09-03', walking: 20, weight: 67 },
    { date: '2026-09-25', walking: 40, weight: 66 },
  ]);
  const report = vm.runInContext("buildPersonalReport('2026-09')", context);
  assert.equal(report.records.length, 2);
  assert.equal(report.totalMinutes, 60);
  assert.equal(report.monthChange, 100);
  assert.equal(report.weightChange, -1);
});

test('past monthly report compares full calendar months and handles empty months', () => {
  const context = createReportContext([
    { date: '2026-07-31', walking: 50 },
    { date: '2026-08-05', walking: 30 },
    { date: '2026-08-30', walking: 70 },
  ]);
  const report = vm.runInContext("buildPersonalReport('2026-08')", context);
  assert.equal(report.totalMinutes, 100);
  assert.equal(report.monthChange, 100);
  assert.equal(report.goalRate, 100);
  const empty = vm.runInContext("buildPersonalReport('2026-06')", context);
  assert.equal(empty.records.length, 0);
  assert.equal(empty.totalMinutes, 0);
  assert.equal(empty.monthChange, null);
});
