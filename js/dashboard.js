/* ===================================================
   dashboard.js — Dashboard Charts & Stats
   건강지킴이
   =================================================== */

let currentUser = null;
let userRecords = [];
let userGoals   = null;
let chartFilter = '7'; // '7' or '30'
let charts = {};

const CHART_COLORS = {
  primary:    '#004680',
  primaryBg:  'rgba(0,70,128,0.15)',
  gold:       '#DDCA4B',
  goldBg:     'rgba(221,202,75,0.2)',
  green:      '#22c55e',
  greenBg:    'rgba(34,197,94,0.15)',
  red:        '#ef4444',
  redBg:      'rgba(239,68,68,0.12)',
  purple:     '#8b5cf6',
  purpleBg:   'rgba(139,92,246,0.15)',
  teal:       '#14b8a6',
  tealBg:     'rgba(20,184,166,0.15)',
};

Chart.defaults.font.family = "'Pretendard', 'Outfit', sans-serif";
Chart.defaults.color = '#5a7a9a';

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = Auth.require();
  if (!currentUser) return;

  userGoals = Goals.get(currentUser.id);
  userRecords = (await Records.getUserRecordsAsync(currentUser.id))
    .sort((a, b) => a.date.localeCompare(b.date));

  renderDashboard();
});

function renderDashboard() {
  const main = document.getElementById('mainContent');

  if (userRecords.length === 0) {
    main.innerHTML = `
      <div class="page-header">
        <h1><div class="page-icon">📊</div> 대시보드</h1>
        <p class="subtitle" id="navUsername2">${currentUser.name}님의 건강 통계</p>
      </div>
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>아직 기록이 없습니다</h3>
        <p>첫 운동 기록을 작성하면 멋진 대시보드가 펼쳐져요!</p>
        <a href="record.html" class="btn btn-primary btn-lg">✏️ 첫 기록 작성하기</a>
      </div>
    `;
    return;
  }

  const thisWeekDays = getCurrentWeekDays(); // 월~일
  const todayStr = today();
  const streak = calcStreak(userRecords);
  const todayRecord = userRecords.find(r => r.date === todayStr);

  // Totals (all-time)
  const totalWalking = sum(userRecords, 'walking');
  const totalRunning = sum(userRecords, 'running');
  const totalSquats  = sum(userRecords, 'squats');
  const totalPushups = sum(userRecords, 'pushups');
  const totalSitups  = sum(userRecords, 'situps');
  const totalCardio  = totalWalking + totalRunning;
  const totalStrength = totalSquats + totalPushups + totalSitups;

  // Weekly (이번 주 월~일 기준)
  const weekRecords = userRecords.filter(r => thisWeekDays.includes(r.date));
  const avgWater    = weekRecords.length ? Math.round(avg(weekRecords, 'water')) : 0;
  const avgCondition = weekRecords.length ? (avg(weekRecords, 'condition')).toFixed(1) : '-';

  main.innerHTML = `
    <!-- Page Header -->
    <div class="page-header">
      <h1><div class="page-icon">📊</div> 대시보드</h1>
      <p class="subtitle">${currentUser.name}님의 건강 통계 &nbsp;·&nbsp; 총 <strong>${userRecords.length}일</strong> 기록</p>
    </div>

    <!-- Streak -->
    <div class="streak-section">
      <div class="streak-flame">🔥</div>
      <div class="streak-info">
        <h2>연속 기록 스트릭</h2>
        <div class="streak-count">${streak}<span style="font-size:1.2rem; font-weight:600; color:rgba(255,255,255,0.7)"> 일</span></div>
        <p>${streak > 0 ? '지금 이 흐름을 유지하세요! 💪' : '오늘 기록을 시작해 스트릭을 시작하세요!'}</p>
      </div>
    </div>

    <!-- Weekly Check -->
    <div class="chart-card mb-20">
      <div class="chart-card-header">
        <div class="chart-card-title">📅 이번 주 기록 현황</div>
      </div>
      <div class="chart-card-body">
        <div class="week-grid" id="weekGrid"></div>
      </div>
    </div>

    <!-- Best Records (가로 배치) -->
    <div class="chart-card mb-20">
      <div class="chart-card-header">
        <div class="chart-card-title">🏆 운동 베스트 기록</div>
      </div>
      <div class="chart-card-body">
        <div id="bestRecordsList" class="best-records-list"></div>
      </div>
    </div>

    <!-- Hero Stats -->
    <div class="hero-stats-grid mb-20">
      <div class="stat-card">
        <div class="stat-card-label">총 유산소 운동</div>
        <div class="stat-card-value">${totalCardio}<span class="stat-card-unit">분</span></div>
        <div class="stat-card-sub">걷기 ${totalWalking}분 + 러닝 ${totalRunning}분</div>
        <div class="stat-card-icon">🏃</div>
      </div>
      <div class="stat-card green">
        <div class="stat-card-label">총 근력 운동</div>
        <div class="stat-card-value">${totalStrength}<span class="stat-card-unit">회</span></div>
        <div class="stat-card-sub">스쿼트+푸쉬업+윗몸</div>
        <div class="stat-card-icon">💪</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-card-label">주간 평균 수분</div>
        <div class="stat-card-value">${avgWater}<span class="stat-card-unit">ml</span></div>
        <div class="stat-card-sub">주간 ${weekRecords.length}일 평균</div>
        <div class="stat-card-icon">💧</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">평균 컨디션</div>
        <div class="stat-card-value">${avgCondition}<span class="stat-card-unit">/5</span></div>
        <div class="stat-card-sub">${getConditionEmoji(parseFloat(avgCondition))} 주간 평균</div>
        <div class="stat-card-icon">⭐</div>
      </div>
    </div>

    <!-- Today's Goals Rings -->
    <div class="chart-card mb-20">
      <div class="chart-card-header">
        <div class="chart-card-title">🎯 오늘의 목표 달성률</div>
        ${todayRecord ? '' : '<a href="record.html" class="btn btn-primary btn-sm">오늘 기록하기</a>'}
      </div>
      <div class="chart-card-body">
        <div class="goal-rings-grid" id="goalRingsGrid"></div>
      </div>
    </div>

    <!-- Charts Row: 유산소 & 근력 (선 그래프) -->
    <div class="grid-2 mb-20">
      <!-- Cardio Line Chart -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">🏃 유산소 운동 추이</div>
          <div class="filter-btns">
            <button class="filter-btn active" id="cardioFilter7" onclick="setFilter('cardio','7')">7일</button>
            <button class="filter-btn" id="cardioFilter30" onclick="setFilter('cardio','30')">30일</button>
          </div>
        </div>
        <div class="chart-card-body">
          <div class="chart-wrap"><canvas id="chartCardio"></canvas></div>
        </div>
      </div>
      <!-- Strength Line Chart -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">💪 근력 운동 추이</div>
          <div class="filter-btns">
            <button class="filter-btn active" id="strengthFilter7" onclick="setFilter('strength','7')">7일</button>
            <button class="filter-btn" id="strengthFilter30" onclick="setFilter('strength','30')">30일</button>
          </div>
        </div>
        <div class="chart-card-body">
          <div class="chart-wrap"><canvas id="chartStrength"></canvas></div>
        </div>
      </div>
    </div>

    <!-- 수분(막대) + 공복(막대) + 컨디션(선) -->
    <div class="grid-3 mb-20">
      <!-- Water Bar Chart -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">💧 수분섭취</div>
          <div class="filter-btns">
            <button class="filter-btn active" id="waterFilter7" onclick="setFilter('water','7')">7일</button>
            <button class="filter-btn" id="waterFilter30" onclick="setFilter('water','30')">30일</button>
          </div>
        </div>
        <div class="chart-card-body">
          <div class="chart-wrap"><canvas id="chartWater"></canvas></div>
        </div>
      </div>
      <!-- Fasting Bar Chart -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">⏱️ 공복시간</div>
          <div class="filter-btns">
            <button class="filter-btn active" id="fastingFilter7" onclick="setFilter('fasting','7')">7일</button>
            <button class="filter-btn" id="fastingFilter30" onclick="setFilter('fasting','30')">30일</button>
          </div>
        </div>
        <div class="chart-card-body">
          <div class="chart-wrap"><canvas id="chartFasting"></canvas></div>
        </div>
      </div>
      <!-- Condition Line Chart -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">⭐ 컨디션 변화</div>
          <div class="filter-btns">
            <button class="filter-btn active" id="condFilter7" onclick="setFilter('condition','7')">7일</button>
            <button class="filter-btn" id="condFilter30" onclick="setFilter('condition','30')">30일</button>
          </div>
        </div>
        <div class="chart-card-body">
          <div class="chart-wrap"><canvas id="chartCondition"></canvas></div>
        </div>
      </div>
    </div>

    <!-- Weight Chart (전체 너비) -->
    <div class="chart-card mb-20">
      <div class="chart-card-header">
        <div class="chart-card-title">⚖️ 체중 변화</div>
      </div>
      <div class="chart-card-body">
        <div id="weightChartWrap" class="chart-wrap"><canvas id="chartWeight"></canvas></div>
      </div>
    </div>

    <!-- 개인 운동 차트 -->
    <div class="chart-card mb-20" id="customExChartCard">
      <div class="chart-card-header">
        <div class="chart-card-title">🏅 개인 운동 현황</div>
        <div class="filter-btns">
          <button class="filter-btn active" id="customFilter7" onclick="setFilter('custom','7')">7일</button>
          <button class="filter-btn" id="customFilter30" onclick="setFilter('custom','30')">30일</button>
        </div>
      </div>
      <div class="chart-card-body">
        <div class="custom-ex-chart-grid">
          <div class="chart-wrap custom-ex-chart-wrap"><canvas id="chartCustomEx"></canvas></div>
          <div id="customExSummary" class="custom-ex-summary"></div>
        </div>
      </div>

    </div>

    <!-- Recent Activity -->
    <div class="chart-card mb-20">
      <div class="chart-card-header" style="margin-bottom:12px;">
        <div class="chart-card-title">🕐 최근 활동</div>
        <a href="history.html" class="btn btn-outline btn-sm">전체 보기</a>
      </div>
      <div class="chart-card-body" style="padding-top:0;">
        <div class="activity-list" id="activityList"></div>
      </div>
    </div>
  `;

  renderWeekGrid(thisWeekDays, todayStr);
  renderGoalRings(todayRecord);
  drawCharts('7');
  renderBestRecords();
  renderRecentActivity();
  renderCustomExSummary('7');
}

// ─── Week Grid (월~일 고정) ───────────────────────────
function renderWeekGrid(weekDays, todayStr) {
  const grid = document.getElementById('weekGrid');
  if (!grid) return;
  // weekDays는 항상 [월,화,수,목,금,토,일] 순서
  const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

  grid.innerHTML = weekDays.map((dateStr, idx) => {
    const hasRecord = userRecords.some(r => r.date === dateStr);
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const d = new Date(dateStr + 'T00:00:00');
    const dateNum = d.getDate();
    const dayLabel = DAY_LABELS[idx];

    return `
      <div class="week-day">
        <div class="week-day-label" style="${idx === 6 ? 'color:#ef4444' : idx === 5 ? 'color:#3b82f6' : ''}">${dayLabel}</div>
        <div class="week-day-dot ${hasRecord ? 'done' : ''} ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}">
          ${hasRecord ? '✓' : dateNum}
        </div>
        <div class="week-date-label">${dateNum}일</div>
      </div>
    `;
  }).join('');
}

// ─── Goal Rings ───────────────────────────────────────
function renderGoalRings(todayRecord) {
  const grid = document.getElementById('goalRingsGrid');
  if (!grid) return;

  const ringConfigs = [
    { key: 'walking',  label: '걷기',   unit: '분',   color: CHART_COLORS.green },
    { key: 'running',  label: '러닝',   unit: '분',   color: CHART_COLORS.primary },
    { key: 'squats',   label: '스쿼트', unit: '회',   color: CHART_COLORS.purple },
    { key: 'pushups',  label: '푸쉬업', unit: '회',   color: CHART_COLORS.teal },
    { key: 'situps',   label: '윗몸',   unit: '회',   color: CHART_COLORS.red },
    { key: 'water',    label: '수분',   unit: 'ml',   color: CHART_COLORS.gold },
    { key: 'fasting',  label: '공복',   unit: 'h',    color: '#f59e0b' },
  ];

  grid.innerHTML = '';

  ringConfigs.forEach((cfg, idx) => {
    const val    = todayRecord ? (todayRecord[cfg.key] || 0) : 0;
    const goal   = userGoals[cfg.key] || 1;
    const pct    = Math.min(Math.round((val / goal) * 100), 100);
    const canvasId = `ring_${cfg.key}`;

    const item = document.createElement('div');
    item.className = 'goal-ring-item';
    item.innerHTML = `
      <div class="ring-canvas-wrap">
        <canvas id="${canvasId}" width="80" height="80"></canvas>
        <div class="ring-center-text">
          <span class="ring-pct">${pct}%</span>
        </div>
      </div>
      <div class="ring-label">${cfg.label}</div>
      <div class="ring-val">${val}<span style="font-size:0.6rem;color:var(--text-muted)">/${goal}${cfg.unit}</span></div>
    `;
    grid.appendChild(item);

    // Draw ring chart immediately after DOM insertion
    setTimeout(() => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      new Chart(canvas, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [pct, 100 - pct],
            backgroundColor: [cfg.color, '#e8eef4'],
            borderWidth: 0,
            borderRadius: 4,
          }]
        },
        options: {
          responsive: false,
          cutout: '72%',
          animation: { duration: 700 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
      });
    }, 0);
  });
}

// ─── Charts ───────────────────────────────────────────
function drawCharts(period) {
  const days = period === '30' ? getLast30Days() : getLast7Days();
  const labels = days.map(d => formatDateShort(d));
  const recordMap = {};
  userRecords.forEach(r => { recordMap[r.date] = r; });
  const getVal = (d, key) => (recordMap[d] ? (recordMap[d][key] || 0) : 0);

  destroyCharts();

  // 공통 선 그래프 데이터셋 옵션
  const lineDataset = (label, data, color, colorBg) => ({
    label,
    data,
    borderColor: color,
    backgroundColor: colorBg,
    fill: true,
    tension: 0.4,
    pointRadius: 4,
    pointHoverRadius: 6,
    pointBackgroundColor: color,
    pointBorderColor: '#fff',
    pointBorderWidth: 2,
    borderWidth: 2.5,
  });

  // ① 유산소 — 선 그래프
  charts.cardio = new Chart(document.getElementById('chartCardio'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        lineDataset('걷기(분)', days.map(d => getVal(d,'walking')), CHART_COLORS.green,   CHART_COLORS.greenBg),
        lineDataset('러닝(분)', days.map(d => getVal(d,'running')), CHART_COLORS.primary, CHART_COLORS.primaryBg),
      ]
    },
    options: lineChartOptions('분')
  });

  // ② 근력 — 선 그래프
  charts.strength = new Chart(document.getElementById('chartStrength'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        lineDataset('스쿼트', days.map(d => getVal(d,'squats')),  CHART_COLORS.purple, CHART_COLORS.purpleBg),
        lineDataset('푸쉬업', days.map(d => getVal(d,'pushups')), CHART_COLORS.teal,   CHART_COLORS.tealBg),
        lineDataset('윗몸',   days.map(d => getVal(d,'situps')),  CHART_COLORS.red,    CHART_COLORS.redBg),
      ]
    },
    options: lineChartOptions('회')
  });

  // ③ 수분섭취 — 막대 그래프
  charts.water = new Chart(document.getElementById('chartWater'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '수분(ml)',
        data: days.map(d => getVal(d,'water')),
        backgroundColor: CHART_COLORS.goldBg,
        borderColor: CHART_COLORS.gold,
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: chartOptions('ml', false)
  });

  // ④ 공복시간 — 막대 그래프
  charts.fasting = new Chart(document.getElementById('chartFasting'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '공복(h)',
        data: days.map(d => getVal(d,'fasting')),
        backgroundColor: 'rgba(245,158,11,0.2)',
        borderColor: '#f59e0b',
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: chartOptions('h', false)
  });

  // ⑤ 컨디션 변화 — 선 그래프
  charts.condition = new Chart(document.getElementById('chartCondition'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '컨디션',
        data: days.map(d => getVal(d, 'condition')),
        borderColor: CHART_COLORS.gold,
        backgroundColor: CHART_COLORS.goldBg,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: CHART_COLORS.gold,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderWidth: 2.5,
      }]
    },
    options: {
      ...lineChartOptions(''),
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { maxRotation: 0, font: { size: 10 } } },
        y: { min: 0, max: 5, ticks: { stepSize: 1, font: { size: 10 }, callback: v => v === 0 ? '' : ['','😔','😕','😊','😄','🤩'][v] || v }, grid: { color: 'rgba(0,0,0,0.04)' } }
      }
    }
  });

  // ⑥ 체중 변화
  const weightData = userRecords.filter(r => r.weight > 0).slice(-30);
  if (weightData.length > 0) {
    charts.weight = new Chart(document.getElementById('chartWeight'), {
      type: 'line',
      data: {
        labels: weightData.map(r => formatDateShort(r.date)),
        datasets: [{
          label: '체중(kg)',
          data: weightData.map(r => r.weight),
          borderColor: CHART_COLORS.primary,
          backgroundColor: CHART_COLORS.primaryBg,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: CHART_COLORS.primary,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        }]
      },
      options: lineChartOptions('kg')
    });
  } else {
    const wrap = document.getElementById('weightChartWrap');
    if (wrap) wrap.innerHTML = `
      <div class="chart-no-data">
        <div class="no-data-icon">⚖️</div>
        <span>체중 데이터가 없습니다</span>
      </div>
    `;
  }

  // ⑦ 개인 운동 누적 막대
  const customCanvas = document.getElementById('chartCustomEx');
  if (customCanvas) {
    const catCfgs = [
      { cat: '유산소', label: '유산소', color: CHART_COLORS.green,   bg: CHART_COLORS.greenBg },
      { cat: '근력',   label: '근력',   color: CHART_COLORS.primary, bg: CHART_COLORS.primaryBg },
      { cat: '유연성', label: '유연성·밸런스', color: CHART_COLORS.purple, bg: CHART_COLORS.purpleBg },
      { cat: '스포츠', label: '스포츠',   color: CHART_COLORS.gold,    bg: CHART_COLORS.goldBg },
    ];
    charts.customEx = new Chart(customCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: catCfgs.map(cfg => ({
          label: cfg.label,
          data: days.map(d => {
            const r = recordMap[d];
            if (!r || !r.customExercises) return 0;
            return r.customExercises
              .filter(ex => ex.category === cfg.cat)
              .reduce((s, ex) => s + (ex.duration || 0), 0);
          }),
          backgroundColor: cfg.bg,
          borderColor: cfg.color,
          borderWidth: 2,
          borderRadius: 4,
        }))
      },
      options: chartOptions('분', true)
    });
  }
}

function chartOptions(unit, stacked) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, padding: 12, font: { size: 11 } }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: ctx => `${ctx.dataset.label}: ${ctx.raw}${unit}`
        }
      }
    },
    scales: {
      x: { stacked, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { maxRotation: 0, font: { size: 10 } } },
      y: { stacked, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } }
    }
  };
}

function lineChartOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, padding: 12, font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 }
      },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.dataset.label}: ${ctx.raw}${unit}`
        }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { maxRotation: 0, font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } }
    }
  };
}

function destroyCharts() {
  for (const key of Object.keys(charts)) {
    if (charts[key]) { charts[key].destroy(); charts[key] = null; }
  }
}

// ─── Filter ───────────────────────────────────────────
function setFilter(section, period) {
  // Toggle button states
  const btn7  = document.getElementById(`${section}Filter7`);
  const btn30 = document.getElementById(`${section}Filter30`);
  if (btn7)  btn7.classList.toggle('active', period === '7');
  if (btn30) btn30.classList.toggle('active', period === '30');

  // Destroy only relevant charts and redraw
  const days = period === '30' ? getLast30Days() : getLast7Days();
  const labels = days.map(d => formatDateShort(d));
  const recordMap = {};
  userRecords.forEach(r => { recordMap[r.date] = r; });
  const getVal = (d, key) => (recordMap[d] ? (recordMap[d][key] || 0) : 0);

  if (section === 'cardio' && charts.cardio) {
    charts.cardio.data.labels = labels;
    charts.cardio.data.datasets[0].data = days.map(d => getVal(d,'walking'));
    charts.cardio.data.datasets[1].data = days.map(d => getVal(d,'running'));
    charts.cardio.update();
  }
  if (section === 'strength' && charts.strength) {
    charts.strength.data.labels = labels;
    charts.strength.data.datasets[0].data = days.map(d => getVal(d,'squats'));
    charts.strength.data.datasets[1].data = days.map(d => getVal(d,'pushups'));
    charts.strength.data.datasets[2].data = days.map(d => getVal(d,'situps'));
    charts.strength.update();
  }
  if (section === 'water' && charts.water) {
    charts.water.data.labels = labels;
    charts.water.data.datasets[0].data = days.map(d => getVal(d,'water'));
    charts.water.update();
  }
  if (section === 'fasting' && charts.fasting) {
    charts.fasting.data.labels = labels;
    charts.fasting.data.datasets[0].data = days.map(d => getVal(d,'fasting'));
    charts.fasting.update();
  }
  if (section === 'condition' && charts.condition) {
    charts.condition.data.labels = labels;
    charts.condition.data.datasets[0].data = days.map(d => getVal(d,'condition'));
    charts.condition.update();
  }
  if (section === 'custom') {
    const catCfgs = ['유산소', '근력', '유연성', '스포츠'];
    if (charts.customEx) {
      charts.customEx.data.labels = labels;
      catCfgs.forEach((cat, i) => {
        charts.customEx.data.datasets[i].data = days.map(d => {
          const r = recordMap[d];
          if (!r || !r.customExercises) return 0;
          return r.customExercises
            .filter(ex => ex.category === cat)
            .reduce((s, ex) => s + (ex.duration || 0), 0);
        });
      });
      charts.customEx.update();
    }
    renderCustomExSummary(period);
  }
}

// ─── Best Records ─────────────────────────────────────
function renderBestRecords() {
  const el = document.getElementById('bestRecordsList');
  if (!el) return;

  const bests = [
    { label: '러닝',   icon: '🏃', key: 'running',  unit: '분' },
    { label: '걷기',   icon: '🚶', key: 'walking',  unit: '분' },
    { label: '스쿼트', icon: '🏋️', key: 'squats',   unit: '회' },
    { label: '푸쉬업', icon: '💪', key: 'pushups',  unit: '회' },
    { label: '윗몸',   icon: '🔄', key: 'situps',   unit: '회' },
  ];

  const medals = ['🥇', '🥈', '🥉', '4위', '5위'];
  const rankClasses = ['rank-1', 'rank-2', 'rank-3', '', ''];

  const cards = bests.map(({ label, icon, key, unit }, idx) => {
    const best = [...userRecords].filter(r => r[key] > 0).sort((a, b) => b[key] - a[key])[0];
    if (!best) {
      return `
        <div class="best-record-item" style="opacity:0.4;">
          <div class="best-record-rank">${medals[idx]}</div>
          <div class="best-record-info">
            <div class="best-record-label">${icon} ${label}</div>
            <div class="best-record-val" style="font-size:1rem; color:var(--text-muted);">-</div>
            <div class="best-record-date">기록 없음</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="best-record-item">
        <div class="best-record-rank ${rankClasses[idx]}">${medals[idx]}</div>
        <div class="best-record-info">
          <div class="best-record-label">${icon} ${label}</div>
          <div class="best-record-val">${best[key]}<span class="best-record-unit"> ${unit}</span></div>
          <div class="best-record-date">${formatDate(best.date, { month: 'numeric', day: 'numeric' })}</div>
        </div>
      </div>
    `;
  });

  el.innerHTML = cards.join('');
}

// ─── Recent Activity ──────────────────────────────────
function renderRecentActivity() {
  const el = document.getElementById('activityList');
  if (!el) return;

  const recent = [...userRecords].reverse().slice(0, 7);

  if (!recent.length) {
    el.innerHTML = '<div class="chart-no-data"><div class="no-data-icon">📋</div><span>최근 활동이 없습니다</span></div>';
    return;
  }

  el.innerHTML = recent.map(r => {
    const parts = [];
    if (r.walking)  parts.push(`걷기 ${r.walking}분`);
    if (r.running)  parts.push(`러닝 ${r.running}분`);
    if (r.squats)   parts.push(`스쿼트 ${r.squats}회`);
    if (r.pushups)  parts.push(`푸쉬업 ${r.pushups}회`);
    if (r.situps)   parts.push(`윗몸 ${r.situps}회`);
    if (r.water)    parts.push(`수분 ${r.water}ml`);
    if (r.fasting)  parts.push(`공복 ${r.fasting}h`);
    const cond = r.condition || 3;
    const emojis = ['','😔','😕','😊','😄','🤩'];

    return `
      <a class="activity-row" href="history.html">
        <div class="activity-dot"></div>
        <div class="activity-date">${formatDate(r.date, { month: 'short', day: 'numeric', weekday: 'short' })}</div>
        <div class="activity-summary">${parts.slice(0, 4).join(' · ')}</div>
        <div class="activity-cond">${emojis[cond]}</div>
      </a>
    `;
  }).join('');
}

// ─── Helpers ──────────────────────────────────────────
function sum(arr, key)  { return arr.reduce((a, r) => a + (r[key] || 0), 0); }
function avg(arr, key)  { return arr.length ? sum(arr, key) / arr.length : 0; }
function getConditionEmoji(val) {
  if (isNaN(val)) return '';
  const emojis = ['', '😔', '😕', '😊', '😄', '🤩'];
  return emojis[Math.round(val)] || '';
}

// ─── Custom Exercise Summary Panel ────────────────────
function renderCustomExSummary(period) {
  const el = document.getElementById('customExSummary');
  if (!el) return;

  const days = period === '30' ? getLast30Days() : getLast7Days();
  const days30 = getLast30Days(); // 전체 집계용

  // 기간 내 카테고리별 집계
  const cats = [
    { key: '유산소',  icon: '🏊', color: '#22c55e' },
    { key: '근력',    icon: '🏋️', color: '#004680' },
    { key: '유연성',  icon: '🧘', color: '#8b5cf6' },
    { key: '스포츠',  icon: '⚽', color: '#DDCA4B' },
  ];

  const recordMap = {};
  userRecords.forEach(r => { recordMap[r.date] = r; });

  // 기간별 카테고리 합산
  const catTotals = {};
  const catFreq   = {}; // 운동한 날 수
  cats.forEach(c => { catTotals[c.key] = 0; catFreq[c.key] = 0; });

  days.forEach(d => {
    const r = recordMap[d];
    if (!r || !r.customExercises) return;
    const found = new Set();
    r.customExercises.forEach(ex => {
      catTotals[ex.category] = (catTotals[ex.category] || 0) + (ex.duration || 0);
      found.add(ex.category);
    });
    found.forEach(cat => { catFreq[cat] = (catFreq[cat] || 0) + 1; });
  });

  const totalMins = Object.values(catTotals).reduce((a, b) => a + b, 0);

  // 인기 종목 Top5 (전체 기간)
  const exFreqMap = {};
  userRecords.forEach(r => {
    if (!r.customExercises) return;
    r.customExercises.forEach(ex => {
      if (!ex.name) return;
      exFreqMap[ex.name] = (exFreqMap[ex.name] || 0) + 1;
    });
  });
  const topExercises = Object.entries(exFreqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (totalMins === 0) {
    el.innerHTML = `
      <div class="chart-no-data" style="height:160px;">
        <div class="no-data-icon">🏅</div>
        <span>개인 운동 기록이 없습니다</span>
      </div>
    `;
    return;
  }

  const catRows = cats.map(c => {
    const mins = catTotals[c.key] || 0;
    const pct  = totalMins ? Math.round((mins / totalMins) * 100) : 0;
    const freq = catFreq[c.key] || 0;
    if (!mins) return '';
    return `
      <div style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-size:0.82rem; font-weight:700; color:var(--text);">${c.icon} ${c.key}</span>
          <span style="font-size:0.78rem; color:var(--text-secondary);">${mins}분 · ${freq}일</span>
        </div>
        <div style="background:var(--border); border-radius:100px; height:7px; overflow:hidden;">
          <div style="height:100%; border-radius:100px; background:${c.color}; width:${pct}%;
            transition:width 0.6s cubic-bezier(0.4,0,0.2,1);"></div>
        </div>
        <div style="font-size:0.68rem; color:var(--text-muted); text-align:right; margin-top:2px;">${pct}%</div>
      </div>
    `;
  }).filter(Boolean).join('');

  const topRows = topExercises.length ? `
    <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border);">
      <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;
        letter-spacing:0.05em; margin-bottom:8px;">자주 한 운동</div>
      ${topExercises.map(([name, cnt], i) => `
        <div style="display:flex; align-items:center; justify-content:space-between;
          padding:4px 0; font-size:0.8rem;">
          <span style="color:var(--text);">${['🥇','🥈','🥉','④','⑤'][i]} ${name}</span>
          <span style="color:var(--text-secondary); font-weight:600;">${cnt}회</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  // border/배경은 el 자체에 적용되어 있으므로 내부엔 wrapper 없이 바로 콘텐츠
  el.innerHTML = `
    <div style="font-size:0.82rem; font-weight:700; color:var(--text-secondary); margin-bottom:14px;">
      📊 카테고리별 운동 시간
      <span style="float:right; color:var(--primary); font-size:0.78rem;">총 ${totalMins}분</span>
    </div>
    ${catRows}
    ${topRows}
  `;
}

// ─── Weight No-data handler (called from drawCharts) ──
(function patchWeightNoData() {
  const orig = window.drawCharts;
  // WeightChartWrap no-data is handled inside drawCharts already
})();
