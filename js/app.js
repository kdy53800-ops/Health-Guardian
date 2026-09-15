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
  NOTIFICATION_SEEN: `${APP_NAME}_notificationSeen`,
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
      return user;
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
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
    localStorage.removeItem(KEYS.NOTIFICATION_SEEN + '_' + user.id);
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

  preferenceKey(userId) {
    return `${KEYS.NOTIFICATION_PREFS}_${userId}`;
  },

  isEnabled(userId) {
    return localStorage.getItem(this.preferenceKey(userId)) === 'enabled';
  },

  setEnabled(userId, enabled) {
    localStorage.setItem(this.preferenceKey(userId), enabled ? 'enabled' : 'disabled');
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
    if (!status || !button) return;
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    const enabled = supported && this.isEnabled(user.id) && Notification.permission === 'granted';
    if (!supported) {
      status.textContent = '이 브라우저에서는 PWA 알림을 지원하지 않습니다.';
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.textContent = enabled ? 'PWA 알림 끄기' : 'PWA 알림 받기';
    button.classList.toggle('enabled', enabled);
    status.textContent = Notification.permission === 'denied'
      ? '브라우저에서 알림이 차단되어 있습니다. 브라우저 설정에서 허용할 수 있습니다.'
      : (enabled ? '이 기기에서 하루 한 번 필요한 알림만 알려드립니다.' : '버튼을 눌러 동의한 경우에만 알림을 보냅니다.');
  },

  async toggle(user) {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    const enabled = this.isEnabled(user.id) && Notification.permission === 'granted';
    if (enabled) {
      this.setEnabled(user.id, false);
      this.updatePermissionUI(user);
      showToast('PWA 건강 알림을 껐습니다.', 'default');
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      this.setEnabled(user.id, false);
      this.updatePermissionUI(user);
      showToast('알림 권한이 허용되지 않았습니다.', 'default');
      return;
    }
    this.setEnabled(user.id, true);
    this.updatePermissionUI(user);
    await this.deliver(user, true);
    showToast('PWA 건강 알림을 켰습니다.', 'success');
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
    });
    localStorage.setItem(seenKey, signature);
  },
};

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
        <div class="health-notification-consent"><div><strong>PWA 알림</strong><p id="healthNotificationStatus"></p></div><button type="button" id="healthNotificationToggle"></button></div>
        <p class="health-notification-note">의료적 진단이 아닌 기록 및 재측정 시기 안내입니다.</p>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeNotificationCenter(); });
    overlay.querySelector('.health-notification-close').addEventListener('click', closeNotificationCenter);
    overlay.querySelector('#healthNotificationToggle').addEventListener('click', () => HealthNotifications.toggle(Auth.getUser()));
  }
  overlay.classList.add('open');
  HealthNotifications.renderList();
  HealthNotifications.updatePermissionUI(user);
  overlay.querySelector('.health-notification-close').focus();
}

function closeNotificationCenter() {
  document.getElementById('healthNotificationOverlay')?.classList.remove('open');
  document.getElementById('notificationBell')?.focus();
}

function initializeHealthNotifications() {
  const user = Auth.getUser();
  if (!user || window.location.protocol === 'file:') return;
  setTimeout(async () => {
    await HealthNotifications.evaluate(user);
    if ('Notification' in window && Notification.permission === 'granted') {
      HealthNotifications.deliver(user).catch(error => console.warn('[HealthNotifications]', error));
    }
  }, 1200);
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
    <div class="nav-profile-dropdown" id="navProfileDropdown" role="menu">
      <div class="dropdown-user-header">
        <div class="dropdown-user-name">${escapeHtml(displayName)}</div>
        <div class="dropdown-user-sub">${escapeHtml(user.username || '')}</div>
      </div>
      ${adminItemHTML}
      <button class="dropdown-item logout-item" onclick="Auth.logout()" role="menuitem">
        <span class="di-icon">🚪</span>
        로그아웃
      </button>
      <button class="dropdown-item danger-item" onclick="Auth.deleteAccount()" role="menuitem">
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
    <div class="footer-content">
      <img class="hospital-wordmark footer-hospital-wordmark" src="images/ongil-hospital.png" alt="의료법인 온길의료재단 해운대 나눔과행복병원" width="1942" height="274" loading="lazy">
      <div class="footer-links">
        <a href="terms.html" class="footer-link">이용약관</a>
        <a href="privacy.html" class="footer-link privacy">개인정보처리방침</a>
      </div>
      <div class="footer-info-grid">
        <div class="footer-info-item">
          <span class="footer-info-label">등록번호</span>
          <span class="footer-info-val">580-82-00671</span>
        </div>
        <div class="footer-info-item">
          <span class="footer-info-label">법인명</span>
          <span class="footer-info-val">의료법인 온길의료재단</span>
        </div>
        <div class="footer-info-item">
          <span class="footer-info-label">대표자</span>
          <span class="footer-info-val">백선미</span>
        </div>
        <div class="footer-info-item">
          <span class="footer-info-label">주소</span>
          <span class="footer-info-val">부산광역시 해운대구 좌동순환로 502, 3~9층(중동)</span>
        </div>
        <div class="footer-info-item">
          <span class="footer-info-label">업태/종목</span>
          <span class="footer-info-val">보건업 / 일반병원</span>
        </div>
      </div>
      <div class="footer-copyright">
        &copy; 2026 의료법인 온길의료재단. All rights reserved.
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
    renderInstallButton();
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
  if (document.getElementById('pwaInstallButton')) return;
  const button = document.createElement('button');
  button.id = 'pwaInstallButton';
  button.type = 'button';
  button.textContent = '📱 홈 화면에 설치';
  button.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:1800;border:1px solid var(--border);border-radius:100px;background:#fff;color:var(--primary);padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.12);font-family:inherit;font-size:.8rem;font-weight:700;cursor:pointer';
  button.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    button.remove();
  });
  document.body.appendChild(button);
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
