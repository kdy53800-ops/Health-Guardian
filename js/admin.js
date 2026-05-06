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

// 사용자 관리 페이지네이션 및 정렬 상태
let userMgmtPage = 1;
let userMgmtPageSize = 25;
let userMgmtSortKey = 'createdAt';
let userMgmtSortOrder = 'desc'; // 'asc' or 'desc'

const RANK_CONFIGS = [
  { key: 'streak', label: '🔥 연속 기록', desc: '연속 기록 일수' },
  { key: 'records', label: '📋 총 기록수', desc: '전체 기록 건수' },
  { key: 'walking', label: '🚶 걷기', desc: '총 걷기 (분)' },
  { key: 'running', label: '🏃 러닝', desc: '총 러닝 (분)' },
  { key: 'customEx', label: '🏅 개인운동', desc: '개인운동 총 시간 (분)' },
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
    
    // 로컬 환경(file://)이거나 서버 오류 시 mock 데이터 반환
    if (!response.ok) {
      if (window.location.protocol === 'file:' || response.status === 404 || response.status === 500) {
        console.warn('API fetch failed, using local storage mock data.');
        return {
          ok: true,
          users: JSON.parse(localStorage.getItem('users') || '[]'),
          records: JSON.parse(localStorage.getItem('records') || '[]')
        };
      }
      const payload = await readApiJson(response);
      const error = new Error((payload && payload.message) || '데이터 조회 권한이 없습니다.');
      error.status = response.status;
      throw error;
    }
    
    const payload = await readApiJson(response);
    if (!payload || !payload.ok) {
      throw new Error((payload && payload.message) || '데이터 형식 오류');
    }
    return payload;
  } catch (err) {
    if (window.location.protocol === 'file:' || err.message === 'Failed to fetch') {
      console.warn('Network error or local environment, returning mock data');
      return {
        ok: true,
        users: JSON.parse(localStorage.getItem('users') || '[]'),
        records: JSON.parse(localStorage.getItem('records') || '[]')
      };
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
  fetchedUsers = (payload && Array.isArray(payload.users)) ? payload.users : [];
  fetchedRecords = (payload && Array.isArray(payload.records)) ? payload.records : [];
  
  applyFilter();
  syncFilterUI();
  hideAdminAccessOverlay();
  
  // renderAll is already called by applyFilter()
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
  const currentMonthStr = now.toISOString().slice(0, 7); // YYYY-MM
  const targetMonth = filterMonth || currentMonthStr;

  // 필터 상태에 따른 라벨 변경
  const isFiltered = (filterGender !== 'all' || filterAge !== 'all' || filterSpecialOnly || filterMonth);
  
  // '전체 사용자'는 가입된 모든 인원
  const totalUsers = fetchedUsers.length;
  const totalRecords = allRecords.length;

  // 활성 사용자 정의: 이 달의 기록 발생 인원 총계
  // filterMonth가 있으면 해당 월, 없으면 현재 실제 월 기준
  const monthlyActiveUsers = new Set(
    fetchedRecords
      .filter(r => String(r.date).startsWith(targetMonth))
      .map(r => r.userId)
  ).size;
  const activeLabel = filterMonth ? `${targetMonth.slice(5)}월 참여 인원` : '이번 달 참여 인원';

  const totalExMins = allRecords.reduce((sum, record) => {
    const customSum = (record.customExercises || []).reduce((s, ex) => s + (Number(ex.duration) || 0), 0);
    return sum + (Number(record.walking) || 0) + (Number(record.running) || 0) + customSum;
  }, 0);

  const stats = [
    { icon: '👥', label: '전체 사용자', val: totalUsers, sub: '가입된 총 계정', cls: 'blue' },
    { icon: '📋', label: isFiltered ? '대상 기록수' : '전체 기록수', val: totalRecords, sub: isFiltered ? '해당 기간/조건' : '누적 기록', cls: 'green' },
    { icon: '✅', label: activeLabel, val: monthlyActiveUsers, sub: '기록 발생 인원', cls: 'gold' },
    { icon: '⏱️', label: '대상 운동 시간', val: totalExMins, sub: '분 (조건 내 합계)', cls: 'purple' },
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
let chartUserGrowth = null;
let chartExerciseAvg = null;

function renderCharts() {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js is not loaded.');
    return;
  }
  renderDailyChart();
  renderUserGrowthChart();
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
  
  if (filterMonth) {
    // 특정 월 필터 시: 해당 월의 1일부터 마지막 날까지 표시
    const [year, month] = filterMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      labels.push(`${month}/${d}`);
      counts.push(allRecords.filter(record => record.date === dateStr).length);
    }
  } else {
    // 기본: 최근 30일
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      labels.push(dateStr.slice(5));
      counts.push(allRecords.filter(record => record.date === dateStr).length);
    }
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
        pointRadius: labels.length > 31 ? 0 : 3, // 데이터 많으면 포인트 생략
        pointBackgroundColor: '#004680',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        title: {
          display: true,
          text: filterMonth ? `${filterMonth} 일별 기록 추이` : '최근 30일 기록 추이',
          font: { size: 12 }
        }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 12, font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
      },
    },
  });
}

function renderUserGrowthChart() {
  const labels = [];
  const cumulativeCounts = [];
  
  // 사용자 가입 날짜(createdAt)를 기준으로 전체 가입자 추이 계산
  const processGrowth = (dateList) => {
    dateList.forEach(dateStr => {
      // 해당 날짜(dateStr) 23:59:59까지 가입한 모든 사용자(기록 유무 상관없음)
      const endOfDay = new Date(dateStr + 'T23:59:59').getTime();
      const count = fetchedUsers.filter(u => {
        if (!u.createdAt) return false;
        return new Date(u.createdAt).getTime() <= endOfDay;
      }).length;
      
      labels.push(dateStr.slice(5).replace('-', '/'));
      cumulativeCounts.push(count);
    });
  };

  if (filterMonth) {
    const [year, month] = filterMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dates = [];
    for (let d = 1; d <= lastDay; d++) {
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    processGrowth(dates);
  } else {
    const dates = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    processGrowth(dates);
  }

  const ctx = document.getElementById('chartUserGrowth');
  if (!ctx) return;
  if (chartUserGrowth) chartUserGrowth.destroy();

  chartUserGrowth = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '누적 가입자',
        data: cumulativeCounts,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        fill: true,
        tension: 0.1,
        pointRadius: labels.length > 31 ? 0 : 3,
        pointBackgroundColor: '#22c55e',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        title: {
          display: true,
          text: filterMonth ? `${filterMonth} 누적 가입자 현황` : '최근 30일 누적 가입자 현황',
          font: { size: 12 }
        }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } },
        y: { beginAtZero: false, ticks: { precision: 0, font: { size: 10 } } },
      },
    },
  });
}

function renderExerciseAvgChart() {
  const exercises = [
    { key: 'walking', label: '걷기 (분)' },
    { key: 'running', label: '러닝 (분)' },
    { key: 'customEx', label: '개인운동 (분)', type: 'custom' },
  ];

  const labels = [];
  const averages = [];

  exercises.forEach(ex => {
    let validRecords = [];
    let sum = 0;

    if (ex.type === 'custom') {
      allRecords.forEach(r => {
        const customSum = (r.customExercises || []).reduce((s, e) => s + (e.duration || 0), 0);
        if (customSum > 0) {
          validRecords.push(r);
          sum += customSum;
        }
      });
    } else {
      validRecords = allRecords.filter(r => (r[ex.key] || 0) > 0);
      sum = validRecords.reduce((acc, r) => acc + (Number(r[ex.key]) || 0), 0);
    }

    if (validRecords.length > 0) {
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
  
  // 스트릭 계산 헬퍼: 해당 기간 내에서의 '최대 연속 기록(Max Streak)' 계산
  const getRankStreak = (userRecords) => {
    if (!userRecords.length) return 0;
    
    const dateSet = new Set(userRecords.map(r => r.date));
    const sortedDates = Array.from(dateSet).sort();
    let maxS = 0;
    let currS = 0;
    let prevD = null;
    
    sortedDates.forEach(d => {
      if (!prevD) {
        currS = 1;
      } else {
        const p = new Date(prevD + 'T00:00:00');
        p.setDate(p.getDate() + 1);
        const nextDayStr = p.toISOString().split('T')[0];
        
        if (d === nextDayStr) {
          currS++;
        } else {
          currS = 1;
        }
      }
      maxS = Math.max(maxS, currS);
      prevD = d;
    });
    return maxS;
  };

  const ranked = allUsers.map(user => {
    const recs = allRecords.filter(record => record.userId === user.id);
    const streak = getRankStreak(recs);
    
    const walking = recs.reduce((sum, record) => sum + (Number(record.walking) || 0), 0);
    const running = recs.reduce((sum, record) => sum + (Number(record.running) || 0), 0);
    const customEx = recs.reduce((sum, record) => {
      const customSum = (record.customExercises || []).reduce((s, ex) => s + (Number(ex.duration) || 0), 0);
      return sum + customSum;
    }, 0);
    const water = recs.reduce((sum, record) => sum + (Number(record.water) || 0), 0);
    
    const sortedRecs = [...recs].sort((a, b) => a.date.localeCompare(b.date));
    const lastDate = sortedRecs.length ? sortedRecs[sortedRecs.length - 1].date : '-';
    
    const score = { 
      streak, 
      records: recs.length, 
      walking, 
      running, 
      customEx, 
      water 
    }[rankMode] || 0;

    return { ...user, streak, records: recs.length, walking, running, customEx, water, lastDate, score };
  }).sort((a, b) => b.score - a.score);

  const head = document.getElementById('rankHead');
  const body = document.getElementById('rankBody');
  if (!head || !body) return;

  head.innerHTML = ['순위', '사용자', '이메일', '전화번호', cfg.desc, '총 기록', '스트릭', '최근 기록']
    .map(label => `<th>${label}</th>`)
    .join('');

  const rankClasses = ['gold', 'silver', 'bronze'];
  const medals = ['🥇', '🥈', '🥉'];
  const units = { streak: '일', records: '건', walking: '분', running: '분', customEx: '분', water: 'ml' };

  body.innerHTML = ranked.map((user, index) => {
    const rankBadge = index < 3
      ? `<span class="rank-num ${rankClasses[index]}">${medals[index]}</span>`
      : `<span class="rank-num">${index + 1}</span>`;

    return `
      <tr>
        <td data-label="순위">${rankBadge}</td>
        <td data-label="사용자">
          <div class="user-name-cell">
            <span style="font-weight:700; background: var(--primary-dark); padding: 3px 10px; border-radius: 100px; color: #fff; font-size: 0.85rem; display: inline-block;">${user.name || '-'}</span>
            ${user.isAdmin ? '<span style="font-size:0.65rem; background:var(--primary); color:white; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:normal;">관리자</span>' : ''}
            ${user.isSpecial ? '<span style="font-size:0.65rem; background:var(--gold); color:white; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:normal;">⭐</span>' : ''}
          </div>
        </td>
        <td data-label="이메일" style="font-size:.8rem;color:var(--text-muted);">${user.email || '-'}</td>
        <td data-label="전화번호" style="font-size:.8rem;color:var(--text-muted);">${formatPhone(user.phone)}</td>
        <td data-label="${cfg.desc}"><strong style="color:var(--primary);">${user.score.toLocaleString()}</strong><span style="font-size:.75rem;color:var(--text-muted);"> ${units[rankMode]}</span></td>
        <td data-label="총 기록">${user.records}건</td>
        <td data-label="스트릭">${user.streak}일 🔥</td>
        <td data-label="최근 기록" style="font-size:.8rem;color:var(--text-muted);">${user.lastDate}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">사용자 데이터 없음</td></tr>';
}

function renderUserMgmt() {
  const q = (document.getElementById('userSearch')?.value || '').trim().toLowerCase();
  
  // 1. 기본 필터링 (검색어)
  let filtered = allUsers.filter(user => (
    !q
    || String(user.name || '').toLowerCase().includes(q)
    || String(user.username || '').toLowerCase().includes(q)
    || String(user.email || '').toLowerCase().includes(q)
    || String(user.phone || '').toLowerCase().includes(q)
  ));

  // 2. 정렬을 위한 데이터 준비 (각 사용자별 지표 계산)
  const mapped = filtered.map(user => {
    const recs = allRecords.filter(record => record.userId === user.id);
    const streak = calcStreak(recs);
    const lastDate = recs.length ? recs.map(record => record.date).sort()[recs.length - 1] : '';
    return {
      ...user,
      records: recs.length,
      streak: streak,
      lastDate: lastDate
    };
  });

  // 3. 정렬 적용
  mapped.sort((a, b) => {
    let valA = a[userMgmtSortKey];
    let valB = b[userMgmtSortKey];

    // null/undefined 처리
    if (valA === undefined || valA === null) valA = '';
    if (valB === undefined || valB === null) valB = '';

    if (valA < valB) return userMgmtSortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return userMgmtSortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // 4. 페이지네이션 처리
  const totalCount = mapped.length;
  const totalPages = Math.ceil(totalCount / userMgmtPageSize) || 1;
  if (userMgmtPage > totalPages) userMgmtPage = totalPages;
  
  const startIdx = (userMgmtPage - 1) * userMgmtPageSize;
  const paged = mapped.slice(startIdx, startIdx + userMgmtPageSize);

  // UI 업데이트: 정렬 아이콘
  updateSortIcons();
  
  // UI 업데이트: 페이지 정보
  const pageInfo = document.getElementById('pageInfo');
  if (pageInfo) pageInfo.textContent = `${userMgmtPage} / ${totalPages} (총 ${totalCount}명)`;
  
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  if (prevBtn) prevBtn.disabled = userMgmtPage <= 1;
  if (nextBtn) nextBtn.disabled = userMgmtPage >= totalPages;

  const now7 = new Date();
  now7.setDate(now7.getDate() - 7);
  const weekStr = `${now7.getFullYear()}-${String(now7.getMonth() + 1).padStart(2, '0')}-${String(now7.getDate()).padStart(2, '0')}`;  

  const body = document.getElementById('mgmtBody');
  if (!body) return;

  body.innerHTML = paged.map(user => {
    const isActive = !!(user.lastDate && user.lastDate >= weekStr);
    const joinDate = user.createdAt ? String(user.createdAt).split('T')[0] : '-';
    return `
      <tr>
        <td data-label="사용자"><div class="user-name-cell"><span style="font-weight:700; background: var(--primary-dark); padding: 3px 10px; border-radius: 100px; color: #fff; font-size: 0.85rem; display: inline-block;">${user.name || '-'}</span>${user.isAdmin ? '<span style="font-size:0.65rem; background:var(--primary); color:white; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:normal;">관리자</span>' : ''}${user.isSpecial ? '<span style="font-size:0.65rem; background:var(--gold); color:white; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:normal;">⭐</span>' : ''}</div></td>
        <td data-label="이메일" style="font-size:.8rem;color:var(--text-muted);">${user.email || '-'}</td>
        <td data-label="전화번호" style="font-size:.8rem;color:var(--text-muted);">${formatPhone(user.phone)}</td>
        <td data-label="가입일" style="font-size:.8rem;color:var(--text-muted);">${joinDate}</td>
        <td data-label="총 기록"><strong>${user.records}</strong>건</td>
        <td data-label="최근 기록" style="font-size:.8rem;color:var(--text-muted);">${user.lastDate || '없음'}</td>
        <td data-label="관리">
          <button class="btn btn-outline btn-sm" style="font-size:.75rem;padding:4px 10px;" onclick="viewUser('${user.id}')">상세</button>
          <button class="btn btn-sm" style="font-size:.75rem;padding:4px 10px;${user.isAdmin ? 'background:var(--border);color:var(--text-muted);cursor:not-allowed;' : 'background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;'}" ${user.isAdmin ? 'disabled' : `onclick="confirmDeleteUser('${user.id}','${user.name || '-'}')"`}>삭제</button>
          <button class="btn btn-sm" style="font-size:.75rem;padding:4px 10px;${user.isSpecial ? 'background:var(--gold);color:var(--primary-dark);' : 'background:transparent;border:1px solid var(--border);color:var(--text-muted);'}" onclick="toggleSpecialTarget('${user.id}', ${!!user.isSpecial})">⭐특별관리</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted);">사용자 없음</td></tr>';
}

function handleSort(key) {
  if (userMgmtSortKey === key) {
    userMgmtSortOrder = (userMgmtSortOrder === 'asc' ? 'desc' : 'asc');
  } else {
    userMgmtSortKey = key;
    userMgmtSortOrder = 'desc';
  }
  userMgmtPage = 1;
  renderUserMgmt();
}

function updateSortIcons() {
  const keys = ['name', 'email', 'createdAt', 'records', 'lastDate'];
  keys.forEach(k => {
    const el = document.getElementById(`sort_${k}`);
    if (!el) return;
    if (userMgmtSortKey === k) {
      el.textContent = (userMgmtSortOrder === 'asc' ? '↑' : '↓');
      el.style.color = 'var(--primary)';
    } else {
      el.textContent = '↕';
      el.style.color = 'var(--text-muted)';
    }
  });
}

function changePage(delta) {
  userMgmtPage += delta;
  renderUserMgmt();
}

function updatePageSize() {
  const select = document.getElementById('pageSizeSelect');
  if (select) {
    userMgmtPageSize = parseInt(select.value) || 25;
    userMgmtPage = 1;
    renderUserMgmt();
  }
}

let udChartActivity = null;
let udChartCat = null;

function viewUser(userId) {
  const user = allUsers.find(item => item.id === userId);
  const recs = (allRecords || []).filter(record => record.userId === userId).sort((a, b) => (a.date < b.date ? 1 : -1));
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
    { icon: '⏱️', label: '총 운동 시간', val: `${recs.reduce((acc, r) => {
      const cSum = (r.customExercises || []).reduce((s, ex) => s + (ex.duration || 0), 0);
      return acc + (r.walking || 0) + (r.running || 0) + cSum;
    }, 0)}분` },
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
    ? recs.map(record => {
        const customSum = (record.customExercises || []).reduce((s, ex) => s + (ex.duration || 0), 0);
        return `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px 10px;font-size:0.82rem;font-weight:600;">${record.date}</td>
            <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${record.walking || '-'}${record.walking ? '분' : ''}</td>
            <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${record.running || '-'}${record.running ? '분' : ''}</td>
            <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${customSum || '-'}${customSum ? '분' : ''}</td>
            <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${record.water || '-'}${record.water ? 'ml' : ''}</td>
            <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${condEmoji(record.condition)} ${record.condition || '-'}</td>
          </tr>
        `;
      }).join('')
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
      const age = currentYear - birthYear + 1; 
      
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
    
    // 4. 기록 기반 필터 (가입일 대신 기록 유무 기준)
    // 월별 필터가 있을 경우, 해당 월에 기록이 있는 사용자만 포함
    if (filterMonth) {
      const hasRecordInMonth = fetchedRecords.some(r => r.userId === u.id && String(r.date).startsWith(filterMonth));
      if (!hasRecordInMonth) return false;
    } else {
      // 월별 필터가 없을 경우, 전체 기간 중 한 번이라도 기록이 있는 사용자만 포함 (사용자 요청 사항)
      const hasAnyRecord = fetchedRecords.some(r => r.userId === u.id);
      if (!hasAnyRecord) return false;
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
    const res = await fetch(new URL('api/admin-users', window.location.href).toString(), {
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
