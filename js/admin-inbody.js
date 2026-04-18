// admin-inbody.js
let currentUser = null;
let selectedUserId = null;
let selectedFile = null;

document.addEventListener('DOMContentLoaded', async () => {
  const overlay = document.getElementById('adminLoginOverlay');
  
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
    const { data: users, error } = await supabaseClient
      .from('profiles')
      .select('id, name, username')
      .eq('is_special', true)
      .order('name');
      
    if (error) throw error;
    
    const select = document.getElementById('userSelect');
    users.forEach(u => {
      const option = document.createElement('option');
      option.value = u.id;
      option.textContent = `${u.name || '이름없음'} (${u.username})`;
      select.appendChild(option);
    });
  } catch (err) {
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
  
  try {
    const { data: records, error } = await supabaseClient
      .from('inbody_records')
      .select('*')
      .eq('user_id', selectedUserId)
      .order('record_date', { ascending: false });
      
    if (error) throw error;
    
    renderRecords(records);
  } catch (err) {
    console.error('Error loading records:', err);
  }
}

function renderRecords(records) {
  const tbody = document.getElementById('recordListBody');
  tbody.innerHTML = '';
  
  if (!records || records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted);">기록이 없습니다.</td></tr>';
    return;
  }
  
  records.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${r.record_date}</strong></td>
      <td>${r.weight} kg</td>
      <td>${r.skeletal_muscle} kg</td>
      <td>${r.body_fat_percent} %</td>
      <td>${r.inbody_score} 점</td>
      <td>
        ${r.image_url ? `<a href="${r.image_url}" target="_blank" style="color: var(--primary); text-decoration: underline; font-size: 0.8rem;">보기</a>` : '<span style="color:var(--text-muted);font-size:0.8rem;">없음</span>'}
      </td>
      <td>
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
    let imageUrl = null;
    
    // Upload image if selected
    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${selectedUserId}/${date}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('inbody_images')
        .upload(fileName, selectedFile);
        
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabaseClient.storage
        .from('inbody_images')
        .getPublicUrl(fileName);
        
      imageUrl = publicUrl;
    }
    
    // Insert into DB
    const recordId = `inbody_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    const { error: dbError } = await supabaseClient
      .from('inbody_records')
      .upsert({
        id: recordId,
        user_id: selectedUserId,
        record_date: date,
        weight: parseFloat(weight),
        skeletal_muscle: parseFloat(skeletalMuscle),
        body_fat_mass: parseFloat(bodyFatMass),
        bmi: parseFloat(bmi),
        body_fat_percent: parseFloat(bodyFatPercent),
        ecw_ratio: parseFloat(ecwRatio),
        inbody_score: parseInt(inbodyScore),
        image_url: imageUrl
      }, { onConflict: 'user_id, record_date' });
      
    if (dbError) throw dbError;
    
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
    console.error('Error saving record:', err);
    alert('저장 중 오류가 발생했습니다: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function deleteRecord(id) {
  if (!confirm('이 기록을 삭제하시겠습니까?')) return;
  
  try {
    const { error } = await supabaseClient
      .from('inbody_records')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    
    loadUserRecords(); // Reload list
  } catch (err) {
    console.error('Error deleting:', err);
    alert('삭제 중 오류가 발생했습니다.');
  }
}
