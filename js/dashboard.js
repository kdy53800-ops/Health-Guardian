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
  primary:    '#004DBF',
  primaryBg:  'rgba(0,77,191,0.15)',
  gold:       '#0099FF',
  goldBg:     'rgba(0,153,255,0.2)',
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
  if (typeof Auth.checkAndRestoreSession === 'function') {
    await Auth.checkAndRestoreSession();
  }
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
        <p class="subtitle" id="navUsername2">${escapeHtml(currentUser.name)}님의 건강 통계</p>
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

  const last7Days = getLast7Days();
  const todayStr = today();
  const yesterdayStr = prevDay(todayStr);
  const streak = calcStreak(userRecords);
  const todayRecord = userRecords.find(r => r.date === todayStr);
  const yesterdayRecord = userRecords.find(r => r.date === yesterdayStr);

  const isFirstDay = (new Date().getDate() === 1);
  const rankingTitle = isFirstDay ? '지난달의 명예의 전당' : '이달의 명예의 전당';
  const rankingSubtitle = isFirstDay
    ? '지난달 활동이 가장 활발했던 분들을 소개합니다!'
    : '이번 달 활동이 가장 활발한 분들을 소개합니다! (하루 전날 기록 기준)';

  // 최근 7일 합계 및 평균 (Recent 7 days Totals & Averages)
  const weekRecords = userRecords.filter(r => last7Days.includes(r.date));
  const weekWalking = sum(weekRecords, 'walking');
  const weekRunning = sum(weekRecords, 'running');
  const weekCardio  = weekWalking + weekRunning;
  const avgWeekCardio = weekRecords.length ? Math.round(weekCardio / weekRecords.length) : 0;

  const avgWater    = weekRecords.length ? Math.round(avg(weekRecords, 'water')) : 0;
  const avgCondition = weekRecords.length ? (avg(weekRecords, 'condition')).toFixed(1) : '-';
  const personalReport = buildPersonalReport(streak);

  // 어제 목표 달성률 계산 (Walking, Running, CustomEx, Water, Fasting)
  let yesterdayPct = 0;
  if (yesterdayRecord) {
    const goals = userGoals || GoalDefaults;
    const checks = [
      (yesterdayRecord.walking || 0) >= (goals.walking || 1),
      (yesterdayRecord.running || 0) >= (goals.running || 1),
    ];
    // 목표가 설정된 경우만 체크리스트에 추가
    if (goals.customEx > 0) {
      const customTotal = (yesterdayRecord.customExercises || []).reduce((s, ex) => s + (ex.duration || 0), 0);
      checks.push(customTotal >= goals.customEx);
    }
    if (goals.water > 0)   checks.push((yesterdayRecord.water || 0) >= goals.water);
    if (goals.fasting > 0) checks.push((yesterdayRecord.fasting || 0) >= goals.fasting);

    yesterdayPct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  main.innerHTML = `
    <!-- Page Header -->
    <div class="page-header">
      <h1><div class="page-icon">📊</div> 대시보드</h1>
      <p class="subtitle">${escapeHtml(currentUser.name)}님의 건강 통계 &nbsp;·&nbsp; 총 <strong>${userRecords.length}일</strong> 기록</p>
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

    ${renderPersonalReport(personalReport)}

    <!-- Ranking Top 5 -->
    <div class="section-header mb-12">
      <h2 style="font-size:1.1rem; font-weight:800; display:flex; align-items:center; gap:8px;">
        <span style="font-size:1.4rem;">🏆</span> ${rankingTitle}
        <span style="font-size:0.8rem; font-weight:500; color:var(--text-muted); margin-left:4px;">${rankingSubtitle}</span>
      </h2>
    </div>
    <div class="grid-2 mb-20">
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">🏆 ${rankingTitle}: 총 출석일 수</div>
        </div>
        <div class="chart-card-body" id="rankingAttendance">
          <div class="chart-no-data">데이터를 불러오는 중...</div>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">🔥 ${rankingTitle}: 총 운동 시간</div>
        </div>
        <div class="chart-card-body" id="rankingExercise">
          <div class="chart-no-data">데이터를 불러오는 중...</div>
        </div>
      </div>
    </div>

    <!-- Weekly Check -->
    <div class="chart-card mb-20">
      <div class="chart-card-header">
        <div class="chart-card-title">📅 최근 7일 기록 현황</div>
      </div>
      <div class="chart-card-body">
        <div class="week-grid" id="weekGrid"></div>
      </div>
    </div>

    <!-- Hero Stats -->
    <div class="hero-stats-grid mb-20">
      <div class="stat-card">
        <div class="stat-card-label">최근 7일 평균 걷기&러닝</div>
        <div class="stat-card-value">${avgWeekCardio}<span class="stat-card-unit">분</span></div>
        <div class="stat-card-sub">최근 7일 총 ${weekCardio}분 / ${weekRecords.length}일</div>
        <div class="stat-card-icon">🏃</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-card-label">최근 7일 평균 수분</div>
        <div class="stat-card-value">${avgWater}<span class="stat-card-unit">ml</span></div>
        <div class="stat-card-sub">최근 7일 ${weekRecords.length}일 평균</div>
        <div class="stat-card-icon">💧</div>
      </div>
    </div>

    <!-- Yesterday's Goals Rings -->
    <div class="chart-card mb-20">
      <div class="chart-card-header">
        <div class="chart-card-title">🎯 어제의 목표 달성률</div>
      </div>
      <div class="chart-card-body">
        <div class="goal-rings-grid" id="goalRingsGrid"></div>
      </div>
    </div>

    <!-- Total Exercise Chart (전체 너비) -->
    <div class="chart-card mb-20">
      <div class="chart-card-header">
        <div class="chart-card-title">🔥 총 운동 시간 추이</div>
        <div class="filter-btns">
          <button class="filter-btn active" id="totalExFilter7" onclick="setFilter('totalEx','7')">7일</button>
          <button class="filter-btn" id="totalExFilter30" onclick="setFilter('totalEx','30')">30일</button>
        </div>
      </div>
      <div class="chart-card-body">
        <div class="chart-wrap"><canvas id="chartTotalEx"></canvas></div>
      </div>
    </div>

    <!-- Weight Chart (전체 너비) - 위치 이동 -->
    <div class="chart-card mb-20">
      <div class="chart-card-header">
        <div class="chart-card-title">⚖️ 체중 변화</div>
        <div class="filter-btns">
          <button class="filter-btn active" id="weightFilter7" onclick="setFilter('weight','7')">7일</button>
          <button class="filter-btn" id="weightFilter30" onclick="setFilter('weight','30')">30일</button>
        </div>
      </div>
      <div class="chart-card-body">
        <div id="weightChartWrap" class="chart-wrap"><canvas id="chartWeight"></canvas></div>
      </div>
    </div>

    <!-- Heart Rate Chart (전체 너비) -->
    <div class="chart-card mb-20">
      <div class="chart-card-header">
        <div class="chart-card-title">❤️ 심박수 변화</div>
        <div class="filter-btns">
          <button class="filter-btn active" id="heartRateFilter7" onclick="setFilter('heartRate','7')">7일</button>
          <button class="filter-btn" id="heartRateFilter30" onclick="setFilter('heartRate','30')">30일</button>
        </div>
      </div>
      <div class="chart-card-body">
        <div id="heartRateChartWrap" class="chart-wrap"><canvas id="chartHeartRate"></canvas></div>
      </div>
    </div>

    <!-- Charts Row: 걷기&러닝 (선 그래프) -->
    <div class="mb-20">
      <!-- Cardio Line Chart -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">🏃 걷기&러닝 추이</div>
          <div class="filter-btns">
            <button class="filter-btn active" id="cardioFilter7" onclick="setFilter('cardio','7')">7일</button>
            <button class="filter-btn" id="cardioFilter30" onclick="setFilter('cardio','30')">30일</button>
          </div>
        </div>
        <div class="chart-card-body">
          <div class="chart-wrap"><canvas id="chartCardio"></canvas></div>
        </div>
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
            <button class="filter-btn active" id="conditionFilter7" onclick="setFilter('condition','7')">7일</button>
            <button class="filter-btn" id="conditionFilter30" onclick="setFilter('condition','30')">30일</button>
          </div>
        </div>
        <div class="chart-card-body">
          <div class="chart-wrap"><canvas id="chartCondition"></canvas></div>
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

  renderWeekGrid(getLast7Days(), todayStr);
  renderYesterdayGoalRings(yesterdayRecord);
  drawCharts('7');
  renderRecentActivity();
  renderCustomExSummary('7');
  fetchAndRenderRanking();
  loadInbodyReport();
}

function recordExerciseMinutes(record) {
  const custom = (record.customExercises || []).reduce((total, exercise) => total + (Number(exercise.duration) || 0), 0);
  return (Number(record.walking) || 0) + (Number(record.running) || 0) + custom;
}

function recordsBetween(start, end) {
  return userRecords.filter(record => record.date >= start && record.date <= end);
}

function shiftDate(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateStr(date);
}

function goalAchievement(record) {
  const goals = userGoals || GoalDefaults;
  const checks = [];
  if (goals.walking > 0) checks.push((Number(record.walking) || 0) >= goals.walking);
  if (goals.running > 0) checks.push((Number(record.running) || 0) >= goals.running);
  if (goals.water > 0) checks.push((Number(record.water) || 0) >= goals.water);
  if (goals.fasting > 0) checks.push((Number(record.fasting) || 0) >= goals.fasting);
  if (goals.customEx > 0) {
    const custom = (record.customExercises || []).reduce((total, exercise) => total + (Number(exercise.duration) || 0), 0);
    checks.push(custom >= goals.customEx);
  }
  return checks.length ? Math.round(checks.filter(Boolean).length / checks.length * 100) : 0;
}

function buildPersonalReport(streak) {
  const end = today();
  const recent7 = recordsBetween(shiftDate(end, -6), end);
  const previous7 = recordsBetween(shiftDate(end, -13), shiftDate(end, -7));
  const recent30 = recordsBetween(shiftDate(end, -29), end);
  const recentMinutes = recent7.reduce((total, record) => total + recordExerciseMinutes(record), 0);
  const previousMinutes = previous7.reduce((total, record) => total + recordExerciseMinutes(record), 0);
  const exerciseChange = previousMinutes > 0 ? Math.round((recentMinutes - previousMinutes) / previousMinutes * 100) : null;
  const goalRate = recent7.length ? Math.round(recent7.reduce((total, record) => total + goalAchievement(record), 0) / recent7.length) : 0;
  const weights = recent30.filter(record => Number(record.weight) > 0);
  const weightChange = weights.length > 1 ? Number((weights[weights.length - 1].weight - weights[0].weight).toFixed(1)) : null;
  const strengthMinutes = recent7.reduce((total, record) => total + (record.customExercises || [])
    .filter(exercise => exercise.category === '근력')
    .reduce((sum, exercise) => sum + (Number(exercise.duration) || 0), 0), 0);

  const insights = [];
  if (!recent7.length) insights.push('최근 7일 기록이 없습니다. 오늘 가능한 활동부터 가볍게 기록해 보세요.');
  else if (exerciseChange != null && exerciseChange >= 10) insights.push(`최근 7일 운동 시간이 직전 7일보다 ${exerciseChange}% 늘었습니다. 현재 흐름을 이어가 보세요.`);
  else if (exerciseChange != null && exerciseChange <= -20) insights.push(`최근 7일 운동 시간이 직전 7일보다 ${Math.abs(exerciseChange)}% 줄었습니다. 부담 없는 활동부터 다시 시작해 보세요.`);
  else insights.push(`최근 7일 동안 ${recent7.length}일, 총 ${recentMinutes}분의 활동을 기록했습니다.`);
  if (recent7.length >= 3 && strengthMinutes === 0) insights.push('걷기·러닝 기록에 비해 근력 운동 기록이 없습니다. 생활 패턴에 맞는 근력 활동도 함께 기록해 보세요.');
  else if (goalRate >= 80) insights.push(`최근 7일 평균 목표 달성률이 ${goalRate}%입니다. 꾸준한 기록 습관이 잘 이어지고 있습니다.`);
  else insights.push('목표 달성률은 개인 목표 설정값을 기준으로 계산됩니다. 부담되면 기록 화면에서 목표를 조정할 수 있습니다.');

  const thisMonth = end.slice(0, 7);
  const currentMonthRecords = userRecords.filter(record => record.date.startsWith(thisMonth));
  const currentMonthMinutes = currentMonthRecords.reduce((total, record) => total + recordExerciseMinutes(record), 0);
  const endDate = new Date(`${end}T00:00:00`);
  const date = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
  const previousMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const previousMonthLastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const comparisonDay = Math.min(new Date(`${end}T00:00:00`).getDate(), previousMonthLastDay);
  const previousMonthCutoff = `${previousMonth}-${String(comparisonDay).padStart(2, '0')}`;
  const previousMonthMinutes = userRecords.filter(record => record.date.startsWith(previousMonth) && record.date <= previousMonthCutoff).reduce((total, record) => total + recordExerciseMinutes(record), 0);
  const monthChange = previousMonthMinutes ? Math.round((currentMonthMinutes - previousMonthMinutes) / previousMonthMinutes * 100) : null;
  const monthlyGoalRate = currentMonthRecords.length ? Math.round(currentMonthRecords.reduce((total, record) => total + goalAchievement(record), 0) / currentMonthRecords.length) : 0;
  const recentBest = recent7.reduce((best, record) => Math.max(best, recordExerciseMinutes(record)), 0);
  const olderBest = userRecords.filter(record => record.date < shiftDate(end, -6)).reduce((best, record) => Math.max(best, recordExerciseMinutes(record)), 0);
  const weeklyPersonalBest = recentBest > 0 && recentBest >= olderBest;

  return { recent7, recent30, recentMinutes, goalRate, monthlyGoalRate, weightChange, exerciseChange, monthChange, insights, streak, weeklyPersonalBest };
}

function renderPersonalReport(report) {
  const changeText = report.exerciseChange == null ? '비교 기록 필요' : `${report.exerciseChange >= 0 ? '+' : ''}${report.exerciseChange}%`;
  const weightText = report.weightChange == null ? '측정 2회 필요' : `${report.weightChange > 0 ? '+' : ''}${report.weightChange}kg`;
  const monthText = report.monthChange == null ? '지난달 기록 필요' : `${report.monthChange >= 0 ? '+' : ''}${report.monthChange}%`;
  const badges = [
    { icon:'🌱', label:'첫 기록', earned:userRecords.length >= 1 },
    { icon:'🔥', label:'7일 연속', earned:report.streak >= 7 },
    { icon:'🎯', label:'이달 목표 80%', earned:report.monthlyGoalRate >= 80 },
    { icon:'🏃', label:'주 150분', earned:report.recentMinutes >= 150 },
    { icon:'🏅', label:'이번 주 개인 최고', earned:report.weeklyPersonalBest },
  ];
  return `
    <section class="personal-report" aria-labelledby="personalReportTitle">
      <div class="report-heading"><div><h2 id="personalReportTitle">📋 나의 건강 리포트</h2><p>최근 기록을 생활 습관 관점에서 정리했어요.</p></div><div class="report-actions"><span class="report-period">최근 7일 · 30일</span><button type="button" class="report-action" onclick="exportPersonalRecords()">CSV 저장</button><button type="button" class="report-action" onclick="printPersonalReport()">PDF·인쇄</button></div></div>
      <div class="report-metrics">
        <div class="report-metric"><div class="report-metric-label">7일 운동 시간</div><div class="report-metric-value">${report.recentMinutes.toLocaleString()}분</div><div class="report-metric-note">직전 7일 대비 ${changeText}</div></div>
        <div class="report-metric"><div class="report-metric-label">목표 달성률</div><div class="report-metric-value">${report.goalRate}%</div><div class="report-metric-note">기록한 날의 평균</div></div>
        <div class="report-metric"><div class="report-metric-label">30일 체중 변화</div><div class="report-metric-value">${weightText}</div><div class="report-metric-note">첫 기록과 최근 기록 비교</div></div>
        <div class="report-metric"><div class="report-metric-label">월 운동 변화</div><div class="report-metric-value">${monthText}</div><div class="report-metric-note">지난달 같은 기간 대비</div></div>
      </div>
      <div class="report-insights">${report.insights.map(text => `<div class="report-insight">${escapeHtml(text)}</div>`).join('')}</div>
      <div class="achievement-badges" aria-label="나의 성취 배지">${badges.map(badge => `<span class="achievement-badge ${badge.earned ? 'earned' : ''}" aria-label="${badge.label} ${badge.earned ? '달성' : '미달성'}"><span aria-hidden="true">${badge.earned ? badge.icon : '○'}</span>${badge.label}</span>`).join('')}</div>
      <div class="inbody-report" id="inbodyReport" role="status">체성분 변화 기록을 확인하는 중입니다.</div>
      <p class="report-disclaimer">이 리포트는 입력 기록의 변화와 생활 습관을 요약하며 의료적 진단이나 치료 판단을 제공하지 않습니다.</p>
    </section>`;
}

function exportPersonalRecords() {
  const rows = userRecords.map(record => [
    record.date, record.weight || '', record.walking || 0, record.running || 0,
    recordExerciseMinutes(record), record.water || 0, record.fasting || 0,
    record.heartRate || '', record.condition || 3, record.memo || ''
  ]);
  downloadCsvFile(`건강지킴이_${today()}_개인기록.csv`, [
    ['날짜','체중(kg)','걷기(분)','러닝(분)','총 운동(분)','수분(ml)','공복(시간)','심박수(bpm)','컨디션(1-5)','메모'],
    ...rows
  ]);
}

function printPersonalReport() {
  document.body.classList.add('print-personal-report');
  window.print();
  setTimeout(() => document.body.classList.remove('print-personal-report'), 500);
}

async function loadInbodyReport() {
  const target = document.getElementById('inbodyReport');
  if (!target) return;
  try {
    const response = await fetch(new URL('api/inbody-data', window.location.href).toString(), { credentials:'include', headers:{Accept:'application/json'} });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !Array.isArray(payload.records) || payload.records.length < 2) {
      target.textContent = '체성분 변화 비교는 인바디 측정 기록이 2회 이상일 때 표시됩니다.';
      return;
    }
    const records = [...payload.records].sort((a,b) => String(a.record_date).localeCompare(String(b.record_date)));
    const first = records[0], latest = records[records.length - 1];
    const delta = (key, unit) => {
      const change = Number(latest[key]) - Number(first[key]);
      return Number.isFinite(change) ? `${change > 0 ? '+' : ''}${change.toFixed(1)}${unit}` : '-';
    };
    target.textContent = `인바디 첫 측정 대비 최근 변화: 체중 ${delta('weight','kg')}, 골격근량 ${delta('skeletal_muscle','kg')}, 체지방률 ${delta('body_fat_percent','%')}`;
  } catch (error) {
    target.textContent = '체성분 변화 기록을 불러오지 못했습니다. 인바디 화면에서 다시 확인해 주세요.';
  }
}

// ─── Week Grid (최근 7일 동적 요일) ───────────────────────
function renderWeekGrid(weekDays, todayStr) {
  const grid = document.getElementById('weekGrid');
  if (!grid) return;

  grid.innerHTML = weekDays.map((dateStr, idx) => {
    const hasRecord = userRecords.some(r => r.date === dateStr);
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const d = new Date(dateStr + 'T00:00:00');
    const dateNum = d.getDate();
    const dayLabel = dayOfWeek(dateStr);

    // 일요일은 빨간색, 토요일은 파란색
    const labelStyle = dayLabel === '일' ? 'color:#ef4444' : dayLabel === '토' ? 'color:#3b82f6' : '';

    return `
      <div class="week-day">
        <div class="week-day-label" style="${labelStyle}">${dayLabel}</div>
        <div class="week-day-dot ${hasRecord ? 'done' : ''} ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}">
          ${hasRecord ? '✓' : dateNum}
        </div>
        <div class="week-date-label">${dateNum}일</div>
      </div>
    `;
  }).join('');
}

// ─── Goal Rings (어제 기준) ───────────────────────────────
function renderYesterdayGoalRings(yesterdayRecord) {
  const grid = document.getElementById('goalRingsGrid');
  if (!grid) return;

  const ringConfigs = [
    { key: 'walking',  label: '걷기',   unit: '분',   color: CHART_COLORS.green },
    { key: 'running',  label: '러닝',   unit: '분',   color: CHART_COLORS.primary },
    { key: 'customEx', label: '개인운동(총)', unit: '분', color: CHART_COLORS.purple },
    { key: 'water',    label: '수분',   unit: 'ml',   color: CHART_COLORS.gold },
    { key: 'fasting',  label: '공복',   unit: 'h',    color: '#f59e0b' },
  ];

  grid.innerHTML = '';

  ringConfigs.forEach((cfg, idx) => {
    let val = 0;
    if (cfg.key === 'customEx') {
      if (yesterdayRecord && yesterdayRecord.customExercises) {
        val = yesterdayRecord.customExercises.reduce((s, ex) => s + (ex.duration || 0), 0);
      }
    } else {
      val = yesterdayRecord ? (yesterdayRecord[cfg.key] || 0) : 0;
    }

    const goal = userGoals ? (userGoals[cfg.key] || 0) : 0;
    
    // 필수 항목(걷기/러닝/개인운동)은 항상 표시
    // 수분/공복은 목표가 0이면 표시 안함 (원하면 조건 삭제 가능)
    if (goal <= 0 && (cfg.key === 'water' || cfg.key === 'fasting')) return;

    const displayGoal = goal || (cfg.key === 'customEx' ? 30 : 1);
    const pct = Math.min(Math.round((val / displayGoal) * 100), 100);
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

  // ⓪ 총 운동 시간 추이 — 선 그래프
  const totalExData = days.map(d => {
    const r = recordMap[d];
    if (!r) return 0;
    const walking = r.walking || 0;
    const running = r.running || 0;
    const customEx = (r.customExercises || []).reduce((s, ex) => s + (ex.duration || 0), 0);
    return walking + running + customEx;
  });

  const totalExCanvas = document.getElementById('chartTotalEx');
  if (totalExCanvas) {
    charts.totalEx = new Chart(totalExCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          lineDataset('총 운동 시간(분)', totalExData, CHART_COLORS.purple, CHART_COLORS.purpleBg)
        ]
      },
      options: lineChartOptions('분')
    });
  }

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
  const weightData = days.map(d => {
    const r = recordMap[d];
    return (r && r.weight > 0) ? r.weight : null; // weight가 0이면 null로 처리하여 그래프가 끊기게 하거나 이전값 유지 고려
  });

  // null이 아닌 데이터가 하나라도 있어야 그림
  if (weightData.some(v => v !== null)) {
    charts.weight = new Chart(document.getElementById('chartWeight'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '체중(kg)',
          data: weightData,
          borderColor: CHART_COLORS.primary,
          backgroundColor: CHART_COLORS.primaryBg,
          fill: true,
          tension: 0.4,
          spanGaps: true, // 데이터가 없는 날은 선으로 이어줌
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

  // ⑥.5 심박수 변화
  const heartRateData = days.map(d => {
    const r = recordMap[d];
    return (r && r.heartRate > 0) ? r.heartRate : null;
  });

  if (heartRateData.some(v => v !== null)) {
    charts.heartRate = new Chart(document.getElementById('chartHeartRate'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '심박수(bpm)',
          data: heartRateData,
          borderColor: CHART_COLORS.red,
          backgroundColor: CHART_COLORS.redBg,
          fill: true,
          tension: 0.4,
          spanGaps: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: CHART_COLORS.red,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        }]
      },
      options: lineChartOptions('bpm')
    });
  } else {
    const wrap = document.getElementById('heartRateChartWrap');
    if (wrap) wrap.innerHTML = `
      <div class="chart-no-data">
        <div class="no-data-icon">❤️</div>
        <span>심박수 데이터가 없습니다</span>
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
  if (section === 'totalEx' && charts.totalEx) {
    charts.totalEx.data.labels = labels;
    charts.totalEx.data.datasets[0].data = days.map(d => {
      const r = recordMap[d];
      if (!r) return 0;
      const walking = r.walking || 0;
      const running = r.running || 0;
      const customEx = (r.customExercises || []).reduce((s, ex) => s + (ex.duration || 0), 0);
      return walking + running + customEx;
    });
    charts.totalEx.update();
  }
  if (section === 'weight' && charts.weight) {
    charts.weight.data.labels = labels;
    charts.weight.data.datasets[0].data = days.map(d => {
      const v = getVal(d, 'weight');
      return v > 0 ? v : null;
    });
    charts.weight.update();
  }
  if (section === 'heartRate' && charts.heartRate) {
    charts.heartRate.data.labels = labels;
    charts.heartRate.data.datasets[0].data = days.map(d => {
      const v = getVal(d, 'heartRate');
      return v > 0 ? v : null;
    });
    charts.heartRate.update();
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

// (Best Records removed)

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
    if (r.water)    parts.push(`수분 ${r.water}ml`);
    if (r.fasting)  parts.push(`공복 ${r.fasting}h`);
    if (r.heartRate) parts.push(`심박수 ${r.heartRate}bpm`);
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
    { key: '근력',    icon: '🏋️', color: '#004DBF' },
    { key: '유연성',  icon: '🧘', color: '#8b5cf6' },
    { key: '스포츠',  icon: '⚽', color: '#0099FF' },
  ];

  const recordMap = {};
  userRecords.forEach(r => { recordMap[r.date] = r; });

  // 기간 내 카테고리별 및 운동별 집계
  const catTotals = {};
  const catFreq   = {}; // 운동한 날 수
  const exFreqMap = {}; // 운동별 횟수
  cats.forEach(c => { catTotals[c.key] = 0; catFreq[c.key] = 0; });

  // 선택된 기간(days) 내에 포함되는 기록들만 필터링
  const filteredRecords = userRecords.filter(r => days.includes(r.date));

  filteredRecords.forEach(r => {
    if (!r.customExercises) return;
    const foundInDay = new Set();
    r.customExercises.forEach(ex => {
      // 카테고리별 시간 합산
      catTotals[ex.category] = (catTotals[ex.category] || 0) + (ex.duration || 0);
      foundInDay.add(ex.category);
      
      // 운동별 횟수 합산 (자주 한 운동용)
      if (ex.name) {
        exFreqMap[ex.name] = (exFreqMap[ex.name] || 0) + 1;
      }
    });
    // 카테고리별 빈도(일수) 계산
    foundInDay.forEach(cat => { catFreq[cat] = (catFreq[cat] || 0) + 1; });
  });

  const totalMins = Object.values(catTotals).reduce((a, b) => a + b, 0);

  // 인기 종목 Top5 정렬
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
          <span style="color:var(--text);">${['🥇','🥈','🥉','④','⑤'][i]} ${escapeHtml(name)}</span>
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

// ─── Ranking ──────────────────────────────────────────
async function fetchAndRenderRanking() {
  const elAtt = document.getElementById('rankingAttendance');
  const elExe = document.getElementById('rankingExercise');
  if (!elAtt || !elExe) return;

  // 당월 본인 로컬 기록 계산 (서버 랭킹에 본인이 없거나 로컬 테스트 계정인 경우를 대비한 폴백)
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  let targetYear = year;
  let targetMonth = month;
  if (day === 1) {
    if (month === 1) {
      targetYear = year - 1;
      targetMonth = 12;
    } else {
      targetMonth = month - 1;
    }
  }

  const startOfMonth = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const todayStr = today(); // from app.js

  const thisMonthRecords = userRecords.filter(r => r.date >= startOfMonth && r.date < todayStr);
  const localAttendanceVal = thisMonthRecords.length;
  let localExerciseVal = 0;
  thisMonthRecords.forEach(r => {
    localExerciseVal += (Number(r.walking) || 0) + (Number(r.running) || 0);
    if (Array.isArray(r.customExercises)) {
      r.customExercises.forEach(ex => {
        localExerciseVal += (Number(ex.duration) || 0);
      });
    }
  });

  try {
    const res = await fetch(new URL('api/ranking', window.location.href).toString());
    const data = await res.json();
    if (!data.ok) throw new Error(data.message);

    const renderList = (items, unit, myRankData, localFallbackVal) => {
      if (!items.length) return '<div class="chart-no-data">순위 정보가 없습니다.</div>';
      
      const listHtml = items.map((u, i) => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border-light);">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-weight:800; color:${i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#b45309':'var(--text-muted)'}; width:20px;">${i+1}</span>
            <span style="font-weight:700; color:var(--text);">${escapeHtml(u.name)}</span>
          </div>
          <div style="font-weight:800; color:var(--primary);">${u.value.toLocaleString()}<span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;"> ${unit}</span></div>
        </div>
      `).join('');

      let myRankStr = '-';
      let myVal = localFallbackVal;
      if (myRankData && myRankData.rank !== '-') {
        myRankStr = `${myRankData.rank}위`;
        myVal = myRankData.value;
      }

      // 5위 리스트 하단에 구분선 점선(dashed)을 긋고 본인의 랭킹 및 기록을 강조 표시
      const myRankHtml = `
        <div style="margin: 12px 0 0; border-top: 1px dashed var(--border); padding-top: 12px;">
          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background: rgba(0,77,191,0.03); border-radius: 8px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-weight:800; color:var(--primary); font-size: 0.85rem;">내 순위</span>
              <span style="font-weight:700; color:var(--text); font-size: 0.9rem;">${currentUser ? currentUser.name : '본인'} (본인)</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">${myRankStr}</span>
              <span style="font-weight:800; color:var(--primary); font-size: 0.95rem;">${myVal.toLocaleString()}<span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;"> ${unit}</span></span>
            </div>
          </div>
        </div>
      `;

      return listHtml + myRankHtml;
    };

    elAtt.innerHTML = renderList(data.topAttendance, '일', data.myAttendance, localAttendanceVal);
    elExe.innerHTML = renderList(data.topExercise, '분', data.myExercise, localExerciseVal);
  } catch (err) {
    console.error('[RankingRender]', err);
    elAtt.innerHTML = '<div class="chart-no-data">랭킹을 불러오지 못했습니다.</div>';
    elExe.innerHTML = '<div class="chart-no-data">랭킹을 불러오지 못했습니다.</div>';
  }
}

// ─── Weight No-data handler (called from drawCharts) ──
(function patchWeightNoData() {
  const orig = window.drawCharts;
  // WeightChartWrap no-data is handled inside drawCharts already
})();
