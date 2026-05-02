let allUsers = [];
let allInBodyRecords = [];
let userTrendChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  const overlay = document.getElementById('adminLoginOverlay');
  
  // 기본 날짜 설정: 최근 3개월
  const end = new Date();
  const start = new Date();
  start.setMonth(end.getMonth() - 3);
  
  const fmtMonth = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  
  document.getElementById('growthStartMonth').value = fmtMonth(start);
  document.getElementById('growthEndMonth').value = fmtMonth(end);

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
              <div class="u-name" style="background: var(--primary-dark); padding: 3px 10px; border-radius: 100px; color: #fff; font-size: 0.85rem; display:inline-block; font-weight: 700;">${item.user.name || '이름없음'}</div>
              ${item.user.isSpecial ? '<span class="u-special" style="margin-left:6px;">⭐</span>' : ''}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; margin-left:4px;">@${item.user.username}</div>
          </div>
        </div>
      </td>
      <td data-label="개선 점수" style="font-weight:900; color:var(--primary); font-size:1.1rem;">${item.growthScore.toFixed(1)} 점</td>
      <td data-label="골격근량 변화">${item.first.muscle} → ${item.last.muscle}<br>${getDiffHtml(item.muscleDiff, 'kg')}</td>
      <td data-label="체지방률 변화">${item.first.fat} → ${item.last.fat}<br>${getReverseDiffHtml(item.fatDiff, '%')}</td>
      <td data-label="종합 점수 변화">${item.first.score} → ${item.last.score}<br>${getDiffHtml(item.scoreDiff, '점')}</td>
      <td data-label="상세" style="text-align:right;">
        <button class="btn btn-sm" onclick="showUserGraph('${item.user.id}')">그래프 보기</button>
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
  
  document.getElementById('growthGraphArea').style.display = 'block';
  document.getElementById('graphTitle').innerHTML = `📈 ${item.user.name || '이름없음'}님의 체성분 변화 추이`;
  
  const records = item.userRecords;
  const labels = records.map(r => r.date.substring(5)); // MM-DD
  const muscles = records.map(r => r.muscle);
  const fats = records.map(r => r.fat);
  
  const ctx = document.getElementById('userTrendChart');
  if (userTrendChart) userTrendChart.destroy();
  
  userTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '골격근량 (kg)',
          data: muscles,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          borderWidth: 3,
          yAxisID: 'y'
        },
        {
          label: '체지방률 (%)',
          data: fats,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: '골격근량 (kg)' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: '체지방률 (%)' },
          grid: { drawOnChartArea: false } // only want the grid lines for one axis to show up
        }
      }
    }
  });
  
  document.getElementById('growthGraphArea').scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function closeGraph() {
  document.getElementById('growthGraphArea').style.display = 'none';
}
