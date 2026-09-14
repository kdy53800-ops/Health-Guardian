/* ===================================================
   record.js — Workout Recording Logic
   건강지킴이
   =================================================== */

let currentUser = null;
let userGoals = null;
let userRecords = [];
let editingId = null;
let selectedCondition = 3;
let isSaving = false;
let draftTimer = null;

const RECORD_DRAFT_PREFIX = 'HealthGuardian_recordDraft_v1';
const RECORD_FIELD_IDS = [
  'fDate', 'fWeight', 'fHeartRate', 'fWalking', 'fRunning',
  'fWalkingKm', 'fRunningKm', 'fWater', 'fFasting', 'fMemo'
];

// 개인 운동 상태
let currentExCat = '유산소'; // 현재 선택된 카테고리
let customExercises = [];     // [{ id, category, name, duration, intensity }]

// 카테고리별 정보
const EX_CAT_CFG = {
  '유산소': {
    icon: '🏊',
    cls: 'cat-cardio',
    badge: 'cat-badge-cardio',
    presets: ['자전거', '수영', '줄넘기', '에어로빅', '등산', '기타'],
  },
  '근력': {
    icon: '🏋️',
    cls: 'cat-strength',
    badge: 'cat-badge-strength',
    presets: ['덤벨 운동', '바벨 운동', '케틀벨', '맨몸 운동', '코어 운동', '기타'],
  },
  '유연성': {
    icon: '🧘',
    cls: 'cat-flex',
    badge: 'cat-badge-flex',
    presets: ['요가', '필라테스', '스트레칭', '밸런스 트레이닝', '기타'],
  },
  '스포츠': {
    icon: '⚽',
    cls: 'cat-sports',
    badge: 'cat-badge-sports',
    presets: ['축구', '농구', '테니스', '배드민턴', '탁구', '볼링', '수영', '골프', '클라이밍', '베이스볼', '기타'],
  },
};


const GOAL_LABELS = {
  walking:  { label: '걷기 목표', unit: '분', color: 'green' },
  running:  { label: '러닝 목표', unit: '분', color: 'green' },
  water:    { label: '수분섭취 목표', unit: 'ml', color: 'gold' },
  fasting:  { label: '공복시간 목표', unit: '시간', color: 'gold' },
  customEx: { label: '개인운동 총 시간 목표', unit: '분', color: 'purple' },
};

// 날짜 중복 모달에서 참조할 기존 기록
let pendingDuplicateRecord = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof Auth.checkAndRestoreSession === 'function') {
    await Auth.checkAndRestoreSession();
  }
  currentUser = Auth.require();
  if (!currentUser) return;

  // 날짜 제한 설정 (미래 불가)
  const todayStr = today();
  const dateInput = document.getElementById('fDate');
  if (dateInput) {
    dateInput.setAttribute('max', todayStr);
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
    // 신규 기록: 어제 날짜 기본 세팅 (사용자 요청)
    if (dateInput) dateInput.value = prevDay(todayStr);
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

  restoreRecordDraft();
  initDraftAutosave();
  updateRecentRecordButton();
});

function getRecordDraftKey() {
  const mode = editingId ? `edit_${editingId}` : 'new';
  return `${RECORD_DRAFT_PREFIX}_${currentUser.id}_${mode}`;
}

function collectDraft() {
  const fields = {};
  RECORD_FIELD_IDS.forEach(id => {
    const input = document.getElementById(id);
    if (input) fields[id] = input.value;
  });
  return {
    fields,
    condition: selectedCondition,
    customExercises: customExercises.map(item => ({ ...item })),
    updatedAt: Date.now(),
  };
}

function setDraftStatus(message, state = '') {
  const status = document.getElementById('draftStatus');
  if (!status) return;
  status.className = `draft-status ${state}`.trim();
  status.replaceChildren();
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = state === 'restored' ? '↺' : '💾';
  const text = document.createElement('span');
  text.textContent = message;
  status.append(icon, text);
}

function saveRecordDraft() {
  if (!currentUser) return;
  try {
    localStorage.setItem(getRecordDraftKey(), JSON.stringify(collectDraft()));
    setDraftStatus('방금 임시 저장됨', 'saved');
  } catch (error) {
    console.warn('[RecordDraft] Failed to save draft:', error);
    setDraftStatus('임시 저장을 사용할 수 없습니다.');
  }
}

function scheduleDraftSave() {
  clearTimeout(draftTimer);
  setDraftStatus('입력 내용을 저장하는 중…');
  draftTimer = setTimeout(saveRecordDraft, 500);
}

function clearRecordDraft() {
  clearTimeout(draftTimer);
  if (!currentUser) return;
  const prefix = `${RECORD_DRAFT_PREFIX}_${currentUser.id}_`;
  Object.keys(localStorage)
    .filter(key => key.startsWith(prefix))
    .forEach(key => localStorage.removeItem(key));
}

function restoreRecordDraft() {
  if (!currentUser) return;
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(getRecordDraftKey()) || 'null');
  } catch (error) {
    localStorage.removeItem(getRecordDraftKey());
  }
  if (!draft || !draft.fields || typeof draft.fields !== 'object') return;
  if (!Number.isFinite(Number(draft.updatedAt)) || Date.now() - Number(draft.updatedAt) > 7 * 24 * 60 * 60 * 1000) {
    localStorage.removeItem(getRecordDraftKey());
    return;
  }

  RECORD_FIELD_IDS.forEach(id => {
    const input = document.getElementById(id);
    if (input && Object.prototype.hasOwnProperty.call(draft.fields, id)) {
      input.value = draft.fields[id];
    }
  });
  if (Number(draft.condition) >= 1 && Number(draft.condition) <= 5) {
    setCondition(Number(draft.condition));
  }
  if (Array.isArray(draft.customExercises)) {
    customExercises = draft.customExercises.slice(0, 30).map(item => ({
      id: item.id || genId(),
      category: item.category || '유산소',
      name: String(item.name || '').slice(0, 80),
      duration: clamp(item.duration, 1, 999),
      intensity: ['하', '중', '상'].includes(item.intensity) ? item.intensity : '중',
    })).filter(item => item.name);
    renderCustomExList();
  }
  updateSummary();
  ['fWalking', 'fRunning', 'fWater', 'fFasting'].forEach(id => {
    const key = id.slice(1).toLowerCase();
    const capKey = key.charAt(0).toUpperCase() + key.slice(1);
    updateProgress(id, `progress${capKey}`, `pct${capKey}`, key);
  });
  setDraftStatus('이전에 입력하던 내용을 복원했습니다.', 'restored');
}

function initDraftAutosave() {
  const form = document.getElementById('recordForm');
  if (!form) return;
  form.dataset.draftReady = '1';
  form.addEventListener('input', scheduleDraftSave);
  form.addEventListener('change', scheduleDraftSave);
}

function updateRecentRecordButton() {
  const button = document.getElementById('loadRecentBtn');
  if (!button) return;
  button.disabled = !!editingId || !userRecords.length;
  button.title = editingId
    ? '수정 중에는 최근 기록을 불러올 수 없습니다.'
    : (userRecords.length ? '가장 최근 기록의 입력값을 현재 날짜에 적용합니다.' : '불러올 기록이 없습니다.');
}

function loadRecentRecord() {
  if (editingId) return;
  const targetDate = document.getElementById('fDate').value;
  const recent = [...userRecords]
    .filter(record => record.id !== editingId && record.date !== targetDate)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!recent) {
    showToast('불러올 이전 기록이 없습니다.', 'default');
    return;
  }

  const preservedDate = targetDate;
  populateForm({ ...recent, date: preservedDate, memo: '' });
  document.getElementById('fDate').value = preservedDate;
  editingId = null;
  scheduleDraftSave();
  showToast(`${formatDate(recent.date)} 기록을 불러왔습니다. 날짜와 내용을 확인해 주세요.`, 'success');
}

function addWater(amount) {
  const input = document.getElementById('fWater');
  const next = Math.min((parseFloat(input.value) || 0) + amount, 9999);
  input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── 기존 기록 모달 컨트롤 ────────────────────────────
function loadExistingRecord() {
  if (!pendingDuplicateRecord) return;
  clearRecordDraft();
  editingId = pendingDuplicateRecord.id;
  populateForm(pendingDuplicateRecord);
  document.getElementById('saveBtn').textContent = '✏️ 수정 저장';
  document.getElementById('pageSubtitle').textContent = '기존 기록을 불러왔습니다. 수정 후 저장하세요.';
  updateRecentRecordButton();
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
  document.getElementById('fHeartRate').value = record.heartRate || '';
  document.getElementById('fWalking').value = record.walking || '';
  document.getElementById('fRunning').value = record.running || '';
  document.getElementById('fWalkingKm').value = record.walkingKm || '';
  document.getElementById('fRunningKm').value = record.runningKm || '';
  document.getElementById('fWater').value = record.water || '';
  document.getElementById('fFasting').value = record.fasting || '';
  document.getElementById('fMemo').value = record.memo || '';

  const cond = record.condition || 3;
  setCondition(cond);

  // 개인 운동 로드
  if (record.customExercises && record.customExercises.length > 0) {
    customExercises = record.customExercises.map(e => ({ ...e, id: e.id || genId() }));
  } else {
    customExercises = [];
  }
  renderCustomExList();

  // Update all progress bars (목표 있는 항목만)
  ['fWalking','fRunning','fWater','fFasting'].forEach(id => {
    const capKey = id.slice(1).charAt(0).toUpperCase() + id.slice(2);
    updateProgress(id, `progress${capKey}`, `pct${capKey}`, id.slice(1).toLowerCase());
  });
  
  // 개인운동 총 시간 진행률 업데이트
  const customMins = record.customExercises ? record.customExercises.reduce((s, ex) => s + (ex.duration || 0), 0) : 0;
  const customGoal = userGoals.customEx || 0;
  const customPct = customGoal > 0 ? Math.min(Math.round((customMins / customGoal) * 100), 100) : 0;
  const pBar = document.getElementById('progressCustomEx');
  const pPct = document.getElementById('pctCustomEx');
  if (pBar) pBar.style.width = customPct + '%';
  if (pPct) pPct.textContent = customPct + '%';

  updateSummary();
}

function setCondition(val) {
  selectedCondition = val;
  document.getElementById('fCondition').value = val;
  for (let i = 1; i <= 5; i++) {
    const button = document.getElementById(`cond${i}`);
    button.classList.toggle('selected', i === val);
    button.setAttribute('aria-pressed', String(i === val));
  }
  const form = document.getElementById('recordForm');
  if (form && form.dataset.draftReady === '1') scheduleDraftSave();
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
    Water:   { key: 'water',   unit: 'ml' },
    Fasting: { key: 'fasting', unit: '시간' },
    CustomEx: { key: 'customEx', unit: '분' },
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
  const water   = parseFloat(document.getElementById('fWater').value)   || 0;

  // 개인 운동 합산 시간
  const customMins = customExercises.reduce((sum, ex) => sum + (ex.duration || 0), 0);

  document.getElementById('sumExercise').textContent = walking + running + customMins;
  document.getElementById('sumWater').textContent = water;

  // goal achievement
  const goals = userGoals || GoalDefaults;
  const checks = [
    walking >= goals.walking,
    running >= goals.running,
    water   >= goals.water,
  ];

  // 개인 운동 총 시간 목표 체크 (0이 아닌 경우만)
  if (goals.customEx > 0) {
    checks.push(customMins >= goals.customEx);
    // 진척도 바 업데이트
    const customPct = Math.min(Math.round((customMins / goals.customEx) * 100), 100);
    const pBar = document.getElementById('progressCustomEx');
    const pPct = document.getElementById('pctCustomEx');
    if (pBar) pBar.style.width = customPct + '%';
    if (pPct) pPct.textContent = customPct + '%';
  }

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
      <label for="goal_${escapeAttribute(key)}">${escapeHtml(cfg.label)} (${escapeHtml(cfg.unit)})</label>
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
    fWater: 'water', fFasting: 'fasting'
  };
  for (const [fid, key] of Object.entries(map)) {
    const capKey = key.charAt(0).toUpperCase() + key.slice(1);
    updateProgress(fid, `progress${capKey}`, `pct${capKey}`, key);
  }
  updateSummary();
  showToast('목표가 저장되었습니다! 🎯', 'success');
}

// ─── Save Record ──────────────────────────────────────
async function handleSave(e) {
  e.preventDefault();

  if (isSaving) return;
  if (!e.currentTarget.reportValidity()) return;

  const dateVal = document.getElementById('fDate').value;
  if (!dateVal) {
    showToast('날짜를 선택해주세요.', 'error');
    return;
  }

  // 날짜 제한 검증 (미래 불가)
  const todayStr = today();
  if (dateVal > todayStr) {
    showToast('미래 날짜는 기록할 수 없습니다. 🚫', 'error');
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
    heartRate:  parseInt(document.getElementById('fHeartRate').value)    || 0,
    walking:    parseFloat(document.getElementById('fWalking').value)    || 0,
    running:    parseFloat(document.getElementById('fRunning').value)    || 0,
    walkingKm:  parseFloat(document.getElementById('fWalkingKm').value)  || 0,
    runningKm:  parseFloat(document.getElementById('fRunningKm').value)  || 0,
    water:      parseFloat(document.getElementById('fWater').value)      || 0,
    fasting:    parseFloat(document.getElementById('fFasting').value)    || 0,
    condition:  parseInt(document.getElementById('fCondition').value)   || 3,
    memo:       document.getElementById('fMemo').value.trim(),
    customExercises: customExercises.filter(ex => ex.name.trim()),
    savedAt:    new Date().toISOString(),
  };

  const saveButton = document.getElementById('saveBtn');
  const originalButtonText = saveButton.textContent;
  isSaving = true;
  saveButton.disabled = true;
  saveButton.textContent = '⏳ 저장하는 중…';

  try {
    const saved = await Records.saveAsync(record, currentUser.id);
    const existingIdx = userRecords.findIndex(item => item.id === saved.id);
    if (existingIdx >= 0) {
      userRecords[existingIdx] = saved;
    } else {
      userRecords.push(saved);
    }
    clearRecordDraft();
    showToast(saved._pendingSync ? '네트워크가 불안정해 이 기기에 저장했습니다. 연결되면 자동 동기화됩니다.' : '기록이 저장되었습니다! 🎉', saved._pendingSync ? 'default' : 'success');
  } catch (error) {
    console.error('[RecordSave]', error);
    if (error.code === 'duplicate_date' && error.existingRecord) {
      pendingDuplicateRecord = error.existingRecord;
      const modal = document.getElementById('duplicateModal');
      document.getElementById('duplicateModalDate').textContent =
        `${formatDate(dateVal)} 날짜에 이미 작성된 기록이 있습니다.\n기존 기록을 덮어쓰거나 불러올 수 있습니다.`;
      modal.style.display = 'flex';
      isSaving = false;
      saveButton.disabled = false;
      saveButton.textContent = originalButtonText;
      return;
    }
    showToast(error.message || '기록 저장 중 오류가 발생했습니다.', 'error');
    isSaving = false;
    saveButton.disabled = false;
    saveButton.textContent = originalButtonText;
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
  scheduleDraftSave();
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
  scheduleDraftSave();
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
      <div class="custom-ex-row" id="exRow_${escapeAttribute(ex.id)}">
        <div class="cat-badge ${cfg.badge}" title="${escapeAttribute(ex.category)}">${cfg.icon}</div>
        <div class="ex-name-label">
          <span class="ex-cat-tag">${escapeHtml(ex.category)}</span>
          <strong>${escapeHtml(ex.name)}</strong>
        </div>
        <div class="ex-dur-wrap">
          <input
            type="number"
            min="1" max="999"
            aria-label="${escapeAttribute(ex.name)} 운동 시간(분)"
            value="${escapeAttribute(ex.duration)}"
            data-exercise-id="${escapeAttribute(ex.id)}"
            oninput="updateExercise(this.dataset.exerciseId,'duration',this.value); updateSummary()"
          >
          <span>분</span>
        </div>
        <select class="ex-intensity-select"
          aria-label="${escapeAttribute(ex.name)} 운동 강도"
          data-exercise-id="${escapeAttribute(ex.id)}"
          onchange="updateExercise(this.dataset.exerciseId,'intensity',this.value)">
          <option value="하" ${ex.intensity === '하' ? 'selected' : ''}>하</option>
          <option value="중" ${ex.intensity === '중' ? 'selected' : ''}>중</option>
          <option value="상" ${ex.intensity === '상' ? 'selected' : ''}>상</option>
        </select>
        <button type="button" class="ex-remove-btn"
          aria-label="${escapeAttribute(ex.name)} 운동 삭제"
          data-exercise-id="${escapeAttribute(ex.id)}"
          onclick="removeExercise(this.dataset.exerciseId)">✕</button>
      </div>
    `;
  }).join('');
}

function updateExercise(id, field, value) {
  const ex = customExercises.find(e => e.id === id);
  if (!ex) return;
  ex[field] = field === 'duration' ? (parseFloat(value) || 0) : value;
  scheduleDraftSave();
}
