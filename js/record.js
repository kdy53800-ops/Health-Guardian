/* ===================================================
   record.js — Workout Recording Logic
   건강지킴이
   =================================================== */

let currentUser = null;
let userGoals = null;
let userRecords = [];
let editingId = null;
let selectedCondition = 3;

// 개인 운동 상태
let currentExCat = '유산소'; // 현재 선택된 카테고리
let customExercises = [];     // [{ id, category, name, duration, intensity }]

// 카테고리별 정보
const EX_CAT_CFG = {
  '유산소': {
    icon: '🏊',
    cls: 'cat-cardio',
    badge: 'cat-badge-cardio',
    presets: ['자전거', '수영', '줄넘기', '에어로빅', '등산'],
  },
  '근력': {
    icon: '🏋️',
    cls: 'cat-strength',
    badge: 'cat-badge-strength',
    presets: ['덤벨 운동', '바벨 운동', '케틀벨', '맨몸 운동', '코어 운동'],
  },
  '유연성': {
    icon: '🧘',
    cls: 'cat-flex',
    badge: 'cat-badge-flex',
    presets: ['요가', '필라테스', '스트레칭', '밸런스 트레이닝'],
  },
  '스포츠': {
    icon: '⚽',
    cls: 'cat-sports',
    badge: 'cat-badge-sports',
    presets: ['축구', '농구', '테니스', '배드민턴', '탁구', '볼링', '수영', '골프', '클라이밍', '베이스볼'],
  },
};


const GOAL_LABELS = {
  walking:  { label: '걷기 목표', unit: '분', color: 'green' },
  running:  { label: '러닝 목표', unit: '분', color: 'green' },
  squats:   { label: '스쿼트 목표', unit: '회', color: 'blue' },
  pushups:  { label: '푸쉬업 목표', unit: '회', color: 'blue' },
  situps:   { label: '윗몸 목표', unit: '회', color: 'blue' },
  water:    { label: '수분섭취 목표', unit: 'ml', color: 'gold' },
  fasting:  { label: '공복시간 목표', unit: '시간', color: 'gold' },
};

// 날짜 중복 모달에서 참조할 기존 기록
let pendingDuplicateRecord = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = Auth.require();
  if (!currentUser) return;

  // 날짜 제한 설정 (미래 불가, 오늘 포함 3일)
  const todayStr = today();
  const minDate = prevDay(prevDay(todayStr));
  const dateInput = document.getElementById('fDate');
  if (dateInput) {
    dateInput.setAttribute('max', todayStr);
    dateInput.setAttribute('min', minDate);
  }

  userGoals = Goals.get(currentUser.id);
  userRecords = await Records.getUserRecordsAsync(currentUser.id);

  // ?edit=ID 파라미터가 있으면 수정 모드
  const params = new URLSearchParams(window.location.search);
  editingId = params.get('edit');

  if (editingId) {
    const record = userRecords.find(item => item.id === editingId);
    if (record && record.userId === currentUser.id) {
      populateForm(record);
      document.getElementById('saveBtn').textContent = '✏️ 수정 완료';
      document.querySelector('.page-header h1').innerHTML = `<div class="page-icon">✏️</div> 기록 수정`;
    } else {
      window.location.href = 'history.html';
    }
  } else {
    // 신규 기록: 오늘 날짜 기본 세팅
    if (dateInput) dateInput.value = todayStr;
  }

  // 날짜 변경 시 기존 기록 여부 확인
  document.getElementById('fDate').addEventListener('change', function() {
    if (editingId) return; // 수정 모드에서는 체크 안 함
    const dateVal = this.value;
    if (!dateVal) return;
    const existing = userRecords.find(record => record.date === dateVal);
    if (existing) {
      pendingDuplicateRecord = existing;
      const modal = document.getElementById('duplicateModal');
      document.getElementById('duplicateModalDate').textContent =
        `${formatDate(dateVal)} 날짜에 이미 작성된 기록이 있습니다.\n기존 기록을 불러올까요?`;
      modal.style.display = 'flex';
    }
    updateSummary();
  });

  initGoalEditors();
  renderTargets();
  updateSummary();
  setCondition(selectedCondition);

  // 개인 운동 초기화: 탭 기본값 렌더
  switchExCat(document.querySelector('.custom-ex-tab'), '유산소');
});

// ─── 기존 기록 모달 컨트롤 ────────────────────────────
function loadExistingRecord() {
  if (!pendingDuplicateRecord) return;
  editingId = pendingDuplicateRecord.id;
  populateForm(pendingDuplicateRecord);
  document.getElementById('saveBtn').textContent = '✏️ 수정 저장';
  document.getElementById('pageSubtitle').textContent = '기존 기록을 불러왔습니다. 수정 후 저장하세요.';
  closeDuplicateModal();
  showToast('기존 기록을 불러왔습니다 📂', 'default');
}

function closeDuplicateModal() {
  const modal = document.getElementById('duplicateModal');
  if (modal) modal.style.display = 'none';
  pendingDuplicateRecord = null;
}

function populateForm(record) {
  document.getElementById('fDate').value = record.date || '';
  document.getElementById('fWeight').value = record.weight || '';
  document.getElementById('fWalking').value = record.walking || '';
  document.getElementById('fRunning').value = record.running || '';
  document.getElementById('fWalkingKm').value = record.walkingKm || '';
  document.getElementById('fRunningKm').value = record.runningKm || '';
  document.getElementById('fSquats').value = record.squats || '';
  document.getElementById('fPushups').value = record.pushups || '';
  document.getElementById('fSitups').value = record.situps || '';
  document.getElementById('fWater').value = record.water || '';
  document.getElementById('fFasting').value = record.fasting || '';
  document.getElementById('fDiet').value = record.diet || '';
  document.getElementById('fMemo').value = record.memo || '';

  const cond = record.condition || 3;
  setCondition(cond);

  // 개인 운동 로드
  if (record.customExercises && record.customExercises.length > 0) {
    customExercises = record.customExercises.map(e => ({ ...e, id: e.id || genId() }));
    renderCustomExList();
  }

  // Update all progress bars (목표 있는 항목만)
  ['fWalking','fRunning','fSquats','fPushups','fSitups','fWater','fFasting'].forEach(id => {
    const capKey = id.slice(1).charAt(0).toUpperCase() + id.slice(2);
    updateProgress(id, `progress${capKey}`, `pct${capKey}`, id.slice(1).toLowerCase());
  });

  updateSummary();
}

function setCondition(val) {
  selectedCondition = val;
  document.getElementById('fCondition').value = val;
  for (let i = 1; i <= 5; i++) {
    document.getElementById(`cond${i}`).classList.toggle('selected', i === val);
  }
}

function updateProgress(inputId, progressId, pctId, goalKey) {
  const val = parseFloat(document.getElementById(inputId).value) || 0;
  const goal = userGoals[goalKey] || 1;
  const pct = Math.min(Math.round((val / goal) * 100), 100);

  document.getElementById(progressId).style.width = pct + '%';
  document.getElementById(pctId).textContent = pct + '%';
}

function renderTargets() {
  if (!userGoals) return;
  const targets = {
    Walking: { key: 'walking', unit: '분' },
    Running: { key: 'running', unit: '분' },
    Squats:  { key: 'squats',  unit: '회' },
    Pushups: { key: 'pushups', unit: '회' },
    Situps:  { key: 'situps',  unit: '회' },
    Water:   { key: 'water',   unit: 'ml' },
    Fasting: { key: 'fasting', unit: '시간' },
  };
  for (const [name, cfg] of Object.entries(targets)) {
    const el = document.getElementById(`target${name}`);
    if (el) {
      const gval = userGoals[cfg.key] || 0;
      el.textContent = `목표: ${gval}${cfg.unit}`;
    }
  }
}

function updateSummary() {
  const dateVal = document.getElementById('fDate').value;
  if (dateVal) {
    document.getElementById('summaryDate').innerHTML =
      `날짜: <span>${formatDate(dateVal)}</span>`;
    document.getElementById('summaryDayKo').textContent = dayOfWeek(dateVal);
  }

  const walking = parseFloat(document.getElementById('fWalking').value) || 0;
  const running = parseFloat(document.getElementById('fRunning').value) || 0;
  const squats  = parseFloat(document.getElementById('fSquats').value)  || 0;
  const pushups = parseFloat(document.getElementById('fPushups').value) || 0;
  const situps  = parseFloat(document.getElementById('fSitups').value)  || 0;
  const water   = parseFloat(document.getElementById('fWater').value)   || 0;

  // 개인 운동 합산 시간
  const customMins = customExercises.reduce((sum, ex) => sum + (ex.duration || 0), 0);

  document.getElementById('sumExercise').textContent = walking + running + customMins;
  document.getElementById('sumStrength').textContent = squats + pushups + situps;
  document.getElementById('sumWater').textContent = water;

  // goal achievement
  const goals = userGoals || GoalDefaults;
  const checks = [
    walking >= goals.walking,
    running >= goals.running,
    squats  >= goals.squats,
    pushups >= goals.pushups,
    situps  >= goals.situps,
    water   >= goals.water,
  ];
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  document.getElementById('sumGoalPct').textContent = pct + '%';
}

// ─── Goal Editors ─────────────────────────────────────
function initGoalEditors() {
  const row = document.getElementById('goalEditRow');
  row.innerHTML = '';
  for (const [key, cfg] of Object.entries(GOAL_LABELS)) {
    const item = document.createElement('div');
    item.className = 'goal-edit-item';
    item.innerHTML = `
      <label>${cfg.label} (${cfg.unit})</label>
      <input type="number" class="goal-input" id="goal_${key}"
        value="${userGoals[key] || 0}" min="0">
    `;
    row.appendChild(item);
  }
}

function toggleGoals() {
  const toggle = document.getElementById('goalsToggle');
  const panel  = document.getElementById('goalsPanel');
  toggle.classList.toggle('open');
  panel.classList.toggle('open');
}

function saveGoals() {
  for (const key of Object.keys(GOAL_LABELS)) {
    const el = document.getElementById(`goal_${key}`);
    if (el) userGoals[key] = parseFloat(el.value) || 0;
  }
  Goals.save(currentUser.id, userGoals);
  renderTargets();
  // Re-run all progress updates
  const map = {
    fWalking: 'walking', fRunning: 'running',
    fSquats: 'squats', fPushups: 'pushups', fSitups: 'situps',
    fWater: 'water', fFasting: 'fasting'
  };
  for (const [fid, key] of Object.entries(map)) {
    const capKey = key.charAt(0).toUpperCase() + key.slice(1);
    updateProgress(fid, `progress${capKey}`, `pct${capKey}`, key);
  }
  showToast('목표가 저장되었습니다! 🎯', 'success');
}

// ─── Save Record ──────────────────────────────────────
async function handleSave(e) {
  e.preventDefault();

  const dateVal = document.getElementById('fDate').value;
  if (!dateVal) {
    showToast('날짜를 선택해주세요.', 'error');
    return;
  }

  // 날짜 제한 검증 (미래 불가, 3일 이내만 가능)
  const todayStr = today();
  const minDate  = prevDay(prevDay(todayStr));
  if (dateVal > todayStr) {
    showToast('미래 날짜는 기록할 수 없습니다. 🚫', 'error');
    return;
  }
  if (dateVal < minDate) {
    showToast('최근 3일 이내의 기록만 작성 가능합니다. ⏳', 'error');
    return;
  }

  // 신규 작성 중 같은 날짜에 기록이 있으면 모달로 재확인
  if (!editingId) {
    const dup = userRecords.find(record => record.date === dateVal);
    if (dup) {
      pendingDuplicateRecord = dup;
      const modal = document.getElementById('duplicateModal');
      document.getElementById('duplicateModalDate').textContent =
        `${formatDate(dateVal)} 날짜에 이미 작성된 기록이 있습니다.\n기존 기록을 덮어쓰거나 불러올 수 있습니다.`;
      modal.style.display = 'flex';
      return; // 저장 중단 — 사용자가 선택하도록
    }
  }

  const record = {
    id: editingId || genId(),
    userId: currentUser.id,
    date: dateVal,
    weight:     parseFloat(document.getElementById('fWeight').value)     || 0,
    walking:    parseFloat(document.getElementById('fWalking').value)    || 0,
    running:    parseFloat(document.getElementById('fRunning').value)    || 0,
    walkingKm:  parseFloat(document.getElementById('fWalkingKm').value)  || 0,
    runningKm:  parseFloat(document.getElementById('fRunningKm').value)  || 0,
    squats:     parseFloat(document.getElementById('fSquats').value)     || 0,
    pushups:    parseFloat(document.getElementById('fPushups').value)    || 0,
    situps:     parseFloat(document.getElementById('fSitups').value)     || 0,
    water:      parseFloat(document.getElementById('fWater').value)      || 0,
    fasting:    parseFloat(document.getElementById('fFasting').value)    || 0,
    diet:       document.getElementById('fDiet').value,
    condition:  parseInt(document.getElementById('fCondition').value)   || 3,
    memo:       document.getElementById('fMemo').value.trim(),
    customExercises: customExercises.filter(ex => ex.name.trim()),
    savedAt:    new Date().toISOString(),
  };

  try {
    const saved = await Records.saveAsync(record, currentUser.id);
    const existingIdx = userRecords.findIndex(item => item.id === saved.id);
    if (existingIdx >= 0) {
      userRecords[existingIdx] = saved;
    } else {
      userRecords.push(saved);
    }
    showToast('기록이 저장되었습니다! 🎉', 'success');
  } catch (error) {
    console.error('[RecordSave]', error);
    if (error.code === 'duplicate_date' && error.existingRecord) {
      pendingDuplicateRecord = error.existingRecord;
      const modal = document.getElementById('duplicateModal');
      document.getElementById('duplicateModalDate').textContent =
        `${formatDate(dateVal)} 날짜에 이미 작성된 기록이 있습니다.\n기존 기록을 덮어쓰거나 불러올 수 있습니다.`;
      modal.style.display = 'flex';
      return;
    }
    showToast(error.message || '기록 저장 중 오류가 발생했습니다.', 'error');
    return;
  }

  setTimeout(() => {
    window.location.href = 'dashboard.html';
  }, 1200);
}

// ─── 개인 운동 UI ──────────────────────────────────────
function switchExCat(btn, cat) {
  currentExCat = cat;
  // 탭 활성화
  document.querySelectorAll('.custom-ex-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // 프리셋 렌더
  renderExPresets(cat);
}

function renderExPresets(cat) {
  const el = document.getElementById('exPresets');
  if (!el) return;
  const cfg = EX_CAT_CFG[cat];
  if (!cfg) { el.innerHTML = ''; return; }

  el.innerHTML = cfg.presets.map(name => `
    <button type="button" class="preset-chip"
      onclick="addCustomExerciseWithName('${name}')">
      ${cfg.icon} ${name}
    </button>
  `).join('');
}

function addCustomExerciseWithName(name) {
  const ex = { id: genId(), category: currentExCat, name, duration: 30, intensity: '중' };
  customExercises.push(ex);
  renderCustomExList();
  updateSummary();
}

function addCustomExercise() {
  // 프리셋 선택으로만 추가 가능 안내
  showToast('위에서 종목을 선택해 추가하세요 👆', 'default');
  // 프리셋 영역으로 스크롤
  const presetsEl = document.getElementById('exPresets');
  if (presetsEl) presetsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeExercise(id) {
  customExercises = customExercises.filter(ex => ex.id !== id);
  renderCustomExList();
  updateSummary();
}

function renderCustomExList() {
  const container = document.getElementById('customExList');
  if (!container) return;

  if (!customExercises.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = customExercises.map(ex => {
    const cfg = EX_CAT_CFG[ex.category] || EX_CAT_CFG['유산소'];
    return `
      <div class="custom-ex-row" id="exRow_${ex.id}">
        <div class="cat-badge ${cfg.badge}" title="${ex.category}">${cfg.icon}</div>
        <div class="ex-name-label">
          <span class="ex-cat-tag">${ex.category}</span>
          <strong>${ex.name}</strong>
        </div>
        <div class="ex-dur-wrap">
          <input
            type="number"
            min="1" max="999"
            value="${ex.duration}"
            oninput="updateExercise('${ex.id}','duration',this.value); updateSummary()"
          >
          <span>분</span>
        </div>
        <select class="ex-intensity-select"
          onchange="updateExercise('${ex.id}','intensity',this.value)">
          <option value="하" ${ex.intensity === '하' ? 'selected' : ''}>하</option>
          <option value="중" ${ex.intensity === '중' ? 'selected' : ''}>중</option>
          <option value="상" ${ex.intensity === '상' ? 'selected' : ''}>상</option>
        </select>
        <button type="button" class="ex-remove-btn"
          onclick="removeExercise('${ex.id}')">✕</button>
      </div>
    `;
  }).join('');
}

function updateExercise(id, field, value) {
  const ex = customExercises.find(e => e.id === id);
  if (!ex) return;
  ex[field] = field === 'duration' ? (parseFloat(value) || 0) : value;
}
