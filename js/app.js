/* ===================================================
   app.js — Common Utilities & Data Layer
   건강지킴이
   =================================================== */

const APP_NAME = 'HealthGuardian';

// ─── Storage Keys ────────────────────────────────────
const KEYS = {
  RECORDS: `${APP_NAME}_records`,
  USERS: `${APP_NAME}_users`,
  CURRENT_USER: `${APP_NAME}_currentUser`,
  GOALS: `${APP_NAME}_goals`,
};

// ─── Auth ─────────────────────────────────────────────
const Auth = {
  getUser() {
    const raw = localStorage.getItem(KEYS.CURRENT_USER);
    return raw ? JSON.parse(raw) : null;
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

  register(name, username, password) {
    const users = this.getUsers();
    if (users.find(u => u.username === username)) {
      return { ok: false, msg: '이미 존재하는 아이디입니다.' };
    }
    const user = { id: genId(), name, username, password, createdAt: new Date().toISOString() };
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
    window.location.href = 'index.html';
  },

  require() {
    const user = this.getUser();
    if (!user) {
      window.location.href = 'index.html';
      return null;
    }
    // 관리자 계정이 일반 페이지 접근 시 대시보드로 리다이렉트
    if (user.isAdmin) {
      window.location.href = 'admin.html';
      return null;
    }
    return user;
  },

  requireAdmin() {
    const user = this.getUser();
    if (!user) { window.location.href = 'index.html'; return null; }
    if (!user.isAdmin) { window.location.href = 'dashboard.html'; return null; }
    return user;
  },

  isAdmin() {
    const user = this.getUser();
    return !!(user && user.isAdmin);
  },

  seedAdmin() {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.username === 'snh07800');
    if (idx === -1) {
      // 쫬침 생성
      users.push({
        id: 'admin_snh07800',
        name: '관리자',
        username: 'snh07800',
        password: 'hh7440123',
        isAdmin: true,
        createdAt: new Date().toISOString(),
      });
    } else {
      // 이미 있는 계정 → 관리자 권한 강제 적용
      users[idx].isAdmin  = true;
      users[idx].password = 'hh7440123';
      users[idx].id       = 'admin_snh07800';
      users[idx].name     = '관리자';
    }
    this.saveUsers(users);
  },
};

// ─── Records ──────────────────────────────────────────
const Records = {
  getAll() {
    const raw = localStorage.getItem(KEYS.RECORDS);
    return raw ? JSON.parse(raw) : [];
  },

  getUserRecords(userId) {
    return this.getAll().filter(r => r.userId === userId);
  },

  save(record) {
    const all = this.getAll();
    const idx = all.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
    } else {
      all.push(record);
    }
    localStorage.setItem(KEYS.RECORDS, JSON.stringify(all));
  },

  delete(id) {
    const all = this.getAll().filter(r => r.id !== id);
    localStorage.setItem(KEYS.RECORDS, JSON.stringify(all));
  },

  getById(id) {
    return this.getAll().find(r => r.id === id);
  },

  getByDate(userId, date) {
    return this.getUserRecords(userId).find(r => r.date === date);
  },
};

// ─── Goals ────────────────────────────────────────────
const GoalDefaults = {
  walking: 30,
  running: 20,
  squats: 50,
  pushups: 30,
  situps: 30,
  water: 2000,
  fasting: 12,
  weight: 0,
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
  // toISOString()은 UTC 기준이므로 한국(UTC+9) 등에서 날짜가 틀릴 수 있음
  // 로컬 날짜를 직접 포맷
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

// ─── Streak Calc ──────────────────────────────────────
function calcStreak(records) {
  if (!records.length) return 0;

  const todayStr     = today();
  const yesterdayStr = prevDay(todayStr);

  // 미래 날짜 제외 후 Set 생성 (O(1) 조회)
  const dateSet = new Set(
    records.map(r => r.date).filter(d => d <= todayStr)
  );
  if (!dateSet.size) return 0;

  // 시작점 결정:
  //   오늘 기록 있음  → 오늘부터 거슬러 올라감
  //   오늘 기록 없음  → 어제부터 거슬러 올라감 (오늘 하루가 아직 진행 중)
  const startDate = dateSet.has(todayStr) ? todayStr : yesterdayStr;

  // 시작점에도 기록이 없으면 스트릭 없음
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
  const d = new Date(dateStr + 'T00:00:00'); // 로컬 자정
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
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    result.push(`${yyyy}-${mm}-${dd}`);
  }
  return result;
}

// 로컬 날짜 문자열 반환 헬퍼 (toISOString 대신 사용)
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

// 이번 주 월요일~일요일 날짜 배열 반환 (한 주 시작: 월요일)
function getCurrentWeekDays() {
  const todayDate = new Date();
  const dow = todayDate.getDay(); // 0=일, 1=월 ... 6=토
  // 월요일까지 거슬러 올라가는 일수 (일요일이면 6일 전이 월요일)
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(todayDate);
  monday.setDate(todayDate.getDate() - diffToMonday);

  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    result.push(localDateStr(d));
  }
  return result; // [월, 화, 수, 목, 금, 토, 일]
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
  toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOutToast 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
  const el = document.getElementById('navUsername');
  const avatar = document.getElementById('navAvatar');
  if (el && user) el.textContent = user.name;
  if (avatar && user) avatar.textContent = user.name.charAt(0).toUpperCase();
}

// ─── Stars ─────────────────────────────────────────────
function renderStars(rating, max = 5) {
  let html = '';
  for (let i = 1; i <= max; i++) {
    html += i <= rating ? '⭐' : '☆';
  }
  return html;
}

// ─── DOM Ready Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Auth.seedAdmin(); // 관리자 계정 자동 생성
  setActiveNav();
  renderNavUser();
});
