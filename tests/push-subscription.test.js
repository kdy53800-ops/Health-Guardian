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
