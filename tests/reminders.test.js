const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReminder, getReminderTiming, getSeoulClock, safeSecretEqual } = require('../api/check-session')._test;

test('Seoul clock uses the service timezone at the date boundary', () => {
  const clock = getSeoulClock(new Date('2026-09-18T15:05:00.000Z'));
  assert.deepEqual(
    { date: clock.date, time: clock.time, weekday: clock.weekday },
    { date: '2026-09-19', time: '00:05', weekday: 6 }
  );
});

test('daily reminder explains an inactive streak', () => {
  const reminder = buildReminder(
    [{ record_date: '2026-09-10' }],
    '2026-09-01',
    { date: '2026-09-18' }
  );
  assert.match(reminder.body, /8일 동안 기록이 없어요/);
});

test('completed-day reminder is available when skip-if-recorded is disabled', () => {
  const clock = { date: '2026-09-18' };
  assert.equal(buildReminder([{ record_date: clock.date }], '2026-09-17', clock), null);
  assert.deepEqual(
    buildReminder([{ record_date: clock.date }], '2026-09-17', clock, true),
    {
      title: '건강지킴이 알림',
      body: '✅ 오늘의 기록을 확인하고 몸의 변화를 돌아보세요.',
      url: '/dashboard.html',
    }
  );
});

test('a snoozed reminder remains due after midnight on an unselected weekday', () => {
  const timing = getReminderTiming(
    {
      reminder_time: '23:50:00',
      reminder_days: [5],
      snoozed_until: '2026-09-18T15:20:00.000Z',
      last_sent_on: '2026-09-18',
    },
    {
      date: '2026-09-19',
      time: '00:20',
      weekday: 6,
      now: '2026-09-18T15:20:30.000Z',
    }
  );
  assert.deepEqual(timing, { due: true, snoozeDue: true, sentOnDate: '2026-09-19' });
});

test('scheduled reminders retry for fifteen minutes without changing the delivery date', () => {
  const preference = {
    reminder_time: '20:00:00',
    reminder_days: [5],
    muted_on: null,
    last_sent_on: null,
  };
  const baseClock = { date: '2026-09-18', weekday: 5, now: '2026-09-18T11:00:00.000Z' };
  assert.equal(getReminderTiming(preference, { ...baseClock, time: '20:00' }).due, true);
  assert.equal(getReminderTiming(preference, { ...baseClock, time: '20:05' }).due, true);
  assert.equal(getReminderTiming(preference, { ...baseClock, time: '20:15' }).due, true);
  assert.equal(getReminderTiming(preference, { ...baseClock, time: '20:20' }).due, false);
});

test('late-night reminders recover after midnight against the original date', () => {
  const timing = getReminderTiming(
    { reminder_time: '23:55:00', reminder_days: [5], muted_on: null, last_sent_on: null },
    { date: '2026-09-19', time: '00:05', weekday: 6, now: '2026-09-18T15:05:00.000Z' }
  );
  assert.deepEqual(timing, { due: true, snoozeDue: false, sentOnDate: '2026-09-18' });
});

test('cron secret comparison rejects empty and partial values', () => {
  assert.equal(safeSecretEqual('', ''), false);
  assert.equal(safeSecretEqual('shared-secret', 'shared-secret'), true);
  assert.equal(safeSecretEqual('shared', 'shared-secret'), false);
});
