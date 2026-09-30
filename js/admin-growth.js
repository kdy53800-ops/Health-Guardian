let allUsers = [];
let allRecords = [];
let metricChartInstances = [];

const customMinutes = record => (record.customExercises || []).reduce((sum, exercise) => sum + (Number(exercise.duration) || 0), 0);
const positiveNumber = value => {
  const number = Number(value);
  return value == null || value === '' || !Number.isFinite(number) || number <= 0 ? null : number;
};
const growthMetrics = [
  { label:'총 운동 시간', unit:'분', digits:0, color:'#0054a6', additive:true, value:record => (Number(record.walking) || 0) + (Number(record.running) || 0) + customMinutes(record) },
  { label:'걷기 시간', unit:'분', digits:0, color:'#008cc6', additive:true, value:record => Number(record.walking) || 0 },
  { label:'러닝 시간', unit:'분', digits:0, color:'#397ab8', additive:true, value:record => Number(record.running) || 0 },
  { label:'개인 운동 시간', unit:'분', digits:0, color:'#7d77b9', additive:true, value:customMinutes },
  { label:'걷기 거리', unit:'km', digits:1, color:'#3c9b9c', additive:true, value:record => Number(record.walkingKm) || 0 },
  { label:'러닝 거리', unit:'km', digits:1, color:'#4f88a5', additive:true, value:record => Number(record.runningKm) || 0 },
  { label:'체중', unit:'kg', digits:1, color:'#aa7891', value:record => positiveNumber(record.weight) },
  { label:'심박수', unit:'bpm', digits:0, color:'#cf7276', value:record => positiveNumber(record.heartRate) },
  { label:'수분 섭취', unit:'ml', digits:0, color:'#3f92c5', additive:true, value:record => Number(record.water) || 0 },
  { label:'공복시간', unit:'시간', digits:0, color:'#9a72aa', value:record => positiveNumber(record.fasting) },
  { label:'컨디션', unit:'점', digits:0, color:'#a98156', value:record => positiveNumber(record.condition), min:1, max:5 },
];

// 초기 데이터 로드 (admin.js의 fetchAdminData와 유사)
document.addEventListener('DOMContentLoaded', async () => {
  const overlay = document.getElementById('adminLoginOverlay');
  
  // 기본 날짜 설정: 최근 30일
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  
  document.getElementById('growthStartDate').value = start.toISOString().split('T')[0];
  document.getElementById('growthEndDate').value = end.toISOString().split('T')[0];

  try {
    const response = await fetch(new URL('api/admin-data', window.location.href).toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    
    let payload;
    if (!response.ok) {
      if (window.location.protocol === 'file:' || response.status === 404 || response.status === 500) {
        payload = {
          ok: true,
          users: JSON.parse(localStorage.getItem('users') || '[]'),
          records: JSON.parse(localStorage.getItem('records') || '[]')
        };
      } else {
        throw new Error('Failed to fetch');
      }
    } else {
      payload = await response.json();
    }

    if (!payload.ok) throw new Error(payload.message || '데이터 로드 실패');
    
    allUsers = payload.users || [];
    allRecords = payload.records || [];
    
    if (overlay) overlay.style.display = 'none';
    
    const user = Auth.getUser();
    if (user) {
      document.getElementById('navUsername').textContent = user.name || '관리자';
      document.getElementById('navAvatar').textContent = (user.name || 'A').charAt(0).toUpperCase();
    }
  } catch (err) {
    if (window.location.protocol === 'file:' || err.message === 'Failed to fetch') {
      allUsers = JSON.parse(localStorage.getItem('users') || '[]');
      allRecords = JSON.parse(localStorage.getItem('records') || '[]');
      if (overlay) overlay.style.display = 'none';
    } else {
      console.error(err);
      alert('데이터를 불러오는데 실패했습니다.');
    }
  }
  
  // 최초 로드 시 데이터 조회 실행
  loadGrowthData();
});

function loadGrowthData() {
  const startStr = document.getElementById('growthStartDate').value;
  const endStr = document.getElementById('growthEndDate').value;
  
  if (!startStr || !endStr) {
    alert('시작일과 종료일을 모두 선택해주세요.');
    return;
  }
  
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  
  if (startDate > endDate) {
    alert('시작일은 종료일보다 이전이어야 합니다.');
    return;
  }
  window.currentRankingRange = { startStr, endStr };
  
  // 지정된 기간의 중간 지점 계산
  const midTime = startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2;
  const midDate = new Date(midTime);
  const midStr = midDate.toISOString().split('T')[0];
  
  const rankingData = [];
  
  allUsers.forEach(user => {
    // 사용자의 전체 기간 기록 필터링
    const userRecords = allRecords.filter(r => r.userId === user.id && r.date >= startStr && r.date <= endStr);
    if (userRecords.length === 0) return;
    
    // 2. 새로운 성장 & 습관 점수 시스템 (Consistency + Capped Growth)
    let growthScore = 0;
    let previousExercise = null;
    let streak = 0;
    
    let totalExerciseSum = 0;
    
    // startDate부터 endDate까지 하루씩 순회
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;

      const record = userRecords.find(r => r.date === dateStr);
      
      let todayExercise = 0;
      if (record) {
        const customSum = (record.customExercises || []).reduce((s, ex) => s + (Number(ex.duration)||0), 0);
        todayExercise = (Number(record.walking)||0) + 
                        (Number(record.running)||0) + 
                        customSum;
      }
      
      totalExerciseSum += todayExercise;
      
      if (todayExercise > 0) {
        // [1] 출석 점수: 기록만 해도 +20점
        growthScore += 20;
        streak++;
        
        // [2] 연속 기록 보너스
        if (streak >= 7) growthScore += 10; // 7일 이상 연속 시 매일 추가 +10점
        else if (streak >= 3) growthScore += 5; // 3일 이상 연속 시 매일 추가 +5점

        // [3] 성장 점수 (Capped)
        if (previousExercise !== null && previousExercise > 0) {
          const diff = todayExercise - previousExercise;
          if (diff > 0) {
            // 성장 시 가산점 (1분당 1점, 최대 30점 제한으로 폭주 방지)
            growthScore += Math.min(30, diff);
          } else if (diff < 0) {
            // 하락 시 감점 (하락분 반영하되 출석 점수가 있으므로 완화됨)
            growthScore += Math.max(-20, diff); 
          }
        }
      } else {
        // [4] 미출석 패널티
        growthScore -= 20;
        streak = 0; // 스트릭 초기화
      }
      
      previousExercise = todayExercise;
    }
    
    // 평균 표시용 (참고용)
    const dailyAvg = Math.round(totalExerciseSum / ((endDate - startDate) / (1000 * 60 * 60 * 24) + 1));
    
    rankingData.push({
      user,
      dailyAvg,
      growthScore: Math.round(growthScore),
      userRecords // 그래프 렌더링용 보관
    });
  });
  
  // 성장 점수 기준 내림차순 정렬
  rankingData.sort((a, b) => b.growthScore - a.growthScore);
  
  // 윈도우 객체에 저장하여 검색 시 필터링에 사용
  window.currentRankingData = rankingData;
  renderGrowthTable(rankingData);
}

function renderGrowthTable(data) {
  const tbody = document.getElementById('growthListBody');
  tbody.innerHTML = '';
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">해당 기간 내 운동 기록이 있는 사용자가 없습니다.</td></tr>';
    return;
  }
  
  data.forEach((item, index) => {
    const tr = document.createElement('tr');
    
    let rankBadge = '';
    if (index === 0) rankBadge = '<span class="r-badge r1">1</span>';
    else if (index === 1) rankBadge = '<span class="r-badge r2">2</span>';
    else if (index === 2) rankBadge = '<span class="r-badge r3">3</span>';
    else rankBadge = `<span class="r-badge other">${index + 1}</span>`;
    
    const isUp = item.growthScore > 0;
    const isDown = item.growthScore < 0;
    const scoreColor = isUp ? 'var(--primary)' : (isDown ? '#ef4444' : 'var(--text-muted)');
    const arrow = isUp ? '⬆️' : (isDown ? '⬇️' : '➖');
    
    tr.innerHTML = `
      <td data-label="순위" style="text-align:center;">${rankBadge}</td>
      <td data-label="사용자">
        <div class="u-info">
          <div style="display:flex; flex-direction:column; align-items:flex-start;">
            <div style="display:flex; align-items:center;">
              <div class="u-name" style="background: var(--primary-dark); padding: 3px 10px; border-radius: 100px; color: #fff; font-size: 0.85rem; display:inline-block; font-weight: 700;">${escapeHtml(item.user.name || '이름없음')}</div>
              ${item.user.isSpecial ? '<span class="u-special" style="margin-left:6px;">⭐</span>' : ''}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; margin-left:4px;">@${escapeHtml(item.user.username)}</div>
          </div>
        </div>
      </td>
      <td data-label="성장 점수" style="font-weight:900; color:${scoreColor};">${item.growthScore > 0 ? '+' : ''}${item.growthScore} 점 <span style="font-size:0.8rem;margin-left:4px;">${arrow}</span></td>
      <td data-label="평균 운동량">${item.dailyAvg}</td>
      <td data-label="상세" style="text-align:right;">
        <button class="btn btn-sm" aria-haspopup="dialog" onclick="showUserGraph('${item.user.id}')">그래프 보기</button>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
}

function filterGrowthTable() {
  if (!window.currentRankingData) return;
  
  const query = document.getElementById('userSearchInput').value.toLowerCase();
  
  const filtered = window.currentRankingData.filter(item => {
    const name = (item.user.name || '').toLowerCase();
    const username = (item.user.username || '').toLowerCase();
    return name.includes(query) || username.includes(query);
  });
  
  renderGrowthTable(filtered);
}

function showUserGraph(userId) {
  const item = window.currentRankingData.find(i => i.user.id === userId);
  if (!item) return;

  const graphDialog = document.getElementById('growthGraphArea');
  document.getElementById('graphTitle').textContent = `📈 ${item.user.name || '이름없음'}님의 상세 트렌드`;
  const range = window.currentRankingRange;
  document.getElementById('graphPeriod').textContent = `${range.startStr} ~ ${range.endStr} · 기록 ${item.userRecords.length}일`;
  const records = [...item.userRecords].sort((a, b) => a.date.localeCompare(b.date));
  const labels = records.map(record => record.date);
  metricChartInstances.forEach(chart => chart.destroy());
  metricChartInstances = [];
  const chartGrid = document.getElementById('metricCharts');
  chartGrid.replaceChildren();

  const chartCards = growthMetrics.map(metric => {
    const values = records.map(metric.value);
    const measured = values.filter(value => value !== null);
    const hasData = metric.additive ? measured.some(value => value > 0) : measured.length > 0;
    const card = document.createElement('section');
    card.className = 'metric-chart-card';
    const title = document.createElement('h3');
    title.className = 'metric-chart-title';
    title.textContent = metric.label;
    const summary = document.createElement('p');
    summary.className = 'metric-chart-summary';
    const format = value => value.toFixed(metric.digits);
    if (!hasData) {
      summary.textContent = '해당 기간에 기록된 값이 없습니다.';
    } else if (metric.additive) {
      summary.textContent = `기간 합계 ${format(measured.reduce((sum, value) => sum + value, 0))} ${metric.unit}`;
    } else if (measured.length >= 2) {
      const first = measured[0];
      const last = measured[measured.length - 1];
      const delta = last - first;
      summary.textContent = `${format(first)} → ${format(last)} ${metric.unit} · 변화 ${delta > 0 ? '+' : ''}${format(delta)} ${metric.unit}`;
    } else {
      summary.textContent = `측정값 ${format(measured[0])} ${metric.unit} · 1회 기록`;
    }
    card.append(title, summary);
    if (hasData) {
      const wrap = document.createElement('div');
      wrap.className = 'metric-chart-canvas';
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${metric.label} 변화 그래프`);
      wrap.appendChild(canvas);
      card.appendChild(wrap);
      chartGrid.appendChild(card);
      return { metric, values, canvas };
    }
    chartGrid.appendChild(card);
    return null;
  }).filter(Boolean);

  if (!graphDialog.open) graphDialog.showModal();
  chartCards.forEach(({ metric, values, canvas }) => {
    metricChartInstances.push(new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `${metric.label} (${metric.unit})`,
          data: values,
          borderColor: metric.color,
          backgroundColor: metric.color,
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.25,
          spanGaps: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 5 } },
          y: { beginAtZero: !!metric.additive, min:metric.min, max:metric.max, ticks: { maxTicksLimit: 5 } },
        },
      },
    }));
  });
}

function closeGraph() {
  document.getElementById('growthGraphArea').close();
}

document.getElementById('growthGraphArea').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeGraph();
});
