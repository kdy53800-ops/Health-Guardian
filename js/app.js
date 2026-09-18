/* ===================================================
   app.js — Common Utilities & Data Layer
   건강지킴이
   =================================================== */

const APP_NAME = 'HealthGuardian';

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

// ─── Storage Keys ────────────────────────────────────
const KEYS = {
  RECORDS: `${APP_NAME}_records`,
  USERS: `${APP_NAME}_users`,
  CURRENT_USER: `${APP_NAME}_userSession_v2`,
  GOALS: `${APP_NAME}_goals`,
  RECORDS_MIGRATED: `${APP_NAME}_recordsMigrated`,
  RECORD_OUTBOX: `${APP_NAME}_recordOutbox`,
  NOTIFICATION_PREFS: `${APP_NAME}_notificationPrefs`,
  NOTIFICATION_TIME: `${APP_NAME}_notificationTime`,
  NOTIFICATION_SEEN: `${APP_NAME}_notificationSeen`,
  NOTIFICATION_PROMPT_SEEN: `${APP_NAME}_notificationPromptSeen_v2`,
};

// ─── Auth ─────────────────────────────────────────────
const Auth = {
  getUser() {
    const raw = localStorage.getItem(KEYS.CURRENT_USER);
    if (!raw) return null;
    try {
      const user = JSON.parse(raw);
      if (user.exp && Date.now() > user.exp) {
        localStorage.removeItem(KEYS.CURRENT_USER);
        return null;
      }
      seedTestAccountData(user);
      return user;
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
    seedTestAccountData(user);
  },

  getUsers() {
    const raw = localStorage.getItem(KEYS.USERS);
    return raw ? JSON.parse(raw) : [];
  },

  saveUsers(users) {
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  },

  register(name, username, password, phone = '') {
    const users = this.getUsers();
    if (users.find(u => u.username === username)) {
      return { ok: false, msg: '이미 존재하는 아이디입니다.' };
    }
    const user = { id: genId(), name, username, password, phone, createdAt: new Date().toISOString() };
    users.push(user);
    this.saveUsers(users);
    this.setUser({ id: user.id, name: user.name, username: user.username });
    return { ok: true };
  },

  login(username, password) {
    const users = this.getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return { ok: false, msg: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    this.setUser({ id: user.id, name: user.name, username: user.username, isAdmin: !!user.isAdmin });
    return { ok: true, isAdmin: !!user.isAdmin };
  },

  logout() {
    localStorage.removeItem(KEYS.CURRENT_USER);

    if (window.location.protocol.startsWith('http')) {
      fetch(new URL('api/logout', window.location.href).toString(), {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
      }).catch(() => {});
      window.location.href = 'index.html?logout=1';
      return;
    }

    window.location.href = 'index.html';
  },

  async deleteAccount() {
    if (!confirm('정말 계정을 탈퇴하시겠습니까?\n모든 기록과 설정이 영구적으로 삭제되며 복구할 수 없습니다.')) {
      return;
    }
    
    const user = this.getUser();
    if (!user) return;

    if (user.authProvider === 'naver' || String(user.id).includes('-')) {
      try {
        const res = await fetch(new URL('api/delete-account', window.location.href).toString(), {
          method: 'POST',
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          alert('계정 삭제 중 오류가 발생했습니다: ' + (data.message || '알 수 없는 오류'));
          return;
        }
      } catch (err) {
        console.error('[DeleteAccount Error]', err);
        alert('계정 삭제 중 네트워크 오류가 발생했습니다.');
        return;
      }
    }

    const allRecords = JSON.parse(localStorage.getItem(KEYS.RECORDS) || '[]');
    localStorage.setItem(KEYS.RECORDS, JSON.stringify(allRecords.filter(r => String(r.userId || '') !== String(user.id))));
    const pendingRecords = Records.getOutbox().filter(item => String(item.userId || '') !== String(user.id));
    Records.setOutbox(pendingRecords);
    localStorage.removeItem(KEYS.GOALS + '_' + user.id);
    localStorage.removeItem(KEYS.RECORDS_MIGRATED + '_' + user.id);
    localStorage.removeItem(KEYS.NOTIFICATION_PREFS + '_' + user.id);
    localStorage.removeItem(KEYS.NOTIFICATION_TIME + '_' + user.id);
    localStorage.removeItem(KEYS.NOTIFICATION_SEEN + '_' + user.id);
    localStorage.removeItem(KEYS.NOTIFICATION_PROMPT_SEEN + '_' + user.id);
    localStorage.removeItem(KEYS.NOTIFICATION_PREFS + '_' + user.id + '_days');
    localStorage.removeItem(KEYS.NOTIFICATION_PREFS + '_' + user.id + '_skip');
    const users = this.getUsers();
    this.saveUsers(users.filter(u => String(u.id) !== String(user.id)));
    localStorage.removeItem(KEYS.CURRENT_USER);

    if (user.authProvider === 'naver') {
      fetch(new URL('api/logout', window.location.href).toString(), { method: 'POST', credentials: 'include', keepalive: true }).catch(() => {});
    }

    alert('계정이 성공적으로 탈퇴되었습니다.\n그동안 건강지킴이를 이용해 주셔서 감사합니다.');
    window.location.href = 'index.html';
  },

  require() {
    const user = this.getUser();
    if (!user) {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  },

  requireAdmin() {
    const user = this.getUser();
    if (!user) { window.location.href = 'index.html'; return null; }
    if (user.isAdmin !== true) {
      alert('관리자 권한이 필요한 페이지입니다. 관리자 계정으로 다시 로그인해 주세요.');
      window.location.href = 'index.html';
      return null;
    }
    return user;
  },

  isAdmin() {
    const user = this.getUser();
    return !!(user && user.isAdmin);
  },

  async checkAndRestoreSession() {
    const user = this.getUser();
    if (user) return user;

    if (!window.location.protocol.startsWith('http')) {
      return null;
    }

    try {
      const response = await fetch(new URL('api/check-session', window.location.href).toString(), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;

      const payload = await response.json();
      if (payload && payload.ok && payload.user) {
        this.setUser(payload.user);
        return payload.user;
      }
    } catch (e) {
      console.warn('[Auth] Failed to restore session:', e);
    }
    return null;
  },
};

// ─── Records ──────────────────────────────────────────
function readLocalRecords() {
  const raw = localStorage.getItem(KEYS.RECORDS);
  return raw ? JSON.parse(raw) : [];
}

function writeLocalRecords(records) {
  localStorage.setItem(KEYS.RECORDS, JSON.stringify(records));
}

function getCurrentRemoteUser(userId) {
  const current = Auth.getUser();
  if (!current) return null;
  if (current.authProvider !== 'naver' || !current.supabaseUserId) return null;
  if (current.id !== userId && current.supabaseUserId !== userId) return null;
  return current;
}

async function readApiJson(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }
  return payload;
}

const Records = {
  getAll() {
    return readLocalRecords();
  },

  getUserRecords(userId) {
    return this.getAll().filter(r => r.userId === userId);
  },

  replaceUserRecords(userId, records) {
    const all = this.getAll().filter(r => r.userId !== userId);
    const pending = this.getOutbox().filter(item => item.userId === userId).map(item => ({ ...item.record, _pendingSync: true }));
    const pendingIds = new Set(pending.map(record => record.id));
    writeLocalRecords([...all, ...records.filter(record => !pendingIds.has(record.id)), ...pending]);
  },

  getOutbox() {
    try {
      const value = JSON.parse(localStorage.getItem(KEYS.RECORD_OUTBOX) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  },

  setOutbox(items) {
    localStorage.setItem(KEYS.RECORD_OUTBOX, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('records-outbox-change', {
      detail: { pending: Array.isArray(items) ? items.length : 0 },
    }));
  },

  getPendingCount(userId) {
    return this.getOutbox().filter(item => String(item.userId || '') === String(userId || '')).length;
  },

  queueForSync(record, userId) {
    const outbox = this.getOutbox().filter(item => !(item.userId === userId && item.record && item.record.id === record.id));
    outbox.push({ userId, record: { ...record, userId }, queuedAt: new Date().toISOString() });
    this.setOutbox(outbox);
  },

  async syncPending(userId) {
    const remoteUser = getCurrentRemoteUser(userId);
    if (!remoteUser || !navigator.onLine) return 0;
    const pending = this.getOutbox().filter(item => item.userId === userId);
    if (pending.length) {
      window.dispatchEvent(new CustomEvent('records-sync-start', { detail: { pending: pending.length } }));
    }
    let synced = 0;
    for (const item of pending) {
      try {
        const { response, payload } = await this.saveRemote(item.record);
        if (response.ok && payload && payload.ok) {
          this.save({ ...payload.record, userId: remoteUser.id });
          this.setOutbox(this.getOutbox().filter(entry => !(entry.userId === userId && entry.record && entry.record.id === item.record.id)));
          synced += 1;
        } else if (payload && payload.code === 'duplicate_date' && payload.existingRecord) {
          this.save({ ...payload.existingRecord, userId: remoteUser.id });
          this.setOutbox(this.getOutbox().filter(entry => !(entry.userId === userId && entry.record && entry.record.id === item.record.id)));
          synced += 1;
        }
      } catch (error) {
        break;
      }
    }
    window.dispatchEvent(new CustomEvent('records-sync-complete', {
      detail: { synced, pending: this.getPendingCount(userId) },
    }));
    return synced;
  },

  save(record) {
    const all = this.getAll();
    const idx = all.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
    } else {
      all.push(record);
    }
    writeLocalRecords(all);
  },

  delete(id) {
    const all = this.getAll().filter(r => r.id !== id);
    writeLocalRecords(all);
  },

  getById(id) {
    return this.getAll().find(r => r.id === id);
  },

  getByDate(userId, date) {
    return this.getUserRecords(userId).find(r => r.date === date);
  },

  getMigrationFlag(userId) {
    return localStorage.getItem(`${KEYS.RECORDS_MIGRATED}_${userId}`) === '1';
  },

  setMigrationFlag(userId) {
    localStorage.setItem(`${KEYS.RECORDS_MIGRATED}_${userId}`, '1');
  },

  clearMigrationFlag(userId) {
    localStorage.removeItem(`${KEYS.RECORDS_MIGRATED}_${userId}`);
  },

  async saveRemote(record) {
    const response = await fetch(new URL('api/records', window.location.href).toString(), {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ record }),
    });
    const payload = await readApiJson(response);
    return { response, payload };
  },

  async migrateLocalRecordsToRemote(remoteUser, remoteRecords) {
    const localRecords = this.getUserRecords(remoteUser.id);
    if (!localRecords.length) {
      this.setMigrationFlag(remoteUser.id);
      return remoteRecords;
    }

    const remoteIds = new Set((remoteRecords || []).map(item => item.id));
    const pending = localRecords.filter(item => !remoteIds.has(item.id));
    if (!pending.length) {
      this.setMigrationFlag(remoteUser.id);
      return remoteRecords;
    }

    for (const record of pending.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      try {
        const { response, payload } = await this.saveRemote(record);
        if (!response.ok || !payload || !payload.ok) {
          if (payload && payload.code === 'duplicate_date') continue;
          if (response.status === 401) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
          throw new Error((payload && payload.message) || 'Failed to migrate local records.');
        }
      } catch (error) {
        console.warn('[Records] Local record migration failed:', error);
        return remoteRecords;
      }
    }

    this.setMigrationFlag(remoteUser.id);
    const refreshed = await this.getUserRecordsAsync(remoteUser.id, { skipMigration: true });
    return refreshed;
  },

  async getUserRecordsAsync(userId, options = {}) {
    const remoteUser = getCurrentRemoteUser(userId);
    if (!remoteUser) return this.getUserRecords(userId);

    try {
      await this.syncPending(userId);
      const response = await fetch(new URL('api/records', window.location.href).toString(), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const payload = await readApiJson(response);
      if (!response.ok || !payload || !payload.ok) {
        if (response.status === 401) {
          throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
        }
        throw new Error((payload && payload.message) || 'Failed to load records from server.');
      }

      const records = Array.isArray(payload.records)
        ? payload.records.map(item => ({ ...item, userId: remoteUser.id }))
        : [];
      this.replaceUserRecords(remoteUser.id, records);

      if (!options.skipMigration && !this.getMigrationFlag(remoteUser.id)) {
        return this.migrateLocalRecordsToRemote(remoteUser, records);
      }

      return this.getUserRecords(remoteUser.id);
    } catch (error) {
      console.warn('[Records] Failed to load remote records:', error);
      if (error.message && error.message.includes('로그인 세션이 만료되었습니다')) {
        alert(error.message);
        Auth.logout();
        return [];
      }
      showToast('서버 기록을 불러오지 못했습니다. 표시된 내용은 이 기기에 저장된 최근 기록일 수 있습니다.', 'error');
      return this.getUserRecords(userId);
    }
  },

  async getByIdAsync(id, userId) {
    const records = await this.getUserRecordsAsync(userId);
    return records.find(r => r.id === id) || null;
  },

  async getByDateAsync(userId, date) {
    const records = await this.getUserRecordsAsync(userId);
    return records.find(r => r.date === date) || null;
  },

  async saveAsync(record, userId) {
    const remoteUser = getCurrentRemoteUser(userId);
    if (!remoteUser) {
      this.save(record);
      return record;
    }

    let response;
    let payload;
    try {
      ({ response, payload } = await this.saveRemote(record));
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError || String(error.message || '').includes('fetch')) {
        const pendingRecord = { ...record, userId: remoteUser.id, _pendingSync: true };
        this.save(pendingRecord);
        this.queueForSync(pendingRecord, remoteUser.id);
        return pendingRecord;
      }
      throw error;
    }
    if (!response.ok || !payload || !payload.ok) {
      const error = new Error(
        response.status === 401
          ? '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.'
          : ((payload && payload.message) || 'Failed to save record.')
      );
      if (payload && payload.code) error.code = payload.code;
      if (payload && payload.existingRecord) {
        error.existingRecord = { ...payload.existingRecord, userId: remoteUser.id };
      }
      throw error;
    }

    const saved = { ...payload.record, userId: remoteUser.id };
    this.save(saved);
    return saved;
  },

  async deleteAsync(id, userId) {
    const remoteUser = getCurrentRemoteUser(userId);
    if (!remoteUser) {
      this.delete(id);
      return;
    }

    const queuedRecord = this.getOutbox().some(item => (
      String(item.userId || '') === String(remoteUser.id)
      && item.record
      && String(item.record.id || '') === String(id)
    ));
    if (queuedRecord) {
      this.setOutbox(this.getOutbox().filter(item => !(
        String(item.userId || '') === String(remoteUser.id)
        && item.record
        && String(item.record.id || '') === String(id)
      )));
      this.delete(id);
      return;
    }

    const endpoint = new URL('api/records', window.location.href);
    endpoint.searchParams.set('id', id);
    const response = await fetch(endpoint.toString(), {
      method: 'DELETE',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const payload = await readApiJson(response);
    if (!response.ok || !payload || !payload.ok) {
      throw new Error(
        response.status === 401
          ? '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.'
          : ((payload && payload.message) || 'Failed to delete record.')
      );
    }

    this.delete(id);
  },
};

// ─── Goals ────────────────────────────────────────────
const GoalDefaults = {
  walking: 30,
  running: 20,
  water: 2000,
  fasting: 12,
  weight: 0,
  customEx: 30,
};

const Goals = {
  get(userId) {
    const raw = localStorage.getItem(`${KEYS.GOALS}_${userId}`);
    return raw ? JSON.parse(raw) : { ...GoalDefaults };
  },
  save(userId, goals) {
    localStorage.setItem(`${KEYS.GOALS}_${userId}`, JSON.stringify(goals));
  },
};

// ─── Utils ────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(dateStr, opts = { year: 'numeric', month: 'long', day: 'numeric' }) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', opts);
}

function formatDateShort(dateStr) {
  return formatDate(dateStr, { month: 'short', day: 'numeric' });
}

function dayOfWeek(dateStr) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date(dateStr + 'T00:00:00').getDay()];
}

function clamp(val, min, max) {
  return Math.min(Math.max(Number(val) || 0, min), max);
}

function percent(val, goal) {
  if (!goal) return 0;
  return Math.round((val / goal) * 100);
}

function csvCell(value) {
  let text = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsvFile(filename, rows) {
  const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Streak Calc ──────────────────────────────────────
function calcStreak(records) {
  if (!records.length) return 0;

  const todayStr     = today();
  const yesterdayStr = prevDay(todayStr);

  const dateSet = new Set(
    records.map(r => r.date).filter(d => d <= todayStr)
  );
  if (!dateSet.size) return 0;

  const startDate = dateSet.has(todayStr) ? todayStr : yesterdayStr;
  if (!dateSet.has(startDate)) return 0;

  let streak = 0;
  let check  = startDate;
  while (dateSet.has(check)) {
    streak++;
    check = prevDay(check);
  }
  return streak;
}

function prevDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getLast7Days() {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(localDateStr(d));
  }
  return result;
}

function localDateStr(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getLast30Days() {
  const result = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(localDateStr(d));
  }
  return result;
}

function getCurrentWeekDays() {
  const todayDate = new Date();
  const dow = todayDate.getDay(); 
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(todayDate);
  monday.setDate(todayDate.getDate() - diffToMonday);

  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    result.push(localDateStr(d));
  }
  return result; 
}

// ─── Toast ────────────────────────────────────────────
function showToast(msg, type = 'default') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', default: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = document.createElement('span');
  icon.textContent = icons[type] || icons.default;
  const message = document.createElement('span');
  message.textContent = String(msg == null ? '' : msg);
  toast.append(icon, message);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOutToast 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Consent-based health reminders ──────────────────
const HealthNotifications = {
  alerts: [],
  vapidPublicKey: '',
  serverConfigured: false,

  preferenceKey(userId) {
    return `${KEYS.NOTIFICATION_PREFS}_${userId}`;
  },

  isEnabled(userId) {
    return localStorage.getItem(this.preferenceKey(userId)) === 'enabled';
  },

  setEnabled(userId, enabled) {
    localStorage.setItem(this.preferenceKey(userId), enabled ? 'enabled' : 'disabled');
  },

  getReminderTime(userId) {
    return localStorage.getItem(`${KEYS.NOTIFICATION_TIME}_${userId}`) || '20:00';
  },

  setReminderTime(userId, time) {
    localStorage.setItem(`${KEYS.NOTIFICATION_TIME}_${userId}`, time);
  },

  getReminderDays(userId) {
    try {
      const saved = JSON.parse(localStorage.getItem(`${KEYS.NOTIFICATION_PREFS}_${userId}_days`));
      return Array.isArray(saved) && saved.length ? saved.map(Number).filter(day => day >= 0 && day <= 6) : [0,1,2,3,4,5,6];
    } catch (error) { return [0,1,2,3,4,5,6]; }
  },

  setReminderDays(userId, days) {
    localStorage.setItem(`${KEYS.NOTIFICATION_PREFS}_${userId}_days`, JSON.stringify(days));
  },

  getSkipIfRecorded(userId) {
    return localStorage.getItem(`${KEYS.NOTIFICATION_PREFS}_${userId}_skip`) !== 'false';
  },

  setSkipIfRecorded(userId, enabled) {
    localStorage.setItem(`${KEYS.NOTIFICATION_PREFS}_${userId}_skip`, enabled ? 'true' : 'false');
  },

  async loadSchedule(user) {
    if (!user || user.authProvider === 'test') return;
    try {
      const endpoint = new URL('api/check-session', window.location.href);
      endpoint.searchParams.set('view', 'notification-settings');
      const response = await fetch(endpoint.toString(), { credentials: 'include', headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !payload || !payload.ok) return;
      this.vapidPublicKey = payload.vapidPublicKey || '';
      this.serverConfigured = !!payload.configured;
      if (payload.configured && payload.settings) {
        this.setEnabled(user.id, !!payload.settings.enabled);
        this.setReminderTime(user.id, payload.settings.reminderTime || '20:00');
        this.setReminderDays(user.id, payload.settings.reminderDays || [0,1,2,3,4,5,6]);
        this.setSkipIfRecorded(user.id, payload.settings.skipIfRecorded !== false);
      } else if (this.isEnabled(user.id)) {
        localStorage.removeItem(this.preferenceKey(user.id));
      }
    } catch (error) {
      console.warn('[HealthNotifications] Schedule unavailable:', error.message);
    }
  },

  toApplicationServerKey(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
  },

  async getPushSubscription() {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      if (!this.vapidPublicKey) throw new Error('예약 알림 서버 설정이 아직 준비되지 않았습니다.');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.toApplicationServerKey(this.vapidPublicKey),
      });
    }
    return subscription;
  },

  async saveSchedule(user, enabled, subscription = null) {
    const timeInput = document.getElementById('healthNotificationTime');
    const reminderTime = timeInput ? timeInput.value : this.getReminderTime(user.id);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) throw new Error('알림 시각을 선택해 주세요.');
    const reminderDays = [...document.querySelectorAll('[name="healthNotificationDay"]:checked')].map(input => Number(input.value));
    if (!reminderDays.length) throw new Error('알림을 받을 요일을 하나 이상 선택해 주세요.');
    const skipIfRecorded = document.getElementById('healthNotificationSkipRecorded')?.checked !== false;
    if (user.authProvider !== 'test') {
      const endpoint = new URL('api/check-session', window.location.href);
      endpoint.searchParams.set('view', 'notification-settings');
      const response = await fetch(endpoint.toString(), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ enabled, reminderTime, reminderDays, skipIfRecorded, subscription: subscription ? subscription.toJSON() : null }),
      });
      const payload = await response.json();
      if (!response.ok || !payload || !payload.ok) throw new Error((payload && payload.message) || '알림 설정을 저장하지 못했습니다.');
      this.serverConfigured = true;
    }
    this.setReminderTime(user.id, reminderTime);
    this.setReminderDays(user.id, reminderDays);
    this.setSkipIfRecorded(user.id, skipIfRecorded);
    this.setEnabled(user.id, enabled);
  },

  shouldShowInitialPrompt(userId) {
    return !localStorage.getItem(this.preferenceKey(userId))
      && localStorage.getItem(`${KEYS.NOTIFICATION_PROMPT_SEEN}_${userId}`) !== 'seen';
  },

  markInitialPromptSeen(userId) {
    localStorage.setItem(`${KEYS.NOTIFICATION_PROMPT_SEEN}_${userId}`, 'seen');
  },

  daysSince(dateText) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ''))) return null;
    const [year, month, day] = dateText.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    const now = new Date();
    const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.floor((current - target) / 86400000));
  },

  async evaluate(user) {
    if (!user) return [];
    const records = Records.getUserRecords(user.id).filter(record => record && record.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const alerts = [];
    const todayText = today();
    const hasToday = records.some(record => record.date === todayText);
    const lastRecord = records[0] || null;
    const inactiveDays = lastRecord ? this.daysSince(lastRecord.date) : this.daysSince(user.createdAt && String(user.createdAt).slice(0, 10));

    if (inactiveDays != null && inactiveDays >= 7) {
      alerts.push({ type: 'inactive', icon: '📅', title: `${inactiveDays}일 동안 기록이 없어요`, body: '오늘의 작은 움직임부터 부담 없이 기록해 보세요.', href: 'record.html' });
    } else if (!hasToday && records.some(record => record.date === prevDay(todayText))) {
      const streak = calcStreak(records);
      if (streak >= 2) alerts.push({ type: 'streak', icon: '🔥', title: `${streak}일 연속 기록을 이어가세요`, body: '오늘 기록을 남기면 연속 기록이 계속됩니다.', href: 'record.html' });
    }

    if (user.authProvider === 'naver' && user.supabaseUserId) {
      try {
        const response = await fetch(new URL('api/inbody-data', window.location.href).toString(), {
          credentials: 'include', headers: { Accept: 'application/json' },
        });
        const payload = await response.json();
        const inbodyRecords = response.ok && payload && Array.isArray(payload.records) ? payload.records : [];
        const latest = inbodyRecords.map(record => record.record_date).filter(Boolean).sort().pop();
        const elapsed = this.daysSince(latest);
        if (elapsed != null && elapsed >= 90) {
          alerts.push({ type: 'inbody', icon: '💪', title: '인바디 재측정 시기예요', body: `마지막 측정 후 ${elapsed}일이 지났습니다. 변화 추이를 다시 확인해 보세요.`, href: 'inbody.html' });
        }
      } catch (error) {
        console.warn('[HealthNotifications] InBody reminder unavailable:', error.message);
      }
    }

    this.alerts = alerts;
    this.updateBadge();
    this.renderList();
    return alerts;
  },

  updateBadge() {
    const count = document.getElementById('notificationCount');
    if (!count) return;
    count.textContent = String(this.alerts.length);
    count.hidden = this.alerts.length === 0;
  },

  renderList() {
    const list = document.getElementById('healthNotificationList');
    if (!list) return;
    if (!this.alerts.length) {
      list.innerHTML = '<div class="health-notification-empty">현재 확인할 건강 알림이 없습니다.</div>';
      return;
    }
    list.innerHTML = this.alerts.map(alert => `
      <a class="health-notification-item" href="${escapeAttribute(alert.href)}">
        <span class="health-notification-icon">${alert.icon}</span>
        <span><strong>${escapeHtml(alert.title)}</strong><small>${escapeHtml(alert.body)}</small></span>
      </a>`).join('');
  },

  updatePermissionUI(user) {
    const status = document.getElementById('healthNotificationStatus');
    const button = document.getElementById('healthNotificationToggle');
    const timeInput = document.getElementById('healthNotificationTime');
    const saveButton = document.getElementById('healthNotificationSaveTime');
    const quickActions = document.getElementById('healthNotificationQuickActions');
    if (!status || !button) return;
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    const enabled = supported && this.isEnabled(user.id) && Notification.permission === 'granted';
    if (timeInput) timeInput.value = this.getReminderTime(user.id);
    updateReminderTimeDisplay();
    const reminderDays = this.getReminderDays(user.id);
    document.querySelectorAll('[name="healthNotificationDay"]').forEach(input => { input.checked = reminderDays.includes(Number(input.value)); });
    const skipInput = document.getElementById('healthNotificationSkipRecorded');
    if (skipInput) skipInput.checked = this.getSkipIfRecorded(user.id);
    if (!supported) {
      status.textContent = '이 브라우저에서는 PWA 알림을 지원하지 않습니다.';
      button.hidden = true;
      if (saveButton) saveButton.hidden = true;
      return;
    }
    button.hidden = false;
    if (saveButton) saveButton.hidden = !enabled;
    if (quickActions) quickActions.hidden = !enabled;
    button.textContent = enabled ? '예약 알림 끄기' : '지정 시각 알림 받기';
    button.classList.toggle('enabled', enabled);
    status.textContent = Notification.permission === 'denied'
      ? '브라우저에서 알림이 차단되어 있습니다. 브라우저 설정에서 허용할 수 있습니다.'
      : (enabled ? `${this.formatReminderDays(reminderDays)} ${this.getReminderTime(user.id)}에 필요한 알림을 알려드립니다.` : '요일과 시각을 선택한 뒤 동의한 경우에만 알림을 보냅니다.');
  },

  formatReminderDays(days) {
    const sorted = [...days].map(Number).sort();
    if (sorted.length === 7) return '매일';
    if (sorted.length === 5 && [1,2,3,4,5].every(day => sorted.includes(day))) return '평일';
    return sorted.map(day => ['일','월','화','수','목','금','토'][day]).join('·') + '요일';
  },

  excludeWeekend(user) {
    document.querySelectorAll('[name="healthNotificationDay"]').forEach(input => { input.checked = ![0,6].includes(Number(input.value)); });
    this.updateWeekendButton();
    if (user) document.getElementById('healthNotificationSaveTime').hidden = false;
  },

  updateWeekendButton() {
    const button = document.getElementById('healthNotificationWeekdays');
    if (!button) return;
    const checked = [...document.querySelectorAll('[name="healthNotificationDay"]:checked')].map(input => Number(input.value));
    button.classList.toggle('active', checked.length === 5 && [1,2,3,4,5].every(day => checked.includes(day)));
  },

  async action(user, action) {
    if (!user || !['dismiss-today', 'snooze-30'].includes(action)) return;
    if (user.authProvider !== 'test') {
      const endpoint = new URL('api/check-session', window.location.href);
      endpoint.searchParams.set('view', 'notification-action');
      const response = await fetch(endpoint.toString(), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error('알림 상태를 저장하지 못했습니다.');
    }
    if (action === 'dismiss-today') localStorage.setItem(`${KEYS.NOTIFICATION_SEEN}_${user.id}`, `${today()}:dismissed`);
    closeNotificationCenter();
    showToast(action === 'dismiss-today' ? '오늘은 건강 알림을 보내지 않습니다.' : '30분 후 다시 알려드릴게요.', 'success');
  },

  async testNotification() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      throw new Error('이 브라우저에서는 알림 테스트를 지원하지 않습니다.');
    }
    const env = getInstallEnvironment();
    if (env.ios && !isPwaInstalled()) {
      throw new Error('아이폰에서는 건강지킴이를 홈 화면에 설치한 뒤 알림을 테스트할 수 있습니다.');
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('브라우저 알림 권한을 허용해 주세요.');
    }
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('건강지킴이 테스트 알림', {
      body: '알림이 정상적으로 표시되고 있습니다.',
      icon: '/images/app-icon-192.png',
      badge: '/images/app-icon-192.png',
      tag: `health-reminder-test-${Date.now()}`,
      renotify: false,
      data: { url: '/dashboard.html' },
      actions: [],
    });
    showToast('테스트 알림을 보냈습니다. 기기의 알림 영역을 확인해 주세요.', 'success');
  },

  async toggle(user) {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    const enabled = this.isEnabled(user.id) && Notification.permission === 'granted';
    if (enabled) {
      try {
        await this.saveSchedule(user, false);
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await subscription.unsubscribe();
        this.updatePermissionUI(user);
        showToast('예약 건강 알림을 껐습니다.', 'default');
      } catch (error) { showToast(error.message || '알림 설정을 변경하지 못했습니다.', 'error'); }
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      this.setEnabled(user.id, false);
      this.updatePermissionUI(user);
      showToast('알림 권한이 허용되지 않았습니다.', 'default');
      return;
    }
    try {
      const subscription = user.authProvider === 'test' ? null : await this.getPushSubscription();
      await this.saveSchedule(user, true, subscription);
      this.updatePermissionUI(user);
      showToast(`${this.getReminderTime(user.id)} 예약 알림을 켰습니다.`, 'success');
    } catch (error) {
      this.setEnabled(user.id, false);
      this.updatePermissionUI(user);
      showToast(error.message || '예약 알림을 설정하지 못했습니다.', 'error');
    }
  },

  async saveTime(user) {
    try {
      const subscription = user.authProvider === 'test' ? null : await this.getPushSubscription();
      await this.saveSchedule(user, true, subscription);
      this.updatePermissionUI(user);
      showToast('알림 설정을 저장했습니다.', 'success');
    } catch (error) { showToast(error.message || '알림 시각을 저장하지 못했습니다.', 'error'); }
  },

  matchesScheduleNow(user) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    return this.getReminderTime(user.id) === `${parts.hour}:${parts.minute}`;
  },

  async deliver(user, force = false) {
    if (!this.isEnabled(user.id) || Notification.permission !== 'granted' || !this.alerts.length) return;
    const seenKey = `${KEYS.NOTIFICATION_SEEN}_${user.id}`;
    const signature = `${today()}:${this.alerts.map(alert => alert.type).sort().join(',')}`;
    if (!force && localStorage.getItem(seenKey) === signature) return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('건강지킴이 알림', {
      body: this.alerts.map(alert => `${alert.icon} ${alert.title}`).join('\n'),
      icon: '/images/app-icon-192.png',
      badge: '/images/app-icon-192.png',
      tag: `health-reminder-${today()}`,
      renotify: false,
      data: { url: '/dashboard.html' },
      actions: [
        { action: 'snooze-30', title: '30분 후' },
        { action: 'dismiss-today', title: '오늘은 그만' },
      ],
    });
    localStorage.setItem(seenKey, signature);
  },
};

function seedTestAccountData(user) {
  if (!user || user.authProvider !== 'test' || !/^test_(admin|user)_001$/.test(String(user.id || ''))) return;
  const userId = String(user.id);
  const dateAtOffset = offset => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const seedKey = `${APP_NAME}_testDataSeeded_${userId}`;
  const seedDate = dateAtOffset(0);
  if (localStorage.getItem(seedKey) === seedDate) return;
  const samples = [
    [-28, 20, 0, 15, 1500, 3, 68.4], [-24, 25, 5, 20, 1700, 3, 68.1],
    [-20, 30, 0, 20, 1800, 4, 67.9], [-16, 35, 10, 25, 1900, 4, 67.6],
    [-12, 30, 10, 25, 2000, 4, 67.4], [-9, 40, 0, 30, 2100, 4, 67.2],
    [-6, 35, 15, 30, 2000, 5, 67.0], [-4, 45, 10, 35, 2200, 4, 66.9],
    [-2, 50, 0, 35, 2300, 5, 66.8], [0, 40, 20, 40, 2100, 5, 66.7],
  ];
  const fixtures = samples.map(([offset, walking, running, strength, water, condition, weight], index) => ({
    id: `test-seed-${userId}-${index}`,
    userId,
    date: dateAtOffset(offset),
    walking,
    running,
    walkingKm: Number((walking * 0.075).toFixed(1)),
    runningKm: Number((running * 0.14).toFixed(1)),
    weight,
    water,
    fasting: 12,
    heartRate: 68 + (index % 4) * 2,
    condition,
    memo: index === samples.length - 1 ? '테스트 화면 확인용 가상 기록' : '',
    customExercises: [{ id:`test-ex-${index}`, category:'근력', name:'전신 근력운동', duration:strength, intensity:'보통', sets:3, reps:12 }],
    savedAt: `${dateAtOffset(offset)}T09:00:00.000Z`,
  }));
  const existing = readLocalRecords().filter(record => !(String(record.userId) === userId && String(record.id || '').startsWith('test-seed-')));
  writeLocalRecords([...existing, ...fixtures]);
  localStorage.setItem(`${KEYS.GOALS}_${userId}`, JSON.stringify({ walking:30, running:15, water:2000, fasting:12, weight:0, customEx:30 }));
  localStorage.setItem(seedKey, seedDate);
}

function openNotificationCenter() {
  const user = Auth.getUser();
  if (!user) return;
  let overlay = document.getElementById('healthNotificationOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'healthNotificationOverlay';
    overlay.className = 'health-notification-overlay';
    overlay.innerHTML = `
      <section class="health-notification-panel" role="dialog" aria-modal="true" aria-labelledby="healthNotificationTitle">
        <div class="health-notification-header"><div><h2 id="healthNotificationTitle">건강 알림</h2><p>기록 변화를 바탕으로 생활 관리를 도와드려요.</p></div><button type="button" class="health-notification-close" aria-label="알림 닫기">×</button></div>
        <div id="healthNotificationList" class="health-notification-list"></div>
        <div class="health-notification-consent">
          <div class="health-notification-setting"><label>알림 시각</label><input type="hidden" id="healthNotificationTime" value="20:00"><button type="button" id="healthNotificationTimeButton" class="health-time-button" aria-label="알림 시각 선택"><span aria-hidden="true">🕐</span><strong id="healthNotificationTimeText">오후 8:00</strong></button></div>
          <div class="health-notification-consent-copy"><strong>예약 PWA 알림</strong><p id="healthNotificationStatus"></p></div>
          <div class="health-notification-actions"><button type="button" id="healthNotificationSaveTime" hidden>설정 저장</button><button type="button" id="healthNotificationToggle"></button></div>
          <div class="health-notification-schedule">
            <div class="health-notification-schedule-title"><span>알림 요일</span><button type="button" id="healthNotificationWeekdays">주말 제외</button></div>
            <div class="health-notification-days" aria-label="알림을 받을 요일">
              ${['일','월','화','수','목','금','토'].map((label, day) => `<label><input type="checkbox" name="healthNotificationDay" value="${day}" checked><span>${label}</span></label>`).join('')}
            </div>
            <label class="health-notification-skip"><input type="checkbox" id="healthNotificationSkipRecorded" checked><span>오늘 기록을 완료했다면 알림 생략</span></label>
          </div>
          <div class="health-notification-quick-actions" id="healthNotificationQuickActions" hidden><button type="button" id="healthNotificationTest">🔔 테스트 알림 보내기</button><button type="button" id="healthNotificationSnooze">30분 후 다시 알림</button><button type="button" id="healthNotificationDismiss">오늘은 그만 보기</button></div>
        </div>
        <p class="health-notification-note">의료적 진단이 아닌 기록 및 재측정 시기 안내입니다.</p>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeNotificationCenter(); });
    overlay.querySelector('.health-notification-close').addEventListener('click', closeNotificationCenter);
    overlay.querySelector('#healthNotificationToggle').addEventListener('click', () => HealthNotifications.toggle(Auth.getUser()));
    overlay.querySelector('#healthNotificationSaveTime').addEventListener('click', () => HealthNotifications.saveTime(Auth.getUser()));
    overlay.querySelector('#healthNotificationTimeButton').addEventListener('click', openHealthTimePicker);
    overlay.querySelector('#healthNotificationWeekdays').addEventListener('click', () => HealthNotifications.excludeWeekend(Auth.getUser()));
    overlay.querySelectorAll('[name="healthNotificationDay"]').forEach(input => input.addEventListener('change', () => { HealthNotifications.updateWeekendButton(); overlay.querySelector('#healthNotificationSaveTime').hidden = false; }));
    overlay.querySelector('#healthNotificationSkipRecorded').addEventListener('change', () => { overlay.querySelector('#healthNotificationSaveTime').hidden = false; });
    overlay.querySelector('#healthNotificationTest').addEventListener('click', event => {
      const button = event.currentTarget;
      button.disabled = true;
      HealthNotifications.testNotification().catch(error => showToast(error.message || '테스트 알림을 보내지 못했습니다.', 'error')).finally(() => { button.disabled = false; });
    });
    overlay.querySelector('#healthNotificationSnooze').addEventListener('click', () => HealthNotifications.action(Auth.getUser(), 'snooze-30').catch(error => showToast(error.message, 'error')));
    overlay.querySelector('#healthNotificationDismiss').addEventListener('click', () => HealthNotifications.action(Auth.getUser(), 'dismiss-today').catch(error => showToast(error.message, 'error')));
  }
  overlay.classList.add('open');
  HealthNotifications.renderList();
  HealthNotifications.updatePermissionUI(user);
  HealthNotifications.updateWeekendButton();
  overlay.querySelector('.health-notification-close').focus();
}

function closeNotificationCenter() {
  closeHealthTimePicker();
  document.getElementById('healthNotificationOverlay')?.classList.remove('open');
  document.getElementById('notificationBell')?.focus();
}

let healthTimePickerState = null;

function formatReminderClock(time) {
  const [hourText, minuteText] = String(time || '20:00').split(':');
  const hour24 = Math.min(23, Math.max(0, Number(hourText) || 0));
  const minute = Math.min(59, Math.max(0, Number(minuteText) || 0));
  const period = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 || 12;
  return `${period} ${hour12}:${String(minute).padStart(2, '0')}`;
}

function updateReminderTimeDisplay() {
  const input = document.getElementById('healthNotificationTime');
  const text = document.getElementById('healthNotificationTimeText');
  if (input && text) text.textContent = formatReminderClock(input.value);
}

function openHealthTimePicker() {
  const input = document.getElementById('healthNotificationTime');
  if (!input) return;
  const [hour, minute] = String(input.value || '20:00').split(':').map(Number);
  healthTimePickerState = { hour24: Number.isFinite(hour) ? hour : 20, minute: Number.isFinite(minute) ? minute : 0, mode: 'hour' };
  let overlay = document.getElementById('healthTimePickerOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'healthTimePickerOverlay';
    overlay.className = 'health-time-overlay';
    overlay.innerHTML = `<section class="health-time-picker" role="dialog" aria-modal="true" aria-labelledby="healthTimePickerTitle">
      <div class="health-time-heading"><div><h3 id="healthTimePickerTitle">알림 시각 선택</h3><p>시계판에서 시와 분을 선택하세요.</p></div><button type="button" class="health-time-close" aria-label="시각 선택 닫기">×</button></div>
      <div class="health-time-display"><div class="health-time-period"><button type="button" data-period="am">오전</button><button type="button" data-period="pm">오후</button></div><div class="health-time-value"><button type="button" data-mode="hour">08</button><span>:</span><button type="button" data-mode="minute">00</button></div></div>
      <div class="health-clock-face" id="healthClockFace"></div>
      <div class="health-time-actions"><button type="button" class="health-time-cancel">취소</button><button type="button" class="health-time-confirm">설정</button></div>
    </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeHealthTimePicker(); });
    overlay.querySelector('.health-time-close').addEventListener('click', closeHealthTimePicker);
    overlay.querySelector('.health-time-cancel').addEventListener('click', closeHealthTimePicker);
    overlay.querySelector('[data-period="am"]').addEventListener('click', () => setHealthTimePeriod('am'));
    overlay.querySelector('[data-period="pm"]').addEventListener('click', () => setHealthTimePeriod('pm'));
    overlay.querySelector('[data-mode="hour"]').addEventListener('click', () => { healthTimePickerState.mode = 'hour'; renderHealthClock(); });
    overlay.querySelector('[data-mode="minute"]').addEventListener('click', () => { healthTimePickerState.mode = 'minute'; renderHealthClock(); });
    overlay.querySelector('.health-time-confirm').addEventListener('click', confirmHealthTimePicker);
  }
  overlay.classList.add('open');
  renderHealthClock();
  overlay.querySelector('.health-time-close').focus();
}

function setHealthTimePeriod(period) {
  if (!healthTimePickerState) return;
  const hour12 = healthTimePickerState.hour24 % 12;
  healthTimePickerState.hour24 = hour12 + (period === 'pm' ? 12 : 0);
  renderHealthClock();
}

function renderHealthClock() {
  const overlay = document.getElementById('healthTimePickerOverlay');
  if (!overlay || !healthTimePickerState) return;
  const state = healthTimePickerState;
  const hour12 = state.hour24 % 12 || 12;
  overlay.querySelector('[data-period="am"]').classList.toggle('active', state.hour24 < 12);
  overlay.querySelector('[data-period="pm"]').classList.toggle('active', state.hour24 >= 12);
  const hourButton = overlay.querySelector('[data-mode="hour"]');
  const minuteButton = overlay.querySelector('[data-mode="minute"]');
  hourButton.textContent = String(hour12).padStart(2, '0');
  minuteButton.textContent = String(state.minute).padStart(2, '0');
  hourButton.classList.toggle('active', state.mode === 'hour');
  minuteButton.classList.toggle('active', state.mode === 'minute');
  const values = state.mode === 'hour' ? Array.from({ length: 12 }, (_, index) => index + 1) : Array.from({ length: 12 }, (_, index) => index * 5);
  const selected = state.mode === 'hour' ? hour12 : state.minute;
  const handAngle = state.mode === 'hour' ? (hour12 % 12) * 30 : state.minute * 6;
  const face = overlay.querySelector('#healthClockFace');
  face.innerHTML = `<span class="health-clock-center"></span><span class="health-clock-hand" style="transform:rotate(${handAngle}deg)"></span>${values.map((value, index) => `<button type="button" class="health-clock-number ${value === selected ? 'active' : ''}" style="--clock-angle:${index * 30}deg" data-value="${value}" aria-label="${state.mode === 'hour' ? `${value}시` : `${value}분`}"><span>${state.mode === 'minute' ? String(value).padStart(2, '0') : value}</span></button>`).join('')}`;
  face.querySelectorAll('.health-clock-number').forEach(button => button.addEventListener('click', () => selectHealthClockValue(Number(button.dataset.value))));
}

function selectHealthClockValue(value) {
  if (!healthTimePickerState) return;
  if (healthTimePickerState.mode === 'hour') {
    const isPm = healthTimePickerState.hour24 >= 12;
    healthTimePickerState.hour24 = (value % 12) + (isPm ? 12 : 0);
    healthTimePickerState.mode = 'minute';
  } else {
    healthTimePickerState.minute = value;
  }
  renderHealthClock();
}

function confirmHealthTimePicker() {
  if (!healthTimePickerState) return;
  const input = document.getElementById('healthNotificationTime');
  if (input) input.value = `${String(healthTimePickerState.hour24).padStart(2, '0')}:${String(healthTimePickerState.minute).padStart(2, '0')}`;
  updateReminderTimeDisplay();
  const saveButton = document.getElementById('healthNotificationSaveTime');
  if (saveButton) saveButton.hidden = false;
  closeHealthTimePicker();
}

function closeHealthTimePicker() {
  document.getElementById('healthTimePickerOverlay')?.classList.remove('open');
  healthTimePickerState = null;
}

function initializeHealthNotifications() {
  const user = Auth.getUser();
  if (!user || window.location.protocol === 'file:') return;
  setTimeout(async () => {
    await HealthNotifications.loadSchedule(user);
    await HealthNotifications.evaluate(user);
    if (HealthNotifications.shouldShowInitialPrompt(user.id)) {
      HealthNotifications.markInitialPromptSeen(user.id);
      openNotificationCenter();
    }
    if (!HealthNotifications.serverConfigured && 'Notification' in window && Notification.permission === 'granted' && HealthNotifications.matchesScheduleNow(user)) {
      HealthNotifications.deliver(user).catch(error => console.warn('[HealthNotifications]', error));
    }
  }, 1200);
  setInterval(async () => {
    if (HealthNotifications.serverConfigured || !HealthNotifications.isEnabled(user.id) || !HealthNotifications.matchesScheduleNow(user)) return;
    await HealthNotifications.evaluate(user);
    HealthNotifications.deliver(user).catch(error => console.warn('[HealthNotifications]', error));
  }, 30000);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeNotificationCenter();
  });
}

// ─── Nav Active Link ───────────────────────────────────
function setActiveNav() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === page);
  });
}

// ─── Render Nav User ───────────────────────────────────
function renderNavUser() {
  const user = Auth.getUser();
  const navRight = document.querySelector('.nav-right');
  if (!navRight || !user) return;

  // 인바디 메뉴 제어 (특별관리 대상자만 노출)
  const inbodyNav = document.querySelector('nav a[href="inbody.html"]')?.parentElement;
  if (inbodyNav) {
    inbodyNav.style.display = user.isSpecial ? 'block' : 'none';
  }

  // 기존 btn-logout 버튼들 제거 (흩어진 것들 정리)
  navRight.querySelectorAll('.btn-logout').forEach(btn => {
    // 관리자 페이지의 특별 필터 버튼(btnFilterSpecial)은 유지
    if (btn.id !== 'btnFilterSpecial') btn.remove();
  });

  // 기존 nav-user, nav-profile 제거 후 재생성
  navRight.querySelector('.nav-user')?.remove();
  navRight.querySelector('.nav-profile')?.remove();
  navRight.querySelector('.notification-bell')?.remove();

  const initial = (user.name || user.username || '?')[0].toUpperCase();
  const displayName = user.name || user.username || '사용자';

  // 관리자 전용 항목
  const adminItemHTML = (user.isAdmin === true) ? `
    <a href="admin.html" class="dropdown-item admin-item">
      <span class="di-icon">⚙️</span>
      관리자 패널
    </a>
    <div class="dropdown-divider"></div>
  ` : '';

  // 프로필 드롭다운 버튼 + 메뉴
  const profile = document.createElement('div');
  profile.className = 'nav-profile';
  profile.id = 'navProfile';
  profile.innerHTML = `
    <button class="nav-profile-btn" id="navProfileBtn" aria-haspopup="true" aria-expanded="false">
       <div class="nav-avatar" id="navAvatar">${escapeHtml(initial)}</div>
       <span class="nav-username" id="navUsername">${escapeHtml(displayName)}</span>
      <span class="profile-caret">▼</span>
    </button>
    <div class="nav-profile-dropdown" id="navProfileDropdown">
      <div class="dropdown-user-header">
        <div class="dropdown-user-name">${escapeHtml(displayName)}</div>
        <div class="dropdown-user-sub">${escapeHtml(user.username || '')}</div>
      </div>
      ${adminItemHTML}
      <button class="dropdown-item logout-item" onclick="Auth.logout()">
        <span class="di-icon">🚪</span>
        로그아웃
      </button>
      <button class="dropdown-item danger-item" onclick="Auth.deleteAccount()">
        <span class="di-icon">🗑️</span>
        계정 탈퇴
      </button>
    </div>
  `;

  const notificationButton = document.createElement('button');
  notificationButton.type = 'button';
  notificationButton.className = 'notification-bell';
  notificationButton.id = 'notificationBell';
  notificationButton.setAttribute('aria-label', '건강 알림 열기');
  notificationButton.innerHTML = '<span aria-hidden="true">🔔</span><span class="notification-count" id="notificationCount" hidden>0</span>';
  notificationButton.addEventListener('click', openNotificationCenter);
  navRight.append(notificationButton, profile);

  // 클릭으로 드롭다운 토글
  const profileBtn = profile.querySelector('#navProfileBtn');
  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = profile.classList.toggle('open');
    profileBtn.setAttribute('aria-expanded', isOpen);
  });

  // 외부 클릭 시 닫기
  document.addEventListener('click', () => {
    profile.classList.remove('open');
    profileBtn.setAttribute('aria-expanded', 'false');
  });

  // 드롭다운 자체 클릭은 전파 방지
  profile.querySelector('#navProfileDropdown').addEventListener('click', e => e.stopPropagation());
}



// ─── Render Footer ─────────────────────────────────────
function renderFooter() {
  // 이미 푸터가 존재하면 중복 생성 방지
  if (document.querySelector('.app-footer')) return;

  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML = `
    <div class="footer-content footer-compact">
      <span>운영 · 의료법인 온길의료재단</span>
      <div class="footer-links">
        <a href="terms.html" class="footer-link">이용약관</a>
        <a href="privacy.html" class="footer-link privacy">개인정보처리방침</a>
      </div>
    </div>
  `;
  document.body.appendChild(footer);
}

// ─── Stars ─────────────────────────────────────────────
function renderStars(rating, max = 5) {
  let html = '';
  for (let i = 1; i <= max; i++) {
    html += i <= rating ? '⭐' : '☆';
  }
  return html;
}

function cleanupLegacyAdminAccount() {
  const current = Auth.getUser();
  if (!current) return;

  // 1. 구형 관리자 ID 기반 계정 삭제
  if (current.id === 'admin_snh078800' || current.username === 'snh078800') {
    localStorage.removeItem(KEYS.CURRENT_USER);
    return;
  }
}

// ─── DOM Ready Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  cleanupLegacyAdminAccount();
  setActiveNav();
  renderNavUser();
  renderMobileNav();
  renderFooter();
  initializePwa();
  initializeHealthNotifications();
});

let deferredInstallPrompt = null;

function initializePwa() {
  if (!window.location.protocol.startsWith('http') || !('serviceWorker' in navigator)) return;
  renderInstallButton();
  navigator.serviceWorker.register('/service-worker.js').then(registration => {
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) renderAppUpdateButton();
      });
    });
  }).catch(error => console.warn('[PWA]', error));
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    document.getElementById('pwaInstallButton')?.remove();
    closeInstallGuide();
    showToast('건강지킴이가 홈 화면에 설치되었습니다.', 'success');
  });
  window.addEventListener('online', async () => {
    const user = Auth.getUser();
    if (!user) return;
    const count = await Records.syncPending(user.id);
    if (count) showToast(`오프라인 기록 ${count}건을 서버와 동기화했습니다.`, 'success');
  });
}

function renderAppUpdateButton() {
  if (document.getElementById('pwaUpdateButton')) return;
  const button = document.createElement('button');
  button.id = 'pwaUpdateButton';
  button.type = 'button';
  button.textContent = '새 버전이 준비됐습니다 · 새로고침';
  button.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:1801;border:0;border-radius:100px;background:var(--text);color:#fff;padding:11px 16px;box-shadow:0 8px 24px rgba(0,0,0,.18);font-family:inherit;font-size:.78rem;font-weight:750;white-space:nowrap;cursor:pointer';
  button.addEventListener('click', () => window.location.reload());
  document.body.appendChild(button);
}

function renderInstallButton() {
  if (isPwaInstalled() || document.getElementById('pwaInstallButton')) return;
  const button = document.createElement('button');
  button.id = 'pwaInstallButton';
  button.type = 'button';
  button.className = 'pwa-install-button';
  button.addEventListener('click', requestPwaInstall);
  document.body.appendChild(button);
  updateInstallButton();
}

function isPwaInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getInstallEnvironment() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const samsung = /SamsungBrowser/i.test(ua);
  const edge = /EdgA|EdgiOS|Edg\//i.test(ua);
  const firefox = /Firefox|FxiOS/i.test(ua);
  const chrome = /Chrome|CriOS/i.test(ua) && !edge && !samsung;
  const safari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
  const inApp = /NAVER|KAKAOTALK|Instagram|FBAN|FBAV|Line\//i.test(ua);
  return { ios, android, samsung, edge, firefox, chrome, safari, inApp };
}

function updateInstallButton() {
  const button = document.getElementById('pwaInstallButton');
  if (!button) return;
  const env = getInstallEnvironment();
  button.textContent = deferredInstallPrompt
    ? '📱 건강지킴이 설치'
    : (env.ios ? '📱 아이폰 설치 방법' : '📱 앱 설치 안내');
}

async function requestPwaInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice.outcome === 'accepted') document.getElementById('pwaInstallButton')?.remove();
    else updateInstallButton();
    return;
  }
  openInstallGuide();
}

function installGuideContent() {
  const env = getInstallEnvironment();
  if (isPwaInstalled()) return { title: '이미 설치되어 있습니다', intro: '홈 화면의 건강지킴이 아이콘으로 실행할 수 있습니다.', steps: [] };
  if (env.ios) {
    return env.safari
      ? { title: 'iPhone·iPad에 설치', intro: 'Apple 정책상 설치 버튼을 대신 누를 수 없어 Safari 메뉴에서 직접 추가해야 합니다.', steps: ['Safari 하단 또는 상단의 공유 버튼을 누르세요.', '메뉴에서 ‘홈 화면에 추가’를 선택하세요.', '‘웹 앱으로 열기’를 켜고 ‘추가’를 누르세요.'] }
      : { title: 'Safari에서 설치해 주세요', intro: 'iPhone의 Chrome·Edge 등에서는 설치 창을 직접 열 수 없습니다.', steps: ['현재 주소를 복사해 Safari에서 여세요.', 'Safari의 공유 버튼을 누르세요.', '‘홈 화면에 추가’ → ‘웹 앱으로 열기’ → ‘추가’를 선택하세요.'] };
  }
  if (env.android && env.inApp) return { title: '외부 브라우저에서 설치', intro: '현재 앱 안의 브라우저에서는 설치 기능이 제한될 수 있습니다.', steps: ['브라우저 메뉴에서 ‘외부 브라우저로 열기’를 선택하세요.', 'Chrome 또는 Samsung Internet에서 페이지를 여세요.', '브라우저 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.'] };
  if (env.android) {
    const browser = env.samsung ? 'Samsung Internet' : env.edge ? 'Edge' : env.firefox ? 'Firefox' : env.chrome ? 'Chrome' : '현재 브라우저';
    return { title: `${browser}에서 설치`, intro: '자동 설치 창을 지원하지 않거나 아직 설치 조건을 확인 중입니다.', steps: ['브라우저 오른쪽 위의 메뉴(⋮)를 누르세요.', '‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.', '화면에 표시되는 설치 확인을 누르세요.'] };
  }
  return { title: '컴퓨터에 앱으로 설치', intro: 'Chrome 또는 Edge에서 앱처럼 별도 창으로 설치할 수 있습니다.', steps: ['주소창 오른쪽의 설치 아이콘을 누르세요.', '아이콘이 없다면 브라우저 메뉴에서 ‘앱 설치’를 선택하세요.', '설치 확인 창에서 ‘설치’를 누르세요.'] };
}

function openInstallGuide() {
  let overlay = document.getElementById('pwaInstallOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pwaInstallOverlay';
    overlay.className = 'pwa-install-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeInstallGuide(); });
  }
  const guide = installGuideContent();
  overlay.innerHTML = `<section class="pwa-install-panel" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
    <div class="pwa-install-heading"><div class="pwa-install-icon"><img src="images/app-icon-192.png" alt=""></div><div><h2 id="pwaInstallTitle">${escapeHtml(guide.title)}</h2><p>${escapeHtml(guide.intro)}</p></div><button type="button" class="pwa-install-close" aria-label="설치 안내 닫기">×</button></div>
    ${guide.steps.length ? `<ol class="pwa-install-steps">${guide.steps.map((step, index) => `<li><span>${index + 1}</span><p>${escapeHtml(step)}</p></li>`).join('')}</ol>` : ''}
    <div class="pwa-install-benefits"><span>✓ 홈 화면에서 바로 실행</span><span>✓ 앱처럼 전체 화면 사용</span><span>✓ 동의한 경우 예약 알림 제공</span></div>
    <button type="button" class="pwa-install-done">확인</button>
  </section>`;
  overlay.querySelector('.pwa-install-close').addEventListener('click', closeInstallGuide);
  overlay.querySelector('.pwa-install-done').addEventListener('click', closeInstallGuide);
  overlay.classList.add('open');
  overlay.querySelector('.pwa-install-close').focus();
}

function closeInstallGuide() {
  document.getElementById('pwaInstallOverlay')?.classList.remove('open');
  document.getElementById('pwaInstallButton')?.focus();
}

// ─── 모바일 햄버거 드로어 메뉴 ──────────────────────────
function renderMobileNav() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const noDrawerPages = ['index.html', 'seed-data.html', ''];
  if (noDrawerPages.includes(page)) return;

  const user = Auth.getUser();
  if (!user) return;

  // ① 햄버거 버튼을 상단 네비 오른쪽 끝에 추가
  const navRight = document.querySelector('.nav-right');
  if (navRight) {
    const hamburger = document.createElement('button');
    hamburger.className = 'nav-hamburger';
    hamburger.setAttribute('aria-label', '메뉴 열기');
    hamburger.innerHTML = '☰';
    hamburger.onclick = openDrawer;
    navRight.appendChild(hamburger);
  }

  // ② 현재 페이지 판별
  const isActive = (href) => page === href ? 'active' : '';

  // ③ 메뉴 항목 구성 (사용자 메뉴)
  const navItems = [
    { href: 'dashboard.html', icon: '📊', label: '대시보드' },
    { href: 'monthly.html',   icon: '📆', label: '월별 분석' },
    { href: 'record.html',    icon: '✏️', label: '기록하기' },
    { href: 'history.html',   icon: '📋', label: '기록 목록' },
  ];
  if (user.isSpecial) {
    navItems.push({ href: 'inbody.html', icon: '💪', label: '인바디(BWA)' });
  }

  const navHTML = navItems.map(item => `
    <a href="${item.href}" class="drawer-nav-item ${isActive(item.href)}">
      <span class="drawer-item-icon">${item.icon}</span>
      <span class="drawer-item-label">${item.label}</span>
    </a>
  `).join('');

  // ④ 관리자 섹션 (관리자 계정만)
  let adminHTML = '';
  if (user.isAdmin === true) {
    const adminItems = [
      { href: 'admin.html', icon: '🏃', label: '일반 지표' },
      { href: 'admin-inbody-ranking.html', icon: '💪', label: '체성분 관리' },
      { href: 'admin-users.html', icon: '👥', label: '사용자 관리' },
    ];
    adminHTML = `
      <div class="drawer-divider"></div>
      <div class="drawer-section-label">관리자 메뉴</div>
      ${adminItems.map(item => `
        <a href="${item.href}" class="drawer-nav-item ${isActive(item.href)}">
          <span class="drawer-item-icon">${item.icon}</span>
          <span class="drawer-item-label">${item.label}</span>
        </a>
      `).join('')}
    `;
  }

  // ⑤ 유저 아바타 이니셜
  const initial = (user.name || user.username || '?')[0].toUpperCase();

  // ⑥ 드로어 HTML 생성
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.id = 'drawerOverlay';
  overlay.onclick = closeDrawer;

  const drawer = document.createElement('nav');
  drawer.className = 'nav-drawer';
  drawer.id = 'navDrawer';
  drawer.setAttribute('aria-label', '사이드 메뉴');
  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-avatar">${escapeHtml(initial)}</div>
      <div class="drawer-user-info">
        <div class="drawer-user-name">${escapeHtml(user.name || user.username || '사용자')}</div>
        <div class="drawer-user-sub">${escapeHtml(user.username || '')}</div>
      </div>
      <button class="drawer-close-btn" onclick="closeDrawer()" aria-label="메뉴 닫기">✕</button>
    </div>

    <div class="drawer-body">
      <div class="drawer-section-label">메뉴</div>
      ${navHTML}
      ${adminHTML}
      <div class="drawer-divider"></div>
      <div class="drawer-section-label">운영 · 의료법인 온길의료재단</div>
      <a href="terms.html" class="drawer-nav-item">이용약관</a>
      <a href="privacy.html" class="drawer-nav-item">개인정보처리방침</a>

      <div class="drawer-divider"></div>
      <div class="drawer-section-label">계정</div>

      <button class="drawer-nav-item logout-item" onclick="Auth.logout()">
        <span class="drawer-item-icon">🚪</span>
        <span class="drawer-item-label">로그아웃</span>
      </button>

      <button class="drawer-nav-item danger" onclick="confirmDeleteAccount()">
        <span class="drawer-item-icon">🗑️</span>
        <span class="drawer-item-label">계정 탈퇴</span>
      </button>
    </div>


  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
}

function openDrawer() {
  const overlay = document.getElementById('drawerOverlay');
  const drawer  = document.getElementById('navDrawer');
  if (!overlay || !drawer) return;
  overlay.classList.add('open');
  drawer.classList.add('open');
  document.body.style.overflow = 'hidden'; // 배경 스크롤 방지
}

function closeDrawer() {
  const overlay = document.getElementById('drawerOverlay');
  const drawer  = document.getElementById('navDrawer');
  if (!overlay || !drawer) return;
  overlay.classList.remove('open');
  drawer.classList.remove('open');
  document.body.style.overflow = '';
}

function confirmDeleteAccount() {
  closeDrawer();
  // 기존 계정탈퇴 confirm 로직 재사용
  if (typeof Auth !== 'undefined' && typeof Auth.deleteAccount === 'function') {
    Auth.deleteAccount();
  }
}

// ESC 키로 드로어 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});
