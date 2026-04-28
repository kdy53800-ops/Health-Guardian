let allUsers = [];
let allInBodyRecords = [];
let currentMode = 'score'; // 'score', 'muscle', 'fat'
let currentRankingData = [];

document.addEventListener('DOMContentLoaded', async () => {
  const overlay = document.getElementById('adminLoginOverlay');
  
  try {
    const response = await fetch(new URL('api/admin-inbody', window.location.href).toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    
    if (!response.ok) throw new Error('Failed to fetch');
    const payload = await response.json();
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
    if (window.location.protocol === 'file:' || (err.message && err.message.includes('Failed to fetch'))) {
      if (overlay) overlay.style.display = 'none';
      generateInBodyMockData();
    } else {
      console.error(err);
      alert('데이터를 불러오는데 실패했습니다.');
    }
  }
  
  processRankingData();
});

function generateInBodyMockData() {
  allUsers = [
    { id: 'u1', name: '김건강', username: 'health_k', email: 'kim@example.com', phone: '01087654321', gender: 'M', birthyear: '1990', isSpecial: true, createdAt: new Date().toISOString() },
    { id: 'u2', name: '이튼튼', username: 'strong_lee', email: 'lee@example.com', phone: '01011112222', gender: 'M', birthyear: '1992', isSpecial: false, createdAt: new Date().toISOString() },
    { id: 'u3', name: '박파워', username: 'power_p', email: 'park@example.com', phone: '01033334444', gender: 'M', birthyear: '1988', isSpecial: true, createdAt: new Date().toISOString() },
    { id: 'u4', name: '최활력', username: 'vital_c', email: 'choi@example.com', phone: '01055556666', gender: 'F', birthyear: '1995', isSpecial: false, createdAt: new Date().toISOString() },
    { id: 'u5', name: '정성장', username: 'growth_j', email: 'jung@example.com', phone: '01012345678', gender: 'F', birthyear: '1995', isSpecial: true, createdAt: new Date().toISOString() }
  ];
  
  let customSpecials = JSON.parse(sessionStorage.getItem('customSpecials') || '{}');
  allUsers.forEach(u => {
    if (customSpecials[u.id] !== undefined) u.isSpecial = customSpecials[u.id];
  });
  
  const today = new Date();
  allInBodyRecords = [];
  
  allUsers.forEach((u, i) => {
    for (let d = 0; d < 3; d++) {
      const date = new Date();
      date.setMonth(today.getMonth() - d);
      
      const isImprove = d === 0; // 최신 기록이 더 좋게
      
      allInBodyRecords.push({
        id: `ib_${u.id}_${d}`,
        userId: u.id,
        date: date.toISOString().split('T')[0],
        weight: 70 + (i * 2) + (isImprove ? -2 : 0),
        muscle: 30 + (i * 1.5) + (isImprove ? 1.5 : 0),
        fat: 20 - (i * 1) + (isImprove ? -2 : 0),
        score: 75 + (i * 3) + (isImprove ? 5 : 0)
      });
    }
  });
}

function processRankingData() {
  // Get latest record for each special user
  currentRankingData = [];
  
  const specialUsers = allUsers.filter(u => u.isSpecial);
  
  specialUsers.forEach(user => {
    const userRecords = allInBodyRecords.filter(r => r.userId === user.id);
    if (userRecords.length === 0) return;
    
    // Sort by date descending
    userRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = userRecords[0];
    
    currentRankingData.push({
      user,
      latest
    });
  });
  
  renderTable();
}

function changeRankMode(mode) {
  currentMode = mode;
  
  document.querySelectorAll('.rank-tab').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
  
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('rankBody');
  const valueHead = document.getElementById('rankValueHead');
  
  let sorted = [...currentRankingData];
  let unit = '';
  
  if (currentMode === 'score') {
    sorted.sort((a, b) => b.latest.score - a.latest.score);
    valueHead.textContent = '인바디 점수';
    unit = '점';
  } else if (currentMode === 'muscle') {
    sorted.sort((a, b) => b.latest.muscle - a.latest.muscle);
    valueHead.textContent = '골격근량';
    unit = 'kg';
  } else if (currentMode === 'fat') {
    sorted.sort((a, b) => a.latest.fat - b.latest.fat); // 낮은순이 랭킹이 높음
    valueHead.textContent = '체지방률';
    unit = '%';
  }
  
  filterAndRender(sorted, unit);
}

function filterInBodyTable() {
  renderTable(); // re-evaluates the current sort and filters
}

function filterAndRender(data, unit) {
  const query = document.getElementById('userSearchInput').value.toLowerCase();
  
  const filtered = data.filter(item => {
    const name = (item.user.name || '').toLowerCase();
    const username = (item.user.username || '').toLowerCase();
    return name.includes(query) || username.includes(query);
  });
  
  const tbody = document.getElementById('rankBody');
  tbody.innerHTML = '';
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">조건에 맞는 대상자가 없습니다.</td></tr>';
    return;
  }
  
  filtered.forEach((item, index) => {
    const tr = document.createElement('tr');
    
    let rankBadge = '';
    if (index === 0) rankBadge = '<span class="r-badge r1">1</span>';
    else if (index === 1) rankBadge = '<span class="r-badge r2">2</span>';
    else if (index === 2) rankBadge = '<span class="r-badge r3">3</span>';
    else rankBadge = `<span class="r-badge other">${index + 1}</span>`;
    
    let valStr = '';
    if (currentMode === 'score') valStr = item.latest.score;
    else if (currentMode === 'muscle') valStr = item.latest.muscle.toFixed(1);
    else if (currentMode === 'fat') valStr = item.latest.fat.toFixed(1);
    
    tr.innerHTML = `
      <td style="text-align:center;">${rankBadge}</td>
      <td>
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
      <td class="u-val">${valStr}<span style="font-size:0.8rem;font-weight:normal;color:var(--text-muted);margin-left:2px;">${unit}</span></td>
      <td style="color:var(--text-muted); font-size:0.85rem;">${item.latest.date}</td>
      <td style="color:var(--text-muted); font-size:0.85rem;">${item.latest.weight ? item.latest.weight + 'kg' : '-'}</td>
    `;
    
    tbody.appendChild(tr);
  });
}
