/* ===================================================
   app.js — Common Utilities & Data Layer
   건강지킴이
   =================================================== */

const APP_NAME = 'HealthGuardian';

// ─── Storage Keys ────────────────────────────────────
const KEYS = {
  RECORDS: `${APP_NAME}_records`,
  USERS: `${APP_NAME}_users`,
  CURRENT_USER: `${APP_NAME}_userSession_v2`,
  GOALS: `${APP_NAME}_goals`,
  RECORDS_MIGRATED: `${APP_NAME}_recordsMigrated`,
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
    const user = this.getUser();
    localStorage.removeItem(KEYS.CURRENT_USER);

    if (user && user.authProvider === 'naver') {
      fetch(new URL('api/logout', window.location.href).toString(), {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
      }).catch(() => {});
      localStorage.removeItem(KEYS.CURRENT_USER);
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
    localStorage.removeItem(KEYS.GOALS + '_' + user.id);
    localStorage.removeItem(KEYS.RECORDS_MIGRATED + '_' + user.id);
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
    writeLocalRecords([...all, ...records]);
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

      return records;
    } catch (error) {
      console.warn('[Records] Falling back to local records:', error);
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

    const { response, payload } = await this.saveRemote(record);
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
      <div class="nav-avatar" id="navAvatar">${initial}</div>
      <span class="nav-username" id="navUsername">${displayName}</span>
      <span class="profile-caret">▼</span>
    </button>
    <div class="nav-profile-dropdown" id="navProfileDropdown" role="menu">
      <div class="dropdown-user-header">
        <div class="dropdown-user-name">${displayName}</div>
        <div class="dropdown-user-sub">건강지킴이 멤버</div>
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

  navRight.appendChild(profile);

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
          <span class="footer-info-val">의료법인 나눔과행복의료재단</span>
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
        &copy; 2026 의료법인 나눔과행복의료재단. All rights reserved.
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
});

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
      <div class="drawer-avatar">${initial}</div>
      <div class="drawer-user-info">
        <div class="drawer-user-name">${user.name || user.username || '사용자'}</div>
        <div class="drawer-user-sub">건강지킴이 멤버</div>
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
