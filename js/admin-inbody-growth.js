let allUsers = [];
let allInBodyRecords = [];
let metricChartInstances = [];

const inbodyMetrics = [
  { label: '종합점수', key: 'score', unit: '점', digits: 0, color: '#0054a6' },
  { label: '체중', key: 'weight', unit: 'kg', digits: 1, color: '#008cc6' },
  { label: '골격근량', key: 'muscle', unit: 'kg', digits: 1, color: '#3076bb' },
  { label: '체지방량', key: 'bodyFatMass', unit: 'kg', digits: 1, color: '#cc7858' },
  { label: 'BMI', key: 'bmi', unit: '', digits: 1, color: '#6878bd' },
  { label: '체지방률', key: 'fat', unit: '%', digits: 1, color: '#d46b73' },
  { label: '세포외수분비', key: 'ecwRatio', unit: '', digits: 3, color: '#3d8c8d' },
  { label: '위상각', key: 'phaseAngle', unit: '°', digits: 1, color: '#9a72aa' },
];

document.addEventListener('DOMContentLoaded', async () => {
  const overlay = document.getElementById('adminLoginOverlay');
  
  // 기본 조회 범위: 지난해 1월부터 이번 달까지
  const end = new Date();
  document.getElementById('growthStartMonth').value = `${end.getFullYear() - 1}-01`;
  document.getElementById('growthEndMonth').value = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;

  try {
    const response = await fetch(new URL('api/admin-inbody', window.location.href).toString(), {
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
          records: JSON.parse(localStorage.getItem('inbody_records') || '[]')
        };
      } else {
        throw new Error('Failed to fetch');
      }
    } else {
      payload = await response.json();
    }

    if (!payload.ok) throw new Error(payload.message || '데이터 로드 실패');
    
    allUsers = payload.users || [];
    allInBodyRecords = payload.records || [];
    
    if (overlay) overlay.style.display = 'none';
    
    const user = Auth.getUser();
    if (user) {
      document.getElementById('navUsername').textContent = user.name || '관리자';
      document.getElementById('navAvatar').textContent = (user.name || 'A').charAt(0).toUpperCase();
    }
  } catch (err) {
    if (window.location.protocol === 'file:' || err.message === 'Failed to fetch') {
      allUsers = JSON.parse(localStorage.getItem('users') || '[]');
      allInBodyRecords = JSON.parse(localStorage.getItem('inbody_records') || '[]');
      if (overlay) overlay.style.display = 'none';
    } else {
      console.error(err);
      alert('데이터를 불러오는데 실패했습니다.');
    }
  }
  
  loadInBodyGrowth();
});

function loadInBodyGrowth() {
  const startMonth = document.getElementById('growthStartMonth').value;
  const endMonth = document.getElementById('growthEndMonth').value;
  
  if (!startMonth || !endMonth) {
    alert('시작월과 종료월을 모두 선택해주세요.');
    return;
  }
  
  if (startMonth > endMonth) {
    alert('시작월은 종료월보다 이전이어야 합니다.');
    return;
  }
  
  const rankingData = [];
  const specialUsers = allUsers.filter(u => u.isSpecial);
  
  specialUsers.forEach(user => {
    const userRecords = allInBodyRecords.filter(r => {
      if (r.userId !== user.id) return false;
      const rm = r.date.substring(0, 7); // YYYY-MM
      return rm >= startMonth && rm <= endMonth;
    });
    
    if (userRecords.length < 2) return; // 비교를 위해 최소 2건 필요
    
    userRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const first = userRecords[0];
    const last = userRecords[userRecords.length - 1];
    
    const muscleDiff = last.muscle - first.muscle;
    const fatDiff = last.fat - first.fat;
    const scoreDiff = last.score - first.score;
    
    // 점수 산정 기준: [근육량 증가(kg) × 2] + [체지방률 감소(%) × 1.5] + [인바디 점수 상승]
    // 체지방률은 감소해야 좋으므로 부호를 반대로 (-fatDiff)
    const growthScore = (muscleDiff * 2) + (-fatDiff * 1.5) + scoreDiff;
    
    rankingData.push({
      user,
      first,
      last,
      muscleDiff,
      fatDiff,
      scoreDiff,
      growthScore,
      userRecords
    });
  });
  
  rankingData.sort((a, b) => b.growthScore - a.growthScore);
  
  window.currentRankingData = rankingData;
  renderGrowthTable(rankingData);
}

function getDiffHtml(diff, unit) {
  const abs = Math.abs(diff).toFixed(1);
  if (diff > 0) return `<span class="diff-badge diff-up">▲ ${abs}${unit}</span>`;
  if (diff < 0) return `<span class="diff-badge diff-down">▼ ${abs}${unit}</span>`;
  return `<span class="diff-badge diff-neutral">- ${abs}${unit}</span>`;
}
function getReverseDiffHtml(diff, unit) { // For fat, negative is good
  const abs = Math.abs(diff).toFixed(1);
  if (diff < 0) return `<span class="diff-badge diff-up">▼ ${abs}${unit}</span>`;
  if (diff > 0) return `<span class="diff-badge diff-down">▲ ${abs}${unit}</span>`;
  return `<span class="diff-badge diff-neutral">- ${abs}${unit}</span>`;
}

function renderGrowthTable(data) {
  const tbody = document.getElementById('growthListBody');
  tbody.innerHTML = '';
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">해당 기간 내 비교 가능한 2건 이상의 기록이 없습니다.</td></tr>';
    return;
  }
  
  data.forEach((item, index) => {
    const tr = document.createElement('tr');
    
    let rankBadge = '';
    if (index === 0) rankBadge = '<span class="r-badge r1">1</span>';
    else if (index === 1) rankBadge = '<span class="r-badge r2">2</span>';
    else if (index === 2) rankBadge = '<span class="r-badge r3">3</span>';
    else rankBadge = `<span class="r-badge other">${index + 1}</span>`;
    
    tr.innerHTML = `
      <td data-label="순위" style="text-align:center;">${rankBadge}</td>
      <td data-label="대상자">
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
      <td data-label="개선 점수" style="font-weight:900; color:var(--primary); font-size:1.1rem;">${item.growthScore.toFixed(1)} 점</td>
      <td data-label="골격근량 변화">${item.first.muscle} → ${item.last.muscle}<br>${getDiffHtml(item.muscleDiff, 'kg')}</td>
      <td data-label="체지방률 변화">${item.first.fat} → ${item.last.fat}<br>${getReverseDiffHtml(item.fatDiff, '%')}</td>
      <td data-label="종합 점수 변화">${item.first.score} → ${item.last.score}<br>${getDiffHtml(item.scoreDiff, '점')}</td>
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
  document.getElementById('graphTitle').textContent = `📈 ${item.user.name || '이름없음'}님의 체성분 변화 추이`;
  document.getElementById('graphPeriod').textContent = `${document.getElementById('growthStartMonth').value} ~ ${document.getElementById('growthEndMonth').value} · 측정일별 변화`;
  
  const records = item.userRecords;
  const labels = records.map(r => r.date);
  metricChartInstances.forEach(chart => chart.destroy());
  metricChartInstances = [];
  const chartGrid = document.getElementById('metricCharts');
  chartGrid.replaceChildren();

  const chartCards = inbodyMetrics.map(metric => {
    const card = document.createElement('section');
    card.className = 'metric-chart-card';
    const title = document.createElement('h3');
    title.className = 'metric-chart-title';
    title.textContent = metric.label;
    const change = document.createElement('p');
    change.className = 'metric-chart-change';
    const values = records.map(record => {
      const value = record[metric.key];
      return value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    });
    const measured = values.filter(value => value !== null);
    if (measured.length >= 2) {
      const first = measured[0];
      const last = measured[measured.length - 1];
      const delta = last - first;
      const format = value => value.toFixed(metric.digits);
      change.textContent = `${format(first)} → ${format(last)} ${metric.unit} · 변화 ${delta > 0 ? '+' : ''}${format(delta)} ${metric.unit}`;
    } else {
      change.textContent = '비교 가능한 측정값이 없습니다.';
    }
    card.append(title, change);
    if (measured.length >= 2) {
      const wrap = document.createElement('div');
      wrap.className = 'metric-chart-canvas';
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-label', `${metric.label} 변화 그래프`);
      canvas.setAttribute('role', 'img');
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
          label: `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}`,
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
        scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { ticks: { maxTicksLimit: 5 } } },
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
