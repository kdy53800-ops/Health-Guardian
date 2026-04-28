/* ===================================================
   admin.js - Admin Dashboard Logic (Operator Only)
   =================================================== */

let rankMode = 'streak';
let deleteTargetId = null;
let allUsers = [];
let allRecords = [];
let fetchedUsers = [];
let fetchedRecords = [];
let filterSpecialOnly = false;
let filterGender = 'all';
let filterAge = 'all';
let filterMonth = '';

const RANK_CONFIGS = [
  { key: 'streak', label: '🔥 연속 기록', desc: '연속 기록 일수' },
  { key: 'records', label: '📋 총 기록수', desc: '전체 기록 건수' },
  { key: 'walking', label: '🚶 걷기', desc: '총 걷기 (분)' },
  { key: 'running', label: '🏃 러닝', desc: '총 러닝 (분)' },
  { key: 'strength', label: '💪 근력', desc: '총 근력 운동 (회)' },
  { key: 'water', label: '💧 수분', desc: '총 수분 (ml)' },
];

function getOverlayElements() {
  return {
    overlay: document.getElementById('adminLoginOverlay'),
    logo: document.querySelector('.admin-login-logo p'),
    errEl: document.getElementById('adminErr'),
    form: document.querySelector('#adminLoginOverlay form'),
  };
}

function showAdminAccessOverlay(message) {
  const { overlay, logo, errEl, form } = getOverlayElements();
  if (!overlay) return;

  overlay.style.display = 'flex';
  if (logo) {
    logo.textContent = '관리자 인증이 필요한 서비스입니다.';
  }
  if (errEl) {
    errEl.textContent = message || '관리자 권한이 필요합니다.';
    errEl.classList.add('show');
  }
  if (form) {
    form.style.display = 'none';
  }
}

function hideAdminAccessOverlay() {
  const { overlay, errEl } = getOverlayElements();
  if (errEl) errEl.classList.remove('show');
  if (overlay) overlay.style.display = 'none';
}

function canTryAdminApi() {
  const user = Auth.getUser();
  if (user && user.authProvider === 'test' && user.isAdmin) {
    return true; // 테스트 관리자 허용
  }
  return !!(
    user
    && user.authProvider === 'naver'
    && user.supabaseUserId
  );
}

async function readApiJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function fetchAdminData() {
  try {
    const response = await fetch(new URL('api/admin-data', window.location.href).toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const payload = await readApiJson(response);
    if (!response.ok || !payload || !payload.ok) {
      const error = new Error((payload && payload.message) || '데이터 조회 권한이 없습니다.');
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (err) {
    // 로컬 환경(file://) 등 API 서버가 없을 때 테스트 계정용 가짜 데이터 반환
    if (window.location.protocol === 'file:' || err.message.includes('Failed to fetch')) {
      const mockUsers = [
        { id: 'u1', name: '김건강', username: 'health_k', email: 'kim@example.com', phone: '01087654321', gender: 'M', birthyear: '1990', isSpecial: true, createdAt: new Date().toISOString() },
        { id: 'u2', name: '이튼튼', username: 'strong_lee', email: 'lee@example.com', phone: '01011112222', gender: 'M', birthyear: '1992', isSpecial: false, createdAt: new Date().toISOString() },
        { id: 'u3', name: '박파워', username: 'power_p', email: 'park@example.com', phone: '01033334444', gender: 'M', birthyear: '1988', isSpecial: true, createdAt: new Date().toISOString() },
        { id: 'u4', name: '최활력', username: 'vital_c', email: 'choi@example.com', phone: '01055556666', gender: 'F', birthyear: '1995', isSpecial: false, createdAt: new Date().toISOString() },
        { id: 'u5', name: '정성장', username: 'growth_j', email: 'jung@example.com', phone: '01012345678', gender: 'F', birthyear: '1995', isSpecial: true, createdAt: new Date().toISOString() }
      ];
      
      let customSpecials = JSON.parse(sessionStorage.getItem('customSpecials') || '{}');
      mockUsers.forEach(u => {
        if (customSpecials[u.id] !== undefined) u.isSpecial = customSpecials[u.id];
      });
      
      let mockRecords = JSON.parse(sessionStorage.getItem('sharedMockRecords'));
      if (!mockRecords) {
        mockRecords = [];
        const today = new Date();
        mockUsers.forEach((u, i) => {
          let baseExercise = 20 + (i * 5); 
          let growthRate = 0.5 + (i * 0.2); 
          for (let d = 60; d >= 0; d--) {
            if (Math.random() > 0.2) {
              const date = new Date();
              date.setDate(today.getDate() - d);
              const currentExercise = Math.round(baseExercise + ((60 - d) * growthRate) + (Math.random() * 10 - 5));
              mockRecords.push({
                id: `rec_${u.id}_${d}`,
                userId: u.id,
                date: date.toISOString().split('T')[0],
                walking: currentExercise,
                running: currentExercise > 40 ? currentExercise - 20 : 0,
                squats: Math.round(currentExercise * 0.8),
                pushups: Math.round(currentExercise * 0.5),
                situps: Math.round(currentExercise * 0.5),
                water: Math.round(Math.random() * 1000 + 1000),
                condition: Math.floor(Math.random() * 3) + 3
              });
            }
          }
        });
        sessionStorage.setItem('sharedMockRecords', JSON.stringify(mockRecords));
      }
      
      return { ok: true, users: mockUsers, records: mockRecords };
    }
    throw err;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.SupabaseAuth) {
    await SupabaseAuth.handleIndexSession();
  }

  if (!canTryAdminApi()) {
    alert('관리자 인증이 필요합니다. 먼저 네이버로 로그인해 주세요.');
    window.location.href = 'index.html';
    return;
  }

  try {
    await enterAdmin();
  } catch (error) {
    const status = Number(error && error.status);
    if (status === 401 || status === 403) {
      alert('접근 권한이 없습니다. 관리자 계정으로 로그인해 주세요.');
      window.location.href = 'index.html';
      return;
    }
    alert(error.message || '관리자 데이터를 불러오는 중 오류가 발생했습니다.');
    window.location.href = 'index.html';
  }
});

function handleAdminLogin(e) {
  if (e) e.preventDefault();
  window.location.href = 'index.html';
}

function adminLogout() {
  Auth.logout();
}

async function enterAdmin() {
  const user = Auth.getUser();
  if (user) {
    const el = document.getElementById('navUsername');
    const av = document.getElementById('navAvatar');
    if (el) el.textContent = user.name || '관리자';
    if (av) av.textContent = (user.name || 'A').charAt(0).toUpperCase();
  }

  const payload = await fetchAdminData();
  fetchedUsers = Array.isArray(payload.users) ? payload.users : [];
  fetchedRecords = Array.isArray(payload.records) ? payload.records : [];
  applyFilter();
  syncFilterUI();

  hideAdminAccessOverlay();
  renderAll();
}


function renderAll() {
  const page = location.pathname.split('/').pop() || 'admin.html';

  if (page === 'admin-ranking.html') {
    renderRankTabs();
    renderRanking();
    return;
  }
  if (page === 'admin-users.html') {
    renderUserMgmt();
    return;
  }

  renderPlatformStats();
  renderCharts();
}

function renderPlatformStats() {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  const weekStr = weekAgo.toISOString().split('T')[0];

  const totalUsers = allUsers.length;
  const totalRecords = allRecords.length;
  const activeUsers = new Set(allRecords.filter(record => record.date >= weekStr).map(record => record.userId)).size;
  const totalExMins = allRecords.reduce((sum, record) => sum + (record.walking || 0) + (record.running || 0), 0);

  const stats = [
    { icon: '👥', label: '전체 사용자', val: totalUsers, sub: '가입된 계정', cls: 'blue' },
    { icon: '📋', label: '전체 기록수', val: totalRecords, sub: '누적 기록', cls: 'green' },
    { icon: '✅', label: '이번 주 활성', val: activeUsers, sub: '7일 내 기록', cls: 'gold' },
    { icon: '⏱️', label: '총 운동 시간', val: totalExMins, sub: '분 (걷기+러닝)', cls: 'purple' },
  ];

  const el = document.getElementById('platformStats');
  if (!el) return;
  el.innerHTML = stats.map(item => `
    <div class="p-stat ${item.cls}">
      <div class="p-stat-icon">${item.icon}</div>
      <div class="p-stat-label">${item.label}</div>
      <div class="p-stat-value">${item.val.toLocaleString()}</div>
      <div class="p-stat-sub">${item.sub}</div>
    </div>
  `).join('');
}

let chartDaily = null;
let chartShare = null;
let chartExerciseAvg = null;

function renderCharts() {
  renderDailyChart();
  renderShareChart();
  renderExerciseAvgChart();
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return String(phone || '-');
}

function renderDailyChart() {
  const labels = [];
  const counts = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    labels.push(dateStr.slice(5));
    counts.push(allRecords.filter(record => record.date === dateStr).length);
  }

  const ctx = document.getElementById('chartDailyRecords');
  if (!ctx) return;
  if (chartDaily) chartDaily.destroy();

  chartDaily = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '기록 수',
        data: counts,
        borderColor: '#004680',
        backgroundColor: 'rgba(0,70,128,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#004680',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
      },
    },
  });
}

function renderShareChart() {
  const data = allUsers.map(user => ({
    name: user.name,
    count: allRecords.filter(record => record.userId === user.id).length,
  }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const ctx = document.getElementById('chartUserShare');
  if (!ctx) return;
  if (chartShare) chartShare.destroy();

  if (!data.length) {
    ctx.parentElement.innerHTML = '<div style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:.85rem;">기록 데이터 없음</div>';
    return;
  }

  const colors = ['#004680', '#DDCA4B', '#22c55e', '#8b5cf6', '#ef4444', '#f97316', '#06b6d4', '#ec4899'];
  chartShare = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(item => item.name),
      datasets: [{
        data: data.map(item => item.count),
        backgroundColor: colors.slice(0, data.length),
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 14, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}건` } },
      },
    },
  });
}

function renderExerciseAvgChart() {
  const exercises = [
    { key: 'walking', label: '걷기 (분)' },
    { key: 'running', label: '러닝 (분)' },
    { key: 'squats', label: '스쿼트 (회)' },
    { key: 'pushups', label: '푸시업 (회)' },
    { key: 'situps', label: '윗몸일으키기 (회)' },
  ];

  const labels = [];
  const averages = [];

  exercises.forEach(ex => {
    const validRecords = allRecords.filter(r => (r[ex.key] || 0) > 0);
    if (validRecords.length > 0) {
      const sum = validRecords.reduce((acc, r) => acc + (Number(r[ex.key]) || 0), 0);
      averages.push(Math.round(sum / validRecords.length));
    } else {
      averages.push(0);
    }
    labels.push(ex.label);
  });

  const ctx = document.getElementById('chartExerciseAvg');
  if (!ctx) return;
  if (chartExerciseAvg) chartExerciseAvg.destroy();

  if (averages.every(val => val === 0)) {
    ctx.parentElement.innerHTML = '<div style="height:250px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:.85rem;">기록 데이터 없음</div>';
    return;
  }

  chartExerciseAvg = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '1회 평균 데이터',
        data: averages,
        backgroundColor: ['#22c55e', '#06b6d4', '#004680', '#8b5cf6', '#f97316'],
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} ${ctx.label.includes('분') ? '분' : '회'}` } },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

function renderRankTabs() {
  const el = document.getElementById('rankTabs');
  if (!el) return;
  el.innerHTML = RANK_CONFIGS.map(config => `
    <button class="rank-tab${rankMode === config.key ? ' active' : ''}" onclick="setRankMode('${config.key}')">${config.label}</button>
  `).join('');
}

function setRankMode(mode) {
  rankMode = mode;
  renderRankTabs();
  renderRanking();
}

function renderRanking() {
  const cfg = RANK_CONFIGS.find(config => config.key === rankMode);
  const ranked = allUsers.map(user => {
    const recs = allRecords.filter(record => record.userId === user.id);
    const streak = calcStreak(recs);
    const walking = recs.reduce((sum, record) => sum + (record.walking || 0), 0);
    const running = recs.reduce((sum, record) => sum + (record.running || 0), 0);
    const strength = recs.reduce((sum, record) => sum + (record.squats || 0) + (record.pushups || 0) + (record.situps || 0), 0);
    const water = recs.reduce((sum, record) => sum + (record.water || 0), 0);
    const lastDate = recs.length ? recs.map(record => record.date).sort().at(-1) : '-';
    const score = { streak, records: recs.length, walking, running, strength, water }[rankMode] || 0;

    return { ...user, streak, records: recs.length, walking, running, strength, water, lastDate, score };
  }).sort((a, b) => b.score - a.score);

  const head = document.getElementById('rankHead');
  const body = document.getElementById('rankBody');
  if (!head || !body) return;

  head.innerHTML = ['순위', '사용자', '이메일', '전화번호', cfg.desc, '총 기록', '스트릭', '최근 기록']
    .map(label => `<th>${label}</th>`)
    .join('');

  const rankClasses = ['gold', 'silver', 'bronze'];
  const medals = ['🥇', '🥈', '🥉'];
  const units = { streak: '일', records: '건', walking: '분', running: '분', strength: '회', water: 'ml' };

  body.innerHTML = ranked.map((user, index) => {
    const rankBadge = index < 3
      ? `<span class="rank-num ${rankClasses[index]}">${medals[index]}</span>`
      : `<span class="rank-num">${index + 1}</span>`;

    return `
      <tr>
        <td>${rankBadge}</td>
        <td>
          <div class="user-name-cell">
            <span style="font-weight:700; background: var(--primary-dark); padding: 3px 10px; border-radius: 100px; color: #fff; font-size: 0.85rem; display: inline-block;">${user.name || '-'}</span>
            ${user.isAdmin ? '<span style="font-size:0.65rem; background:var(--primary); color:white; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:normal;">관리자</span>' : ''}
            ${user.isSpecial ? '<span style="font-size:0.65rem; background:var(--gold); color:white; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:normal;">⭐</span>' : ''}
          </div>
        </td>
        <td style="font-size:.8rem;color:var(--text-muted);">${user.email || '-'}</td>
        <td style="font-size:.8rem;color:var(--text-muted);">${formatPhone(user.phone)}</td>
        <td><strong style="color:var(--primary);">${user.score.toLocaleString()}</strong><span style="font-size:.75rem;color:var(--text-muted);"> ${units[rankMode]}</span></td>
        <td>${user.records}건</td>
        <td>${user.streak}일 🔥</td>
        <td style="font-size:.8rem;color:var(--text-muted);">${user.lastDate}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">사용자 데이터 없음</td></tr>';
}

function renderUserMgmt() {
  const q = (document.getElementById('userSearch')?.value || '').trim().toLowerCase();
  const filtered = allUsers.filter(user => (
    !q
    || String(user.name || '').toLowerCase().includes(q)
    || String(user.username || '').toLowerCase().includes(q)
    || String(user.email || '').toLowerCase().includes(q)
    || String(user.phone || '').toLowerCase().includes(q)
  ));

  const now7 = new Date();
  now7.setDate(now7.getDate() - 7);
  const weekStr = `${now7.getFullYear()}-${String(now7.getMonth() + 1).padStart(2, '0')}-${String(now7.getDate()).padStart(2, '0')}`;  

  const body = document.getElementById('mgmtBody');
  if (!body) return;

  body.innerHTML = filtered.map(user => {
    const recs = allRecords.filter(record => record.userId === user.id);
    const streak = calcStreak(recs);
    const lastDate = recs.length ? recs.map(record => record.date).sort().at(-1) : null;
    const isActive = !!(lastDate && lastDate >= weekStr);
    const joinDate = user.createdAt ? String(user.createdAt).split('T')[0] : '-';
    return `
      <tr>
        <td><div class="user-name-cell"><span style="font-weight:700; background: var(--primary-dark); padding: 3px 10px; border-radius: 100px; color: #fff; font-size: 0.85rem; display: inline-block;">${user.name || '-'}</span>${user.isAdmin ? '<span style="font-size:0.65rem; background:var(--primary); color:white; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:normal;">관리자</span>' : ''}${user.isSpecial ? '<span style="font-size:0.65rem; background:var(--gold); color:white; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:normal;">⭐</span>' : ''}</div></td>
        <td style="font-size:.8rem;color:var(--text-muted);">${user.email || '-'}</td>
        <td style="font-size:.8rem;color:var(--text-muted);">${formatPhone(user.phone)}</td>
        <td style="font-size:.8rem;color:var(--text-muted);">${joinDate}</td>
        <td><strong>${recs.length}</strong>건</td>
        <td style="font-size:.8rem;color:var(--text-muted);">${lastDate || '없음'}</td>
        <td>${streak > 0 ? `<strong style="color:var(--primary);">${streak}일</strong> 🔥` : '<span style="color:var(--text-muted);">0일</span>'}</td>
        <td>${isActive ? '<span class="badge-active">활성</span>' : '<span class="badge-inactive">비활성</span>'}</td>
        <td>
          <button class="btn btn-outline btn-sm" style="font-size:.75rem;padding:4px 10px;" onclick="viewUser('${user.id}')">상세</button>
          <button class="btn btn-sm" style="font-size:.75rem;padding:4px 10px;${user.isAdmin ? 'background:var(--border);color:var(--text-muted);cursor:not-allowed;' : 'background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;'}" ${user.isAdmin ? 'disabled' : `onclick="confirmDeleteUser('${user.id}','${user.name || '-'}')"`}>삭제</button>
          <button class="btn btn-sm" style="font-size:.75rem;padding:4px 10px;${user.isSpecial ? 'background:var(--gold);color:var(--primary-dark);' : 'background:transparent;border:1px solid var(--border);color:var(--text-muted);'}" onclick="toggleSpecialTarget('${user.id}', ${!!user.isSpecial})">⭐특별관리</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted);">사용자 없음</td></tr>';
}

let udChartActivity = null;
let udChartCat = null;

function viewUser(userId) {
  const user = allUsers.find(item => item.id === userId);
  const recs = allRecords.filter(record => record.userId === userId).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!user) return;

  const sum = key => recs.reduce((acc, record) => acc + (record[key] || 0), 0);
  const streak = calcStreak(recs);
  const avgCond = recs.length ? (recs.reduce((acc, record) => acc + (record.condition || 3), 0) / recs.length).toFixed(1) : '-';

  document.getElementById('udAvatar').textContent = (user.name || 'U').charAt(0).toUpperCase();
  document.getElementById('udName').textContent = user.name || '-';
  document.getElementById('udMeta').textContent =
    `${user.email || '-'}  ·  ${formatPhone(user.phone)}  ·  가입일 ${user.createdAt ? String(user.createdAt).split('T')[0] : '-'}  ·  총 ${recs.length}건 기록`;

  const statItems = [
    { icon: '🔥', label: '연속 스트릭', val: `${streak}일` },
    { icon: '📋', label: '총 기록수', val: `${recs.length}건` },
    { icon: '⏱️', label: '운동 시간', val: `${sum('walking') + sum('running')}분` },
    { icon: '⭐', label: '평균 컨디션', val: avgCond !== '-' ? `${avgCond}/5` : '-' },
  ];
  document.getElementById('udStats').innerHTML = statItems.map(item => `
    <div style="padding:16px;border-right:1px solid var(--border);text-align:center;background:var(--surface);">
      <div style="font-size:1.4rem;margin-bottom:4px;">${item.icon}</div>
      <div style="font-size:1.1rem;font-weight:800;color:var(--primary);">${item.val}</div>
      <div style="font-size:0.73rem;color:var(--text-muted);margin-top:2px;">${item.label}</div>
    </div>
  `).join('');

  const condEmoji = value => ['', '😔', '😕', '😊', '😄', '🤩'][Math.round(value) || 0] || '';
  document.getElementById('udRecordBody').innerHTML = recs.length
    ? recs.map(record => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 10px;font-size:0.82rem;font-weight:600;">${record.date}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${record.walking || '-'}${record.walking ? '분' : ''}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${record.running || '-'}${record.running ? '분' : ''}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${record.squats || '-'}${record.squats ? '회' : ''}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${record.water || '-'}${record.water ? 'ml' : ''}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${condEmoji(record.condition)} ${record.condition || '-'}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">기록 없음</td></tr>';

  const days30 = [];
  const counts30 = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days30.push(ds.slice(5));
    counts30.push(recs.some(record => record.date === ds) ? 1 : 0);
  }

  setTimeout(() => {
    const ctx1 = document.getElementById('udChartActivity');
    if (ctx1) {
      if (udChartActivity) udChartActivity.destroy();
      udChartActivity = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: days30,
          datasets: [{
            label: '기록 여부',
            data: counts30,
            backgroundColor: counts30.map(v => (v ? '#004680' : 'rgba(0,70,128,0.15)')),
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => (ctx.parsed.y ? '기록 있음' : '기록 없음') } },
          },
          scales: {
            x: { ticks: { maxTicksLimit: 10, font: { size: 9 } } },
            y: { display: false, min: 0, max: 1 },
          },
        },
      });
    }

    const catCfgs = [
      { key: '유산소', color: '#22c55e' },
      { key: '근력', color: '#004680' },
      { key: '유연성', color: '#8b5cf6' },
      { key: '스포츠', color: '#DDCA4B' },
    ];
    const catTotals = { 유산소: 0, 근력: 0, 유연성: 0, 스포츠: 0 };
    recs.forEach(record => {
      (record.customExercises || []).forEach(ex => {
        if (Object.prototype.hasOwnProperty.call(catTotals, ex.category)) {
          catTotals[ex.category] += (ex.duration || 0);
        }
      });
    });
    const usedCats = catCfgs.filter(cat => catTotals[cat.key] > 0);
    const totalMins = Object.values(catTotals).reduce((acc, value) => acc + value, 0);

    const ctx2 = document.getElementById('udChartCat');
    if (!ctx2) return;
    if (udChartCat) udChartCat.destroy();

    if (!usedCats.length) {
      ctx2.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);font-size:.85rem;">카테고리 데이터 없음</div>';
      document.getElementById('udCatList').innerHTML = '';
      return;
    }

    udChartCat = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: usedCats.map(cat => cat.key),
        datasets: [{
          data: usedCats.map(cat => catTotals[cat.key]),
          backgroundColor: usedCats.map(cat => cat.color),
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });

    document.getElementById('udCatList').innerHTML = usedCats.map(cat => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:12px;height:12px;border-radius:50%;background:${cat.color};flex-shrink:0;"></div>
        <span style="font-size:0.82rem;flex:1;">${cat.key}</span>
        <span style="font-size:0.82rem;font-weight:700;color:var(--primary);">${catTotals[cat.key]}분</span>
        <span style="font-size:0.75rem;color:var(--text-muted);">${totalMins ? Math.round((catTotals[cat.key] / totalMins) * 100) : 0}%</span>
      </div>
    `).join('');
  }, 50);

  document.getElementById('udDeleteBtn').onclick = () => {
    closeUserDetail();
    confirmDeleteUser(userId, user.name || '-');
  };

  switchUdTab(0);
  document.getElementById('userDetailModal').style.display = 'block';
}

function closeUserDetail() {
  const modal = document.getElementById('userDetailModal');
  if (modal) modal.style.display = 'none';
}

function switchUdTab(idx) {
  [0, 1, 2].forEach(i => {
    const panel = document.getElementById(`udPanel${i}`);
    const tab = document.getElementById(`udTab${i}`);
    const active = i === idx;
    panel.style.display = active ? 'block' : 'none';
    tab.style.fontWeight = active ? '700' : '600';
    tab.style.color = active ? 'var(--primary)' : 'var(--text-secondary)';
    tab.style.borderBottom = active ? '2px solid var(--primary)' : 'none';
    tab.style.marginBottom = active ? '-2px' : '0';
  });
}

function confirmDeleteUser(userId, name) {
  deleteTargetId = userId;
  document.getElementById('confirmMsg').textContent = `"${name}" 사용자와 모든 기록이 영구 삭제됩니다.`;
  document.getElementById('confirmModal').classList.add('show');
  document.getElementById('confirmDeleteBtn').onclick = deleteUser;
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('show');
  deleteTargetId = null;
}

async function deleteUser() {
  if (!deleteTargetId) return;

  try {
    const response = await fetch(new URL('api/admin-users', window.location.href).toString(), {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: deleteTargetId }),
    });
    const payload = await readApiJson(response);
    if (!response.ok || !payload || !payload.ok) {
      throw new Error((payload && payload.message) || '사용자 삭제에 실패했습니다.');
    }

    closeConfirm();
    await enterAdmin();
    showToast('사용자가 삭제되었습니다.', 'success');
  } catch (error) {
    console.error('[AdminDeleteUser]', error);
    showToast(error.message || '사용자 삭제 중 오류가 발생했습니다.', 'error');
  }
}

function applyFilter() {
  const currentYear = new Date().getFullYear();

  allUsers = fetchedUsers.filter(u => {
    // 1. 특별관리 필터
    if (filterSpecialOnly && !u.isSpecial) return false;
    
    // 2. 성별 필터
    if (filterGender !== 'all' && u.gender !== filterGender) return false;
    
    // 3. 연령대 필터
    if (filterAge !== 'all') {
      const birthYear = Number(u.birthyear);
      if (!birthYear) return false;
      const age = currentYear - birthYear + 1; // 한국식 나이 또는 단순 차이
      
      if (filterAge === '20') {
        if (age < 20 || age >= 30) return false;
      } else if (filterAge === '30') {
        if (age < 30 || age >= 40) return false;
      } else if (filterAge === '40') {
        if (age < 40 || age >= 50) return false;
      } else if (filterAge === '50') {
        if (age < 50) return false;
      }
    }
    
    // 4. 가입일 필터 (월별 필터 사용 시 해당 월의 말일 기점으로 가입한 사용자만 포함)
    if (filterMonth && u.createdAt) {
      const joinDate = new Date(u.createdAt);
      const parts = filterMonth.split('-');
      if (parts.length === 2) {
        const yyyy = Number(parts[0]);
        const mm = Number(parts[1]);
        const cutoffDate = new Date(yyyy, mm, 1); // 다음 달 1일 자정
        if (joinDate >= cutoffDate) {
          return false;
        }
      }
    }
    
    return true;
  });

  const validIds = new Set(allUsers.map(u => u.id));
  allRecords = fetchedRecords.filter(r => {
    if (!validIds.has(r.userId)) return false;
    if (filterMonth && !String(r.date).startsWith(filterMonth)) return false;
    return true;
  });

  renderAll();
}

function updateFilters() {
  const gSelect = document.getElementById('filterGender');
  const aSelect = document.getElementById('filterAge');
  const sSelect = document.getElementById('filterSpecial');
  const mSelect = document.getElementById('filterMonth');
  
  if (gSelect) filterGender = gSelect.value;
  if (aSelect) filterAge = aSelect.value;
  if (sSelect) filterSpecialOnly = (sSelect.value === 'special');
  if (mSelect) filterMonth = mSelect.value;
  
  applyFilter();
}

function syncFilterUI() {
  const gSelect = document.getElementById('filterGender');
  const aSelect = document.getElementById('filterAge');
  const sSelect = document.getElementById('filterSpecial');
  const mSelect = document.getElementById('filterMonth');
  
  if (gSelect) gSelect.value = filterGender;
  if (aSelect) aSelect.value = filterAge;
  if (sSelect) sSelect.value = filterSpecialOnly ? 'special' : 'all';
  if (mSelect) mSelect.value = filterMonth;
}


async function toggleSpecialTarget(userId, currentStatus) {
  try {
    const res = await fetch(new URL('api/admin-special', window.location.href).toString(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isSpecial: !currentStatus }),
      credentials: 'include'
    });
    
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || '업데이트 실패');
    
    const userIdx = fetchedUsers.findIndex(u => u.id === userId);
    if (userIdx > -1) {
      fetchedUsers[userIdx].isSpecial = !currentStatus;
      applyFilter();
    }
  } catch (err) {
    if (window.location.protocol === 'file:' || (err.message && err.message.includes('Failed to fetch'))) {
      const userIdx = fetchedUsers.findIndex(u => u.id === userId);
      if (userIdx > -1) {
        fetchedUsers[userIdx].isSpecial = !currentStatus;
        applyFilter();
        
        let customSpecials = JSON.parse(sessionStorage.getItem('customSpecials') || '{}');
        customSpecials[userId] = !currentStatus;
        sessionStorage.setItem('customSpecials', JSON.stringify(customSpecials));
      }
    } else {
      alert('상태 변경 실패: ' + err.message);
    }
  }
}
