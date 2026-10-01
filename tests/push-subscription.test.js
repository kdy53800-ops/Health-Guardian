const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createContext(existing, replacement) {
  const subscribed = [];
  const notifications = [];
  const storage = new Map();
  const registration = {
    pushManager: {
      async getSubscription() { return existing; },
      async subscribe(options) {
        subscribed.push(options);
        return replacement;
      },
    },
    async showNotification(title, options) { notifications.push({ title, options }); },
  };
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: {},
    navigator: { serviceWorker: { ready: Promise.resolve(registration) } },
    Notification: { permission: 'granted' },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    atob,
    Uint8Array,
    console,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8'), context);
  return { context, subscribed, notifications };
}

test('push subscription is renewed when the VAPID public key changes', async () => {
  let unsubscribed = 0;
  const old = {
    endpoint: 'https://push.example/old',
    options: { applicationServerKey: Uint8Array.of(1, 2, 3).buffer },
    async unsubscribe() { unsubscribed += 1; },
  };
  const fresh = { endpoint: 'https://push.example/new' };
  const { context, subscribed } = createContext(old, fresh);
  const key = Buffer.alloc(65, 5).toString('base64url');
  vm.runInContext(`HealthNotifications.vapidPublicKey = '${key}'`, context);
  const result = await vm.runInContext('HealthNotifications.getPushSubscription()', context);
  assert.equal(result, fresh);
  assert.equal(unsubscribed, 1);
  assert.equal(subscribed.length, 1);
  assert.equal(Buffer.from(subscribed[0].applicationServerKey).toString('base64url'), key);
  assert.equal(vm.runInContext('HealthNotifications.replacedEndpoint', context), old.endpoint);
});

test('push subscription stays in place when its key matches', async () => {
  const keyBytes = Uint8Array.from({ length: 65 }, (_, index) => index);
  const existing = { options: { applicationServerKey: keyBytes.buffer } };
  const { context, subscribed } = createContext(existing, null);
  vm.runInContext(`HealthNotifications.vapidPublicKey = '${Buffer.from(keyBytes).toString('base64url')}'`, context);
  assert.equal(await vm.runInContext('HealthNotifications.getPushSubscription()', context), existing);
  assert.equal(subscribed.length, 0);
});

test('enabled real-account subscription is registered again when the app opens', async () => {
  const keyBytes = Uint8Array.from({ length: 65 }, (_, index) => index);
  const existing = { endpoint: 'https://push.example/device-1', options: { applicationServerKey: keyBytes.buffer } };
  const { context, subscribed } = createContext(existing, null);
  context.window.Notification = context.Notification;
  vm.runInContext(`
    HealthNotifications.vapidPublicKey = '${Buffer.from(keyBytes).toString('base64url')}';
    HealthNotifications.serverConfigured = true;
    HealthNotifications.setEnabled('naver-user', true);
    HealthNotifications.saveSchedule = async (user, enabled, subscription) => {
      HealthNotifications.syncResult = { userId: user.id, enabled, endpoint: subscription.endpoint };
    };
  `, context);

  await vm.runInContext("HealthNotifications.refreshSubscription({ id: 'naver-user', authProvider: 'naver' })", context);

  assert.equal(subscribed.length, 0);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(HealthNotifications.syncResult)', context)), {
    userId: 'naver-user', enabled: true, endpoint: existing.endpoint,
  });
});

test('open-page reminder honors the recorded-day setting', async () => {
  const { context, notifications } = createContext(null, null);
  vm.runInContext(`
    Records.getUserRecords = () => [{ date: today() }];
    HealthNotifications.setEnabled('test_user_001', true);
    HealthNotifications.setSkipIfRecorded('test_user_001', true);
  `, context);
  await vm.runInContext("HealthNotifications.deliver({ id: 'test_user_001', authProvider: 'test' })", context);
  assert.equal(notifications.length, 0);

  vm.runInContext("HealthNotifications.setSkipIfRecorded('test_user_001', false)", context);
  await vm.runInContext("HealthNotifications.deliver({ id: 'test_user_001', authProvider: 'test' })", context);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].options.body, /오늘의 기록을 확인/);
  assert.equal(notifications[0].options.actions.length, 0);
});

test('real-account test notification uses the server and the saved device endpoint', async () => {
  const existing = { endpoint: 'https://push.example/device-1' };
  const { context, notifications } = createContext(existing, null);
  const requests = [];
  context.window.Notification = context.Notification;
  context.window.location = { href: 'https://health-guardian-snh.vercel.app/dashboard.html' };
  context.URL = URL;
  vm.runInContext('showToast = () => {}', context);
  context.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, async json() { return { ok: true, sent: true }; } };
  };

  await vm.runInContext("HealthNotifications.testNotification({ id: 'naver-user', authProvider: 'naver' })", context);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://health-guardian-snh.vercel.app/api/check-session?view=notification-test');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(JSON.parse(requests[0].options.body).endpoint, existing.endpoint);
  assert.equal(notifications.length, 0);
});

test('server test failure is shown instead of a local success notification', async () => {
  const { context, notifications } = createContext({ endpoint: 'https://push.example/device-1' }, null);
  context.window.Notification = context.Notification;
  context.window.location = { href: 'https://health-guardian-snh.vercel.app/dashboard.html' };
  context.URL = URL;
  context.fetch = async () => ({ ok: false, async json() { return { ok: false, message: '기기 등록 오류' }; } });

  await assert.rejects(
    vm.runInContext("HealthNotifications.testNotification({ id: 'naver-user', authProvider: 'naver' })", context),
    /기기 등록 오류/
  );
  assert.equal(notifications.length, 0);
});
