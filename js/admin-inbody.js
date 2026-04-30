// admin-inbody.js
let currentUser = null;
let selectedUserId = null;
let selectedFile = null;
let specialUsersData = [];

function filterUserSelect() {
  const query = document.getElementById('userSearch') ? document.getElementById('userSearch').value.toLowerCase() : '';
  const select = document.getElementById('userSelect');
  if (!select) return;
  
  select.innerHTML = '<option value="">사용자를 선택하세요...</option>';
  
  specialUsersData.forEach(u => {
    const text = `${u.name || '이름없음'} (${u.username})`;
    if (text.toLowerCase().includes(query)) {
      const option = document.createElement('option');
      option.value = u.id;
      option.textContent = text;
      select.appendChild(option);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const overlay = document.getElementById('adminLoginOverlay');
  
  // Initialize Supabase Client
  await initSupabase();
  
  // Set default date
  document.getElementById('recordDate').value = new Date().toISOString().split('T')[0];

  const user = Auth.requireAdmin();
  if (!user) {
    // Auth.requireAdmin redirects to index.html or dashboard.html
    // but we can also show the overlay as a fallback
    if (overlay) overlay.style.display = 'flex';
    return;
  }

  // Already checked for admin in Auth.requireAdmin
  currentUser = user;
  if (overlay) overlay.style.display = 'none';

  const el = document.getElementById('navUsername');
  const av = document.getElementById('navAvatar');
  if (el) el.textContent = user.name || '관리자';
  if (av) av.textContent = (user.name || 'A').charAt(0).toUpperCase();
  
  // Initialize
  initDragAndDrop();
  await loadSpecialUsers();
});

async function adminLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

async function loadSpecialUsers() {
  try {
    const response = await fetch(new URL('api/admin-data', window.location.href).toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json();
    
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || '사용자 목록 로드 실패');
    }

    specialUsersData = (payload.users || []).filter(u => u.isSpecial);
    filterUserSelect();
  } catch (err) {
    if (window.location.protocol === 'file:' || (err.message && err.message.includes('Failed to fetch'))) {
      const allUsers = [
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
      
      specialUsersData = allUsers.filter(u => u.isSpecial);
      filterUserSelect();
      return;
    }
    console.error('Error loading special users:', err);
    alert('사용자 목록을 불러오는 중 오류가 발생했습니다.');
  }
}

async function loadUserRecords() {
  selectedUserId = document.getElementById('userSelect').value;
  const uploadSection = document.getElementById('uploadSection');
  const historySection = document.getElementById('historySection');
  
  if (!selectedUserId) {
    uploadSection.style.display = 'none';
    historySection.style.display = 'none';
    return;
  }
  
  uploadSection.style.display = 'block';
  historySection.style.display = 'block';

  const listEl = document.getElementById('recordListBody');
  listEl.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">불러오는 중...</td></tr>';

  try {
    const res = await fetch(new URL(`api/admin-inbody?userId=${selectedUserId}`, window.location.href).toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.message || '로드 실패');
    
    renderRecords(result.records);
  } catch (err) {
    if (window.location.protocol === 'file:' || (err.message && err.message.includes('Failed to fetch'))) {
       renderRecords([
         {
           id: 'mock_1',
           record_date: new Date().toISOString().split('T')[0],
           weight: 75.2,
           skeletal_muscle: 35.1,
           body_fat_mass: 13.5,
           bmi: 23.4,
           body_fat_percent: 18.0,
           ecw_ratio: 0.380,
           inbody_score: 82,
           image_url: null
         }
       ]);
       return;
    }
    console.error('Error loading records:', err);
    listEl.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:red;">기록을 불러오는데 실패했습니다.</td></tr>';
  }
}

function renderRecords(records) {
  const tbody = document.getElementById('recordListBody');
  tbody.innerHTML = '';
  
  if (!records || records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 20px; color: var(--text-muted);">기록이 없습니다.</td></tr>';
    return;
  }
  
  records.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="측정일자"><strong>${r.record_date}</strong></td>
      <td data-label="체중">${r.weight} kg</td>
      <td data-label="골격근량">${r.skeletal_muscle} kg</td>
      <td data-label="체지방량">${r.body_fat_mass !== undefined ? r.body_fat_mass + ' kg' : '-'}</td>
      <td data-label="BMI">${r.bmi !== undefined ? r.bmi : '-'}</td>
      <td data-label="체지방률">${r.body_fat_percent} %</td>
      <td data-label="세포외수분비">${r.ecw_ratio !== undefined ? r.ecw_ratio : '-'}</td>
      <td data-label="점수">${r.inbody_score} 점</td>
      <td data-label="이미지">
        ${r.image_url ? `<a href="${r.image_url}" target="_blank" style="color: var(--primary); text-decoration: underline; font-size: 0.8rem;">보기</a>` : '<span style="color:var(--text-muted);font-size:0.8rem;">없음</span>'}
      </td>
      <td data-label="관리">
        <button class="btn" style="background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;padding:4px 8px;font-size:0.75rem;" onclick="deleteRecord('${r.id}')">삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function initDragAndDrop() {
  const dropArea = document.getElementById('dropArea');
  
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
  });

  dropArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
      document.getElementById('fileInput').files = files;
      handleFileSelect({ target: { files: files } });
    }
  }, false);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 업로드 가능합니다.');
    return;
  }
  
  selectedFile = file;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('imagePreview');
    img.src = e.target.result;
    img.style.display = 'inline-block';
  }
  reader.readAsDataURL(file);
}

async function saveRecord() {
  if (!selectedUserId) {
    alert('사용자를 선택해주세요.');
    return;
  }
  
  const date = document.getElementById('recordDate').value;
  const weight = document.getElementById('weight').value;
  const skeletalMuscle = document.getElementById('skeletalMuscle').value;
  const bodyFatMass = document.getElementById('bodyFatMass').value;
  const bmi = document.getElementById('bmi').value;
  const bodyFatPercent = document.getElementById('bodyFatPercent').value;
  const ecwRatio = document.getElementById('ecwRatio').value;
  const inbodyScore = document.getElementById('inbodyScore').value;
  
  if (!date || !weight || !skeletalMuscle || !bodyFatMass || !bmi || !bodyFatPercent || !ecwRatio || !inbodyScore) {
    alert('모든 필드를 입력해주세요.');
    return;
  }

  const btn = document.getElementById('btnSave');
  const originalText = btn.textContent;
  btn.textContent = '저장 중...';
  btn.disabled = true;

  try {
    let imageBase64 = null;
    let fileName = null;

    // Convert image to Base64 if selected
    if (selectedFile) {
      fileName = selectedFile.name;
      imageBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });
    }

    // Call API
    const res = await fetch(new URL('api/admin-inbody', window.location.href).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selectedUserId,
        date,
        weight,
        skeletalMuscle,
        bodyFatMass,
        bmi,
        bodyFatPercent,
        ecwRatio,
        inbodyScore,
        imageBase64,
        fileName
      }),
      credentials: 'include'
    });

    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.message || '저장 실패');
    
    alert('저장되었습니다.');
    
    // Reset form
    document.getElementById('weight').value = '';
    document.getElementById('skeletalMuscle').value = '';
    document.getElementById('bodyFatMass').value = '';
    document.getElementById('bmi').value = '';
    document.getElementById('bodyFatPercent').value = '';
    document.getElementById('ecwRatio').value = '';
    document.getElementById('inbodyScore').value = '';
    document.getElementById('fileInput').value = '';
    document.getElementById('imagePreview').style.display = 'none';
    selectedFile = null;
    
    loadUserRecords(); // Reload list
    
  } catch (err) {
    if (window.location.protocol === 'file:' || (err.message && err.message.includes('Failed to fetch'))) {
      alert('[로컬 테스트 모드] 가상으로 저장되었습니다.');
      document.getElementById('weight').value = '';
      document.getElementById('skeletalMuscle').value = '';
      document.getElementById('bodyFatMass').value = '';
      document.getElementById('bmi').value = '';
      document.getElementById('bodyFatPercent').value = '';
      document.getElementById('ecwRatio').value = '';
      document.getElementById('inbodyScore').value = '';
      document.getElementById('fileInput').value = '';
      document.getElementById('imagePreview').style.display = 'none';
      selectedFile = null;
      loadUserRecords();
      return;
    }
    console.error('Error saving record:', err);
    alert('저장 중 오류가 발생했습니다: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function deleteRecord(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  
  try {
    const res = await fetch(new URL(`api/admin-inbody?id=${encodeURIComponent(id)}`, window.location.href).toString(), {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.message || '삭제 실패');
    
    alert('삭제되었습니다.');
    loadUserRecords();
  } catch (err) {
    if (window.location.protocol === 'file:' || (err.message && err.message.includes('Failed to fetch'))) {
      alert('[로컬 테스트 모드] 가상으로 삭제되었습니다.');
      loadUserRecords();
      return;
    }
    console.error('Error deleting record:', err);
    alert('삭제 중 오류가 발생했습니다: ' + err.message);
  }
}
