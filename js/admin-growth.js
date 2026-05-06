let allUsers = [];
let allRecords = [];
let userTrendChart = null;

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
              <div class="u-name" style="background: var(--primary-dark); padding: 3px 10px; border-radius: 100px; color: #fff; font-size: 0.85rem; display:inline-block; font-weight: 700;">${item.user.name || '이름없음'}</div>
              ${item.user.isSpecial ? '<span class="u-special" style="margin-left:6px;">⭐</span>' : ''}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; margin-left:4px;">@${item.user.username}</div>
          </div>
        </div>
      </td>
      <td data-label="성장 점수" style="font-weight:900; color:${scoreColor};">${item.growthScore > 0 ? '+' : ''}${item.growthScore} 점 <span style="font-size:0.8rem;margin-left:4px;">${arrow}</span></td>
      <td data-label="평균 운동량">${item.dailyAvg}</td>
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
  
  document.getElementById('growthGraphArea').style.display = 'flex';
  document.getElementById('graphTitle').innerHTML = `📈 ${item.user.name || '이름없음'}님의 상세 트렌드`;
  
  const startStr = document.getElementById('growthStartDate').value;
  const endStr = document.getElementById('growthEndDate').value;
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  
  const labels = [];
  const totalExercises = [];
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    labels.push(`${m}/${day}`);
    
    const record = item.userRecords.find(r => r.date === dateStr);
    let todayExercise = 0;
    if (record) {
      const customSum = (record.customExercises || []).reduce((s, ex) => s + (ex.duration || 0), 0);
      todayExercise = (Number(record.walking)||0) + 
                      (Number(record.running)||0) + 
                      customSum;
    }
    totalExercises.push(todayExercise);
  }
  
  const ctx = document.getElementById('userTrendChart');
  if (userTrendChart) userTrendChart.destroy();
  
  userTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '일일 총 운동량 (전체 운동 합산)',
        data: totalExercises,
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#06b6d4',
        pointRadius: 4,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
  
  // 화면 부드럽게 스크롤
  document.getElementById('growthGraphArea').scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function closeGraph() {
  document.getElementById('growthGraphArea').style.display = 'none';
}
