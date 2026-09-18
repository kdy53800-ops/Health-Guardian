const { timingSafeEqual } = require('crypto');
const { readSessionFromRequest } = require('./_lib/session');
const { fetchSupabase } = require('./_lib/supabase');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function encodeEq(value) { return encodeURIComponent(String(value)); }

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 20000) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 });
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (error) { return null; }
}

function safeSecretEqual(provided, expected) {
  const left = Buffer.from(String(provided || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function getSeoulClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
  return { date, time: `${parts.hour}:${parts.minute}`, weekday, now: now.toISOString() };
}

function daysBetween(dateText, todayText) {
  const from = new Date(`${dateText}T00:00:00+09:00`);
  const to = new Date(`${todayText}T00:00:00+09:00`);
  return Number.isFinite(from.getTime()) ? Math.max(0, Math.floor((to - from) / 86400000)) : null;
}

function previousDate(dateText) {
  const date = new Date(`${dateText}T12:00:00+09:00`);
  date.setDate(date.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function buildReminder(records, latestInbody, clock, includeCompletedDay = false) {
  const dates = new Set((records || []).map(record => record.record_date));
  const latestRecord = records && records[0] ? records[0].record_date : '';
  const inactiveDays = latestRecord ? daysBetween(latestRecord, clock.date) : null;
  const messages = [];
  let url = '/record.html';
  if (inactiveDays != null && inactiveDays >= 7) {
    messages.push(`📅 ${inactiveDays}일 동안 기록이 없어요. 오늘의 작은 움직임부터 남겨보세요.`);
  } else if (!dates.has(clock.date)) {
    let streak = 0;
    let cursor = previousDate(clock.date);
    while (dates.has(cursor)) { streak += 1; cursor = previousDate(cursor); }
    messages.push(streak >= 2 ? `🔥 ${streak}일 연속 기록을 오늘도 이어가세요.` : '📝 오늘의 건강 기록을 남겨보세요.');
  }
  const inbodyDays = latestInbody ? daysBetween(latestInbody, clock.date) : null;
  if (inbodyDays != null && inbodyDays >= 90) {
    messages.push(`💪 인바디 측정 후 ${inbodyDays}일이 지났습니다.`);
    if (messages.length === 1) url = '/inbody.html';
  }
  if (!messages.length && includeCompletedDay) {
    messages.push('✅ 오늘의 기록을 확인하고 몸의 변화를 돌아보세요.');
    url = '/dashboard.html';
  }
  return messages.length ? { title: '건강지킴이 알림', body: messages.join('\n'), url } : null;
}

function getReminderTiming(preference, clock) {
  const reminderDays = Array.isArray(preference.reminder_days)
    ? preference.reminder_days.map(Number)
    : [0,1,2,3,4,5,6];
  const parsedSnooze = preference.snoozed_until ? new Date(preference.snoozed_until) : null;
  const snoozedUntil = parsedSnooze && Number.isFinite(parsedSnooze.getTime()) ? parsedSnooze : null;
  const snoozeDue = !!(snoozedUntil && snoozedUntil <= new Date(clock.now));
  if (snoozedUntil && !snoozeDue) return { due: false, snoozeDue: false };
  if (snoozeDue) return { due: true, snoozeDue: true };
  return {
    due: reminderDays.includes(clock.weekday)
      && preference.muted_on !== clock.date
      && String(preference.reminder_time || '').slice(0, 5) === clock.time
      && preference.last_sent_on !== clock.date,
    snoozeDue: false,
  };
}

async function sendDueReminders() {
  const clock = getSeoulClock();
  const due = await fetchSupabase(
    '/rest/v1/notification_preferences?select=user_id,reminder_time,reminder_days,skip_if_recorded,last_sent_on,muted_on,snoozed_until&enabled=eq.true&limit=500',
    { headers: { Accept: 'application/json' } }
  );
  if (!Array.isArray(due) || !due.length) return { checked: 0, sent: 0 };
  const webpush = require('web-push');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://health-guardian-test.vercel.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  let sent = 0;
  for (const preference of due) {
    const userId = preference.user_id;
    try {
      const { due: reminderDue, snoozeDue } = getReminderTiming(preference, clock);
      if (!reminderDue) continue;
      const [records, inbody, subscriptions] = await Promise.all([
        fetchSupabase(`/rest/v1/daily_records?select=record_date&user_id=eq.${encodeEq(userId)}&order=record_date.desc&limit=100`, { headers: { Accept: 'application/json' } }),
        fetchSupabase(`/rest/v1/inbody_records?select=record_date&user_id=eq.${encodeEq(userId)}&order=record_date.desc&limit=1`, { headers: { Accept: 'application/json' } }),
        fetchSupabase(`/rest/v1/push_subscriptions?select=endpoint,subscription&user_id=eq.${encodeEq(userId)}&limit=20`, { headers: { Accept: 'application/json' } }),
      ]);
      if (preference.skip_if_recorded !== false && Array.isArray(records) && records.some(record => record.record_date === clock.date)) {
        if (snoozeDue) await fetchSupabase(`/rest/v1/notification_preferences?user_id=eq.${encodeEq(userId)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ snoozed_until: null }),
        });
        continue;
      }
      const reminder = buildReminder(
        records,
        Array.isArray(inbody) && inbody[0] ? inbody[0].record_date : '',
        clock,
        preference.skip_if_recorded === false
      );
      if (!reminder || !Array.isArray(subscriptions) || !subscriptions.length) continue;
      let delivered = false;
      for (const item of subscriptions) {
        try {
          await webpush.sendNotification(item.subscription, JSON.stringify({ ...reminder, tag: `scheduled-health-${clock.date}`, actions: true }), { TTL: 3600 });
          delivered = true;
        } catch (error) {
          if (error && (error.statusCode === 404 || error.statusCode === 410)) {
            await fetchSupabase(`/rest/v1/push_subscriptions?endpoint=eq.${encodeEq(item.endpoint)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
          } else console.warn('[ScheduledReminder] Push failed:', error && error.message);
        }
      }
      if (delivered) {
        sent += 1;
        await fetchSupabase(`/rest/v1/notification_preferences?user_id=eq.${encodeEq(userId)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ last_sent_on: clock.date, snoozed_until: null }),
        });
      }
    } catch (error) { console.warn('[ScheduledReminder] User reminder failed:', error.message); }
  }
  return { checked: due.length, sent };
}

async function handleNotificationSettings(req, res, session, body) {
  if (session.provider === 'test') {
    sendJson(res, 200, req.method === 'GET'
      ? { ok: true, configured: false, settings: { enabled: false, reminderTime: '20:00', reminderDays: [0,1,2,3,4,5,6], skipIfRecorded: true }, vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' }
      : { ok: true, settings: { enabled: !!body.enabled, reminderTime: body.reminderTime || '20:00', reminderDays: body.reminderDays || [0,1,2,3,4,5,6], skipIfRecorded: body.skipIfRecorded !== false } });
    return;
  }
  const profiles = await fetchSupabase(`/rest/v1/profiles?select=id,is_blocked&id=eq.${encodeEq(session.uid)}&limit=1`, { headers: { Accept: 'application/json' } });
  const profile = Array.isArray(profiles) && profiles[0] ? profiles[0] : null;
  if (!profile) { sendJson(res, 404, { ok: false, message: 'User profile not found.' }); return; }
  if (profile.is_blocked) { sendJson(res, 403, { ok: false, message: 'This account has been blocked.' }); return; }
  if (req.method === 'GET') {
    const rows = await fetchSupabase(`/rest/v1/notification_preferences?select=enabled,reminder_time,reminder_days,skip_if_recorded&user_id=eq.${encodeEq(session.uid)}&limit=1`, { headers: { Accept: 'application/json' } });
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    sendJson(res, 200, { ok: true, configured: !!row, settings: { enabled: !!(row && row.enabled), reminderTime: row && row.reminder_time ? String(row.reminder_time).slice(0, 5) : '20:00', reminderDays: row && Array.isArray(row.reminder_days) ? row.reminder_days : [0,1,2,3,4,5,6], skipIfRecorded: !row || row.skip_if_recorded !== false }, vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' });
    return;
  }
  if (!body || typeof body !== 'object') { sendJson(res, 400, { ok: false, message: 'JSON body is required.' }); return; }
  const enabled = body.enabled === true;
  const reminderTime = String(body.reminderTime || '20:00');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) { sendJson(res, 400, { ok: false, message: '알림 시각을 올바르게 선택해 주세요.' }); return; }
  const reminderDays = [...new Set((Array.isArray(body.reminderDays) ? body.reminderDays : [0,1,2,3,4,5,6]).map(Number))].filter(day => Number.isInteger(day) && day >= 0 && day <= 6).sort();
  if (!reminderDays.length) { sendJson(res, 400, { ok: false, message: '알림을 받을 요일을 하나 이상 선택해 주세요.' }); return; }
  const skipIfRecorded = body.skipIfRecorded !== false;
  const subscription = body.subscription;
  if (enabled) {
    const endpoint = subscription && String(subscription.endpoint || '');
    const keys = subscription && subscription.keys;
    if (!endpoint.startsWith('https://') || endpoint.length > 2000 || !keys || !keys.p256dh || !keys.auth || JSON.stringify(subscription).length > 10000) {
      sendJson(res, 400, { ok: false, message: '푸시 알림 기기 정보가 올바르지 않습니다.' }); return;
    }
    await fetchSupabase('/rest/v1/push_subscriptions?on_conflict=endpoint', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: session.uid, endpoint, subscription, last_seen_at: new Date().toISOString() }),
    });
  } else {
    await fetchSupabase(`/rest/v1/push_subscriptions?user_id=eq.${encodeEq(session.uid)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
  await fetchSupabase('/rest/v1/notification_preferences?on_conflict=user_id', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: session.uid, enabled, reminder_time: `${reminderTime}:00`, reminder_days: reminderDays, skip_if_recorded: skipIfRecorded, timezone: 'Asia/Seoul', updated_at: new Date().toISOString() }),
  });
  sendJson(res, 200, { ok: true, settings: { enabled, reminderTime, reminderDays, skipIfRecorded } });
}

async function handleNotificationAction(res, session, body) {
  const action = body && body.action;
  if (!['dismiss-today', 'snooze-30'].includes(action)) { sendJson(res, 400, { ok: false, message: '알림 작업이 올바르지 않습니다.' }); return; }
  if (session.provider === 'test') { sendJson(res, 200, { ok: true, action }); return; }
  const patch = action === 'dismiss-today'
    ? { muted_on: getSeoulClock().date, snoozed_until: null, updated_at: new Date().toISOString() }
    : { muted_on: null, snoozed_until: new Date(Date.now() + 30 * 60000).toISOString(), updated_at: new Date().toISOString() };
  await fetchSupabase(`/rest/v1/notification_preferences?user_id=eq.${encodeEq(session.uid)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch),
  });
  sendJson(res, 200, { ok: true, action, snoozedUntil: patch.snoozed_until || null });
}

module.exports = async function handler(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  if (requestUrl.searchParams.get('task') === 'send-reminders') {
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, message: 'Method Not Allowed' }); return; }
    try {
      const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!safeSecretEqual(provided, process.env.CRON_SECRET || '')) { sendJson(res, 401, { ok: false, message: 'Cron authorization failed.' }); return; }
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) { sendJson(res, 503, { ok: false, message: 'Web Push is not configured.' }); return; }
      sendJson(res, 200, { ok: true, ...(await sendDueReminders()) });
    } catch (error) { console.error('[ReminderCron]', error); sendJson(res, 500, { ok: false, message: 'Reminder job failed.' }); }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') { sendJson(res, 405, { ok: false, message: 'Method Not Allowed' }); return; }
  try {
    const session = readSessionFromRequest(req);
    if (!session || !session.uid) { sendJson(res, 401, { ok: false, message: 'Login session is required.' }); return; }
    if (requestUrl.searchParams.get('view') === 'notification-settings') {
      await handleNotificationSettings(req, res, session, req.method === 'POST' ? await readBody(req) : null);
      return;
    }
    if (requestUrl.searchParams.get('view') === 'notification-action') {
      if (req.method !== 'POST') { sendJson(res, 405, { ok: false, message: 'Method Not Allowed' }); return; }
      await handleNotificationAction(res, session, await readBody(req));
      return;
    }
    if (req.method !== 'GET') { sendJson(res, 405, { ok: false, message: 'Method Not Allowed' }); return; }
    if (session.provider === 'test' && /^test_(admin|user)_001$/.test(session.uid)) {
      const isAdmin = session.uid === 'test_admin_001';
      sendJson(res, 200, { ok: true, user: { id: session.uid, name: isAdmin ? '테스트 관리자' : '테스트 유저', username: isAdmin ? 'test_admin' : 'test_user', isAdmin, isSpecial: true, authProvider: 'test', exp: session.exp } });
      return;
    }
    const rows = await fetchSupabase(`/rest/v1/profiles?select=*&id=eq.${encodeEq(session.uid)}&limit=1`, { headers: { Accept: 'application/json' } });
    const profile = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!profile) { sendJson(res, 404, { ok: false, message: 'User profile not found.' }); return; }
    if (profile.is_blocked) { sendJson(res, 403, { ok: false, message: 'This account has been blocked.' }); return; }
    sendJson(res, 200, { ok: true, user: {
      id: profile.id, name: profile.name, username: profile.username, email: profile.email || '', phone: profile.phone || '', gender: profile.gender || '', birthday: profile.birthday || '', birthyear: profile.birthyear || '',
      isAdmin: !!profile.is_admin, isSpecial: !!profile.is_special, authProvider: profile.auth_provider || 'naver', supabaseUserId: profile.id, oauthProviderId: profile.oauth_provider_id || '',
    } });
  } catch (error) {
    console.error('[CheckSessionAPI]', error);
    sendJson(res, error.statusCode || 500, { ok: false, message: error.message || 'Internal Server Error' });
  }
};

module.exports._test = { buildReminder, getReminderTiming, getSeoulClock, safeSecretEqual };
