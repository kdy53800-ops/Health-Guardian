/* ===================================================
   admin.js — Admin Dashboard Logic
   건강지킴이
   =================================================== */

const ADMIN_ID = 'snh07800';
const ADMIN_PW = 'hh7440123';

let rankMode = 'streak';
let deleteTargetId = null;
let allUsers   = [];
let allRecords = [];

const RANK_CONFIGS = [
  { key: 'streak',   label: '🔥 연속 기록',  desc: '연속 기록 일수'   },
  { key: 'records',  label: '📋 총 기록수',   desc: '전체 기록 건수'   },
  { key: 'walking',  label: '🚶 걷기',        desc: '총 걷기 (분)'     },
  { key: 'running',  label: '🏃 러닝',        desc: '총 러닝 (분)'     },
  { key: 'strength', label: '💪 근력',        desc: '총 근력 운동 (회)' },
  { key: 'water',    label: '💧 수분',        desc: '총 수분 (ml)'     },
];

// ─── 페이지 초기화 ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Auth.seedAdmin(); // 관리자 계정 항상 최신화

  const overlay = document.getElementById('adminLoginOverlay');

  // 이미 admin 세션이면 바로 진입
  const session = Auth.getUser();
  if (session && session.isAdmin) {
    overlay.style.display = 'none';
    enterAdmin();
    return;
  }

  // 아니면 오버레이를 보여둔 채 대기 (handleAdminLogin이 처리)
});

// ─── 관리자 로그인 처리 ───────────────────────────────
function handleAdminLogin(e) {
  e.preventDefault();
  const id = document.getElementById('adminId').value.trim();
  const pw = document.getElementById('adminPw').value;
  const errEl = document.getElementById('adminErr');

  const result = Auth.login(id, pw);

  if (result.ok && result.isAdmin) {
    errEl.classList.remove('show');
    document.getElementById('adminLoginOverlay').style.display = 'none';
    enterAdmin();
  } else {
    errEl.classList.add('show');
  }
}

// ─── 관리자 로그아웃 ──────────────────────────────────
function adminLogout() {
  Auth.logout();
  // Auth.logout()은 index.html로 이동 → 관리자는 admin.html로 바로 가면 됨
}

// ─── 대시보드 진입 ─────────────────────────────────────
function enterAdmin() {
  // nav 사용자 정보 갱신
  const user = Auth.getUser();
  if (user) {
    const el = document.getElementById('navUsername');
    const av = document.getElementById('navAvatar');
    if (el) el.textContent = user.name || '관리자';
    if (av) av.textContent = (user.name || 'A').charAt(0).toUpperCase();
  }
  loadData();
  renderAll();
}

// ─── Data Load ────────────────────────────────────────
function loadData() {
  allRecords = Records.getAll();
  allUsers   = Auth.getUsers().filter(u => !u.isAdmin);
}

// ─── Full Render (페이지별 분기) ──────────────────────
function renderAll() {
  const page = location.pathname.split('/').pop() || 'admin.html';

  if (page === 'admin-ranking.html') {
    renderRankTabs();
    renderRanking();
  } else if (page === 'admin-users.html') {
    renderUserMgmt();
  } else {
    // admin.html — 관리 현황
    renderPlatformStats();
    renderCharts();
  }
}

// ─── Platform Stats ───────────────────────────────────
function renderPlatformStats() {
  const now     = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
  const weekStr = weekAgo.toISOString().split('T')[0];

  const userRecs   = allRecords.filter(r => r.userId !== 'admin_snh07800');
  const totalUsers   = allUsers.length;
  const totalRecords = userRecs.length;
  const activeUsers  = new Set(userRecs.filter(r => r.date >= weekStr).map(r => r.userId)).size;
  const totalExMins  = userRecs.reduce((s, r) => s + (r.walking || 0) + (r.running || 0), 0);

  const stats = [
    { icon: '👥', label: '전체 사용자', val: totalUsers,    sub: '가입된 계정',    cls: 'blue'   },
    { icon: '📋', label: '전체 기록수', val: totalRecords,  sub: '누적 기록',      cls: 'green'  },
    { icon: '✅', label: '이번 주 활성', val: activeUsers,  sub: '7일 내 기록',   cls: 'gold'   },
    { icon: '⏱️', label: '총 운동 시간', val: totalExMins, sub: '분 (걷기+러닝)', cls: 'purple' },
  ];

  document.getElementById('platformStats').innerHTML = stats.map(s => `
    <div class="p-stat ${s.cls}">
      <div class="p-stat-icon">${s.icon}</div>
      <div class="p-stat-label">${s.label}</div>
      <div class="p-stat-value">${s.val.toLocaleString()}</div>
      <div class="p-stat-sub">${s.sub}</div>
    </div>`).join('');
}

// ─── Charts ───────────────────────────────────────────
let chartDaily = null;
let chartShare = null;

function renderCharts() { renderDailyChart(); renderShareChart(); }

function renderDailyChart() {
  const days = [], counts = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    days.push(ds.slice(5));
    counts.push(allRecords.filter(r => r.date === ds && r.userId !== 'admin_snh07800').length);
  }
  const ctx = document.getElementById('chartDailyRecords');
  if (!ctx) return;
  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [{ label:'기록 수', data:counts, borderColor:'#004680',
        backgroundColor:'rgba(0,70,128,0.08)', fill:true, tension:0.4,
        pointRadius:3, pointBackgroundColor:'#004680' }],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ maxTicksLimit:10, font:{size:10} } },
        y:{ beginAtZero:true, ticks:{ stepSize:1, font:{size:10} } },
      },
    },
  });
}

function renderShareChart() {
  const data = allUsers.map(u => ({
    name: u.name,
    count: allRecords.filter(r => r.userId === u.id).length,
  })).filter(u => u.count > 0).sort((a,b) => b.count - a.count).slice(0, 8);

  const ctx = document.getElementById('chartUserShare');
  if (!ctx) return;
  if (chartShare) chartShare.destroy();
  if (!data.length) {
    ctx.parentElement.innerHTML = '<div style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:.85rem;">기록 데이터 없음</div>';
    return;
  }
  const COLORS = ['#004680','#DDCA4B','#22c55e','#8b5cf6','#ef4444','#f97316','#06b6d4','#ec4899'];
  chartShare = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(u => u.name),
      datasets: [{ data: data.map(u => u.count), backgroundColor: COLORS.slice(0, data.length), borderWidth:2, borderColor:'#fff' }],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{ position:'right', labels:{ font:{size:11}, boxWidth:14, padding:12 } },
        tooltip:{ callbacks:{ label: c => ` ${c.label}: ${c.parsed}건` } },
      },
    },
  });
}

// ─── Rank Tabs ────────────────────────────────────────
function renderRankTabs() {
  document.getElementById('rankTabs').innerHTML = RANK_CONFIGS.map(c => `
    <button class="rank-tab${rankMode===c.key?' active':''}" onclick="setRankMode('${c.key}')">${c.label}</button>`).join('');
}
function setRankMode(mode) { rankMode = mode; renderRankTabs(); renderRanking(); }

// ─── Ranking ──────────────────────────────────────────
function renderRanking() {
  const cfg = RANK_CONFIGS.find(c => c.key === rankMode);
  const ranked = allUsers.map(u => {
    const recs = allRecords.filter(r => r.userId === u.id);
    const streak   = calcStreak(recs);
    const walking  = recs.reduce((s,r)=>s+(r.walking||0),0);
    const running  = recs.reduce((s,r)=>s+(r.running||0),0);
    const strength = recs.reduce((s,r)=>s+(r.squats||0)+(r.pushups||0)+(r.situps||0),0);
    const water    = recs.reduce((s,r)=>s+(r.water||0),0);
    const lastDate = recs.length ? recs.map(r=>r.date).sort().at(-1) : '-';
    const score = { streak, records:recs.length, walking, running, strength, water }[rankMode]||0;
    return { ...u, streak, records:recs.length, walking, running, strength, water, lastDate, score };
  }).sort((a,b) => b.score - a.score);

  document.getElementById('rankHead').innerHTML =
    ['순위','사용자','아이디', cfg.desc, '총 기록','스트릭','최근 기록'].map(h=>`<th>${h}</th>`).join('');

  const CLS = ['gold','silver','bronze'];
  const MED = ['🥇','🥈','🥉'];
  const UNIT = { streak:'일', records:'건', walking:'분', running:'분', strength:'회', water:'ml' };
  document.getElementById('rankBody').innerHTML = ranked.map((u,i) => {
    const rankEl = i < 3 ? `<span class="rank-num ${CLS[i]}">${MED[i]}</span>` : `<span class="rank-num">${i+1}</span>`;
    return `<tr>
      <td>${rankEl}</td>
      <td><div class="user-name-cell"><div class="user-avatar-sm">${u.name.charAt(0).toUpperCase()}</div><span style="font-weight:700;">${u.name}</span></div></td>
      <td style="font-size:.8rem;color:var(--text-muted);">${u.username}</td>
      <td><strong style="color:var(--primary);">${u.score.toLocaleString()}</strong><span style="font-size:.75rem;color:var(--text-muted);"> ${UNIT[rankMode]}</span></td>
      <td>${u.records}건</td>
      <td>${u.streak}일 🔥</td>
      <td style="font-size:.8rem;color:var(--text-muted);">${u.lastDate}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">사용자 데이터 없음</td></tr>`;
}

// ─── User Management ──────────────────────────────────
function renderUserMgmt() {
  const q = (document.getElementById('userSearch')?.value||'').trim().toLowerCase();
  const filtered = allUsers.filter(u => !q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));

  const now7 = new Date(); now7.setDate(now7.getDate()-7);
  const weekStr = now7.toISOString().split('T')[0];

  document.getElementById('mgmtBody').innerHTML = filtered.map(u => {
    const recs     = allRecords.filter(r => r.userId === u.id);
    const streak   = calcStreak(recs);
    const lastDate = recs.length ? recs.map(r=>r.date).sort().at(-1) : null;
    const isActive = lastDate && lastDate >= weekStr;
    const joinDate = u.createdAt ? u.createdAt.split('T')[0] : '-';
    return `<tr>
      <td><div class="user-name-cell"><div class="user-avatar-sm">${u.name.charAt(0).toUpperCase()}</div><span style="font-weight:600;">${u.name}</span></div></td>
      <td style="font-size:.8rem;color:var(--text-muted);">${u.username}</td>
      <td style="font-size:.8rem;color:var(--text-muted);">${joinDate}</td>
      <td><strong>${recs.length}</strong>건</td>
      <td style="font-size:.8rem;color:var(--text-muted);">${lastDate||'없음'}</td>
      <td>${streak>0?`<strong style="color:var(--primary);">${streak}일</strong> 🔥`:'<span style="color:var(--text-muted);">0일</span>'}</td>
      <td>${isActive?'<span class="badge-active">활성</span>':'<span class="badge-inactive">비활성</span>'}</td>
      <td>
        <button class="btn btn-outline btn-sm" style="font-size:.75rem;padding:4px 10px;" onclick="viewUser('${u.id}')">상세</button>
        <button class="btn btn-sm" style="font-size:.75rem;padding:4px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;" onclick="confirmDeleteUser('${u.id}','${u.name}')">삭제</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">사용자 없음</td></tr>`;
}

// ─── View User Detail (모달) ──────────────────────────
let udChartActivity = null;
let udChartCat      = null;
let currentUdUserId = null;

function viewUser(userId) {
  const u    = allUsers.find(u => u.id === userId);
  const recs = allRecords.filter(r => r.userId === userId).sort((a,b)=> a.date < b.date ? 1 : -1);
  if (!u) return;
  currentUdUserId = userId;

  const sum    = key => recs.reduce((s,r) => s+(r[key]||0), 0);
  const streak = calcStreak(recs);
  const avgCond = recs.length ? (recs.reduce((s,r)=>s+(r.condition||3),0)/recs.length).toFixed(1) : '-';

  // ── 헤더 ──
  document.getElementById('udAvatar').textContent = u.name.charAt(0).toUpperCase();
  document.getElementById('udName').textContent   = u.name;
  document.getElementById('udMeta').textContent   =
    `@${u.username}  ·  가입일 ${u.createdAt ? u.createdAt.split('T')[0] : '-'}  ·  총 ${recs.length}건 기록`;

  // ── 통계 카드 4개 ──
  const statItems = [
    { icon:'🔥', label:'연속 스트릭', val:streak+'일' },
    { icon:'📋', label:'총 기록수',   val:recs.length+'건' },
    { icon:'⏱️', label:'운동 시간',   val:(sum('walking')+sum('running'))+'분' },
    { icon:'⭐', label:'평균 컨디션', val:(avgCond!=='-'? avgCond+'/5' : '-') },
  ];
  document.getElementById('udStats').innerHTML = statItems.map(s=>`
    <div style="padding:16px;border-right:1px solid var(--border);text-align:center;background:var(--surface);">
      <div style="font-size:1.4rem;margin-bottom:4px;">${s.icon}</div>
      <div style="font-size:1.1rem;font-weight:800;color:var(--primary);">${s.val}</div>
      <div style="font-size:0.73rem;color:var(--text-muted);margin-top:2px;">${s.label}</div>
    </div>`).join('');

  // ── 탭 0: 기록 목록 ──
  const condEmoji = v => ['','😔','😕','😊','😄','🤩'][Math.round(v)||0] || '';
  document.getElementById('udRecordBody').innerHTML = recs.length
    ? recs.map(r=>`
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 10px;font-size:0.82rem;font-weight:600;">${r.date}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${r.walking||'-'}${r.walking?'분':''}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${r.running||'-'}${r.running?'분':''}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${r.squats||'-'}${r.squats?'회':''}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${r.water||'-'}${r.water?'ml':''}</td>
        <td style="padding:8px 10px;font-size:0.82rem;text-align:center;">${condEmoji(r.condition)} ${r.condition||'-'}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">기록 없음</td></tr>';

  // ── 탭 1: 최근 30일 활동 차트 ──
  const days30 = [], counts30 = [];
  for (let i=29; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    days30.push(ds.slice(5));
    counts30.push(recs.filter(r=>r.date===ds).length ? 1 : 0);
  }
  setTimeout(()=>{
    const ctx1 = document.getElementById('udChartActivity');
    if (!ctx1) return;
    if (udChartActivity) udChartActivity.destroy();
    udChartActivity = new Chart(ctx1, {
      type:'bar',
      data:{ labels:days30, datasets:[{
        label:'기록 여부', data:counts30,
        backgroundColor: counts30.map(v=>v?'#004680':'rgba(0,70,128,0.15)'),
        borderRadius:4,
      }]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false},
          tooltip:{ callbacks:{ label: c => c.parsed.y ? '기록 있음' : '기록 없음' } }},
        scales:{
          x:{ ticks:{maxTicksLimit:10, font:{size:9}} },
          y:{ display:false, min:0, max:1 },
        },
      },
    });

    // ── 탭 2: 카테고리 분포 ──
    const catCfgs = [
      { key:'유산소', color:'#22c55e' }, { key:'근력', color:'#004680' },
      { key:'유연성', color:'#8b5cf6' }, { key:'스포츠', color:'#DDCA4B' },
    ];
    const catTotals = {};
    catCfgs.forEach(c=>{ catTotals[c.key]=0; });
    recs.forEach(r=>{ if(!r.customExercises) return;
      r.customExercises.forEach(ex=>{ catTotals[ex.category]=(catTotals[ex.category]||0)+(ex.duration||0); }); });
    const catKeys   = catCfgs.filter(c=>catTotals[c.key]>0);
    const totalMins = Object.values(catTotals).reduce((a,b)=>a+b,0);

    const ctx2 = document.getElementById('udChartCat');
    if (ctx2) {
      if (udChartCat) udChartCat.destroy();
      if (catKeys.length) {
        udChartCat = new Chart(ctx2, {
          type:'doughnut',
          data:{
            labels: catKeys.map(c=>c.key),
            datasets:[{ data:catKeys.map(c=>catTotals[c.key]),
              backgroundColor:catKeys.map(c=>c.color), borderWidth:2, borderColor:'#fff' }],
          },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} },
        });
        document.getElementById('udCatList').innerHTML = catKeys.map(c=>`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:12px;height:12px;border-radius:50%;background:${c.color};flex-shrink:0;"></div>
            <span style="font-size:0.82rem;flex:1;">${c.key}</span>
            <span style="font-size:0.82rem;font-weight:700;color:var(--primary);">${catTotals[c.key]}분</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">${totalMins?Math.round(catTotals[c.key]/totalMins*100):0}%</span>
          </div>`).join('');
      } else {
        ctx2.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);font-size:.85rem;">카테고리 데이터 없음</div>';
        document.getElementById('udCatList').innerHTML = '';
      }
    }
  }, 50);

  // ── 삭제 버튼 연결 ──
  document.getElementById('udDeleteBtn').onclick = () => {
    closeUserDetail();
    confirmDeleteUser(userId, u.name);
  };

  // 탭 0 초기화 & 모달 표시
  switchUdTab(0);
  document.getElementById('userDetailModal').style.display = 'block';
}

function closeUserDetail() {
  document.getElementById('userDetailModal').style.display = 'none';
  currentUdUserId = null;
}

function switchUdTab(idx) {
  [0,1,2].forEach(i => {
    const panel = document.getElementById(`udPanel${i}`);
    const tab   = document.getElementById(`udTab${i}`);
    const active = i === idx;
    panel.style.display = active ? 'block' : 'none';
    tab.style.fontWeight    = active ? '700' : '600';
    tab.style.color         = active ? 'var(--primary)' : 'var(--text-secondary)';
    tab.style.borderBottom  = active ? '2px solid var(--primary)' : 'none';
    tab.style.marginBottom  = active ? '-2px' : '0';
  });
}

// ─── Delete User ──────────────────────────────────────
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
function deleteUser() {
  if (!deleteTargetId) return;
  Auth.saveUsers(Auth.getUsers().filter(u => u.id !== deleteTargetId));
  localStorage.setItem('HealthGuardian_records', JSON.stringify(Records.getAll().filter(r => r.userId !== deleteTargetId)));
  closeConfirm();
  loadData();
  renderAll();
  showToast('사용자가 삭제되었습니다.', 'success');
}
