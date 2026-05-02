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
    if (window.location.protocol === 'file:' || err.message === 'Failed to fetch') {
      allUsers = JSON.parse(localStorage.getItem('users') || '[]');
      allInBodyRecords = JSON.parse(localStorage.getItem('inbody_records') || '[]');
      if (overlay) overlay.style.display = 'none';
    } else {
      console.error(err);
      alert('데이터를 불러오는데 실패했습니다.');
    }
  }
  
  processRankingData();
});

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
      <td data-label="${valueHead.textContent}" class="u-val">${valStr}<span style="font-size:0.8rem;font-weight:normal;color:var(--text-muted);margin-left:2px;">${unit}</span></td>
      <td data-label="측정일자" style="color:var(--text-muted); font-size:0.85rem;">${item.latest.date}</td>
      <td data-label="체중" style="color:var(--text-muted); font-size:0.85rem;">${item.latest.weight ? item.latest.weight + 'kg' : '-'}</td>
    `;
    
    tbody.appendChild(tr);
  });
}
