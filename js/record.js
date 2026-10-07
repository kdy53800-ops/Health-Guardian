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
const EXERCISE_FAVORITES_PREFIX = 'HealthGuardian_exerciseFavorites_v1';
const RECORD_ROUTINES_PREFIX = 'HealthGuardian_recordRoutines_v1';
const RECORD_ROUTINES_MIGRATED_PREFIX = 'HealthGuardian_recordRoutinesMigrated_v1';
const RECORD_DEFAULT_DATE_PREFIX = 'HealthGuardian_recordDefaultDate_v1';
const MAX_RECORD_ROUTINES = 5;
const RECORD_FIELD_IDS = [
  'fDate', 'fWeight', 'fHeartRate', 'fWalking', 'fRunning',
  'fWalkingKm', 'fRunningKm', 'fWater', 'fFasting', 'fMemo'
];

// 개인 운동 상태
let currentExCat = '유산소'; // 현재 선택된 카테고리
let customExercises = [];     // [{ id, category, name, duration, intensity, sets, reps }]
let favoriteExercises = [];
let recentExerciseTemplates = [];
let recordRoutines = [];
let routineServerReady = false;
let activeStrengthTemplate = 1;
let exerciseShortcutTrigger = null;
let pendingRecordImport = null;

const STRENGTH_TEMPLATES = [
  { label: '가볍게 2세트 × 12회', sets: 2, reps: 12, duration: 20 },
  { label: '기본 3세트 × 10회', sets: 3, reps: 10, duration: 30 },
  { label: '집중 4세트 × 8회', sets: 4, reps: 8, duration: 40 },
];

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
let replacingRecord = null;

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
  const defaultDateSelect = document.getElementById('defaultRecordDate');
  if (defaultDateSelect) defaultDateSelect.value = getDefaultRecordDate();

  userGoals = Goals.get(currentUser.id);
  userRecords = await Records.getUserRecordsAsync(currentUser.id);
  favoriteExercises = loadFavoriteExercises();
  recentExerciseTemplates = buildRecentExerciseTemplates();
  recordRoutines = loadRecordRoutines();
  routineServerReady = currentUser.authProvider === 'test';
  await syncRecordRoutines();

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
    if (dateInput) dateInput.value = getDefaultRecordDate() === 'today' ? todayStr : prevDay(todayStr);
  }

  // 날짜 변경 시 기존 기록 여부 확인
  document.getElementById('fDate').addEventListener('change', function() {
    handleRecordDateChange(this.value);
  });

  initGoalEditors();
  renderTargets();
  updateSummary();
  setCondition(selectedCondition);

  // 개인 운동 초기화: 탭 기본값 렌더
  switchExCat(document.querySelector('.custom-ex-tab'), '유산소');
  renderExerciseShortcuts();
  updateSyncStatus();

  restoreRecordDraft();
  initDraftAutosave();
  updateRecentRecordButton();
  updateRoutineCount();

  window.addEventListener('online', () => {
    updateSyncStatus('syncing');
    window.setTimeout(updateSyncStatus, 900);
  });
  window.addEventListener('offline', updateSyncStatus);
  window.addEventListener('records-outbox-change', updateSyncStatus);
  window.addEventListener('records-sync-start', () => updateSyncStatus('syncing'));
  window.addEventListener('records-sync-complete', updateSyncStatus);
});

function getDefaultRecordDate() {
  if (!currentUser) return 'yesterday';
  try {
    return localStorage.getItem(`${RECORD_DEFAULT_DATE_PREFIX}_${currentUser.id}`) === 'today' ? 'today' : 'yesterday';
  } catch (error) {
    return 'yesterday';
  }
}

function changeDefaultRecordDate(value) {
  if (!currentUser || !['today', 'yesterday'].includes(value)) return;
  try {
    localStorage.setItem(`${RECORD_DEFAULT_DATE_PREFIX}_${currentUser.id}`, value);
  } catch (error) {
    showToast('기본 날짜 설정을 저장하지 못했습니다.', 'error');
    return;
  }
  if (editingId) return;
  const input = document.getElementById('fDate');
  input.value = value === 'today' ? today() : prevDay(today());
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const form = document.getElementById('recordForm');
  if (form && form.dataset.draftReady === '1') {
    clearTimeout(draftTimer);
    saveRecordDraft();
  }
}

function favoriteStorageKey() {
  return `${EXERCISE_FAVORITES_PREFIX}_${currentUser.id}`;
}

function normalizeExerciseTemplate(item) {
  const duration = Number(item && item.duration);
  const sets = Number(item && item.sets);
  const reps = Number(item && item.reps);
  return {
    category: EX_CAT_CFG[item && item.category] ? item.category : '유산소',
    name: String((item && item.name) || '').slice(0, 80),
    duration: Number.isFinite(duration) && duration > 0 ? clamp(duration, 1, 999) : 30,
    intensity: ['하', '중', '상'].includes(item && item.intensity) ? item.intensity : '중',
    sets: Number.isFinite(sets) && sets > 0 ? clamp(sets, 1, 99) : 3,
    reps: Number.isFinite(reps) && reps > 0 ? clamp(reps, 1, 999) : 10,
  };
}

function exerciseTemplateKey(item) {
  return `${item.category}::${String(item.name || '').trim().toLowerCase()}`;
}

function loadFavoriteExercises() {
  try {
    const value = JSON.parse(localStorage.getItem(favoriteStorageKey()) || '[]');
    return Array.isArray(value) ? value.map(normalizeExerciseTemplate).filter(item => item.name).slice(0, 20) : [];
  } catch (error) {
    return [];
  }
}

function saveFavoriteExercises() {
  localStorage.setItem(favoriteStorageKey(), JSON.stringify(favoriteExercises.slice(0, 20)));
}

function buildRecentExerciseTemplates() {
  const seen = new Set();
  const recent = [];
  [...userRecords].sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach(record => {
    (record.customExercises || []).forEach(exercise => {
      const item = normalizeExerciseTemplate(exercise);
      const key = exerciseTemplateKey(item);
      if (item.name && !seen.has(key) && recent.length < 8) {
        seen.add(key);
        recent.push(item);
      }
    });
  });
  return recent;
}

function isFavoriteExercise(item) {
  const key = exerciseTemplateKey(item);
  return favoriteExercises.some(favorite => exerciseTemplateKey(favorite) === key);
}

function toggleFavoriteExercise(category, name, exerciseId = '') {
  const current = customExercises.find(item => item.id === exerciseId);
  const template = normalizeExerciseTemplate(current || { category, name, duration: 30, intensity: '중' });
  const key = exerciseTemplateKey(template);
  const index = favoriteExercises.findIndex(item => exerciseTemplateKey(item) === key);
  if (index >= 0) {
    favoriteExercises.splice(index, 1);
    showToast(`즐겨찾기에서 해제했습니다: ${template.name}`, 'default');
  } else {
    favoriteExercises.unshift(template);
    showToast(`즐겨찾기에 추가했습니다: ${template.name}`, 'success');
  }
  saveFavoriteExercises();
  renderExerciseShortcuts();
  renderExPresets(currentExCat);
  renderCustomExList();
}

function addExerciseTemplate(item) {
  const template = normalizeExerciseTemplate(item);
  customExercises.push({ id: genId(), ...template });
  renderCustomExList();
  updateSummary();
  scheduleDraftSave();
  showToast(`운동을 추가했습니다: ${template.name}`, 'success');
}

function addFavoriteExercise(index) {
  if (favoriteExercises[index]) addExerciseTemplate(favoriteExercises[index]);
}

function addRecentExercise(index) {
  if (recentExerciseTemplates[index]) addExerciseTemplate(recentExerciseTemplates[index]);
}

function openExerciseShortcut(kind, trigger) {
  const dialog = document.getElementById('exerciseShortcutDialog');
  const source = document.getElementById(kind === 'favorites' ? 'favoriteExerciseList' : 'recentExerciseList');
  if (!dialog || !source || !['favorites', 'recent'].includes(kind)) return;
  exerciseShortcutTrigger = trigger;
  document.getElementById('exerciseShortcutDialogTitle').textContent = kind === 'favorites' ? '⭐ 즐겨찾기' : '🕒 최근 운동';
  document.getElementById('exerciseShortcutDialogList').innerHTML = source.innerHTML;
  dialog.showModal();
}

function closeExerciseShortcut() {
  document.getElementById('exerciseShortcutDialog')?.close();
}

function handleExerciseShortcutDialogClick(event) {
  if (event.target.closest('.quick-exercise-chip')) closeExerciseShortcut();
}

function restoreExerciseShortcutFocus() {
  exerciseShortcutTrigger?.focus();
  exerciseShortcutTrigger = null;
}

function selectStrengthTemplate(index) {
  if (!STRENGTH_TEMPLATES[index]) return;
  activeStrengthTemplate = index;
  renderExerciseShortcuts();
}

function renderExerciseShortcuts() {
  const favorites = document.getElementById('favoriteExerciseList');
  const recent = document.getElementById('recentExerciseList');
  const templateGroup = document.getElementById('strengthTemplateGroup');
  const templateList = document.getElementById('strengthTemplateList');
  if (favorites) {
    favorites.innerHTML = favoriteExercises.length
      ? favoriteExercises.map((item, index) => `<button type="button" class="quick-exercise-chip" onclick="addFavoriteExercise(${index})">${EX_CAT_CFG[item.category].icon} ${escapeHtml(item.name)}</button>`).join('')
      : '<span class="exercise-shortcut-empty">종목 옆 ☆를 눌러 추가해 보세요.</span>';
  }
  if (recent) {
    recent.innerHTML = recentExerciseTemplates.length
      ? recentExerciseTemplates.map((item, index) => `<button type="button" class="quick-exercise-chip" onclick="addRecentExercise(${index})">${EX_CAT_CFG[item.category].icon} ${escapeHtml(item.name)}</button>`).join('')
      : '<span class="exercise-shortcut-empty">운동을 저장하면 최근 종목이 표시됩니다.</span>';
  }
  if (templateGroup) templateGroup.hidden = currentExCat !== '근력';
  if (templateList) {
    templateList.innerHTML = STRENGTH_TEMPLATES.map((item, index) => `<button type="button" class="set-template-chip ${index === activeStrengthTemplate ? 'active' : ''}" aria-pressed="${index === activeStrengthTemplate}" onclick="selectStrengthTemplate(${index})">${escapeHtml(item.label)}</button>`).join('');
  }
}

function updateSyncStatus(mode = '') {
  const status = document.getElementById('syncStatus');
  if (!status || !currentUser) return;
  const pending = typeof Records.getPendingCount === 'function' ? Records.getPendingCount(currentUser.id) : 0;
  let state = '';
  let icon = '☁️';
  let message = '서버와 동기화됨';
  let retry = false;
  if (!navigator.onLine) {
    state = 'offline'; icon = '📴'; message = pending ? `오프라인 · ${pending}건 동기화 대기` : '오프라인 · 입력 내용은 기기에 보관됩니다';
  } else if (mode === 'syncing' || pending) {
    state = mode === 'syncing' ? 'syncing' : 'waiting'; icon = '⏳'; message = mode === 'syncing' ? `${pending}건 동기화 중…` : `${pending}건 동기화 대기`;
    retry = pending > 0 && mode !== 'syncing';
  }
  status.className = `sync-status ${state}`.trim();
  status.innerHTML = `<span aria-hidden="true">${icon}</span><span>${message}</span>${retry ? '<button type="button" class="sync-retry-btn" onclick="retryPendingSync()">지금 동기화</button>' : ''}`;
}

async function retryPendingSync() {
  if (!navigator.onLine) { updateSyncStatus(); return; }
  updateSyncStatus('syncing');
  const synced = await Records.syncPending(currentUser.id);
  updateSyncStatus();
  if (synced) showToast(`대기 중이던 ${synced}건을 동기화했습니다.`, 'success');
}

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
  const hasInput = RECORD_FIELD_IDS.some(id => id !== 'fDate' && draft.fields[id] !== '' && draft.fields[id] != null)
    || (Array.isArray(draft.customExercises) && draft.customExercises.length > 0)
    || (Number(draft.condition) >= 1 && Number(draft.condition) <= 5 && Number(draft.condition) !== 3);
  if (!hasInput) {
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
      ...normalizeExerciseTemplate(item),
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
    : (userRecords.length ? '가장 최근 기록의 내용을 확인한 뒤 현재 날짜에 불러옵니다.' : '불러올 기록이 없습니다.');
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

  openRecordImportPreview('recent', recent);
}

function importExerciseDetails(exercises) {
  return exercises.length ? `<ul class="record-import-exercises">${exercises.map(exercise => {
    const details = [`${Number(exercise.duration) || 0}분`];
    if (exercise.category === '근력') details.push(`${Number(exercise.sets) || 0}세트 × ${Number(exercise.reps) || 0}회`);
    if (exercise.intensity) details.push(`강도 ${exercise.intensity}`);
    return `<li><strong>${escapeHtml(exercise.name || '')}</strong><span>${escapeHtml(details.join(' · '))}</span></li>`;
  }).join('')}</ul>` : '<p class="record-import-empty">개인 운동 없음</p>';
}

function importValue(label, value, unit = '') {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${value === '' || value == null ? '—' : `${escapeHtml(String(value))}${unit}`}</dd></div>`;
}

function openRecordImportPreview(type, item) {
  const dialog = document.getElementById('recordImportDialog');
  const content = document.getElementById('recordImportContent');
  if (!dialog || !content) return;
  pendingRecordImport = { type, item };
  const isRoutine = type === 'routine';
  const title = isRoutine ? `‘${item.name}’ 루틴 확인` : `${formatDate(item.date)} 기록 확인`;
  document.getElementById('recordImportTitle').textContent = title;
  const details = [
    importValue('걷기', item.walking, '분'), importValue('걷기 거리', item.walkingKm, 'km'),
    importValue('러닝', item.running, '분'), importValue('러닝 거리', item.runningKm, 'km'),
  ];
  if (!isRoutine) details.push(
    importValue('체중', item.weight, 'kg'), importValue('심박수', item.heartRate, 'bpm'),
    importValue('수분 섭취', item.water, 'ml'), importValue('공복 시간', item.fasting, '시간'),
    importValue('컨디션', item.condition, '/5'),
  );
  const hasCurrentInput = isRoutine
    ? ['fWalking', 'fWalkingKm', 'fRunning', 'fRunningKm'].some(id => document.getElementById(id).value !== '') || customExercises.length > 0
    : RECORD_FIELD_IDS.some(id => id !== 'fDate' && document.getElementById(id).value !== '') || customExercises.length > 0;
  content.innerHTML = `
    <p class="record-import-note">${isRoutine
      ? '운동 항목만 불러옵니다. 날짜와 건강 지표는 그대로 둡니다.'
      : '현재 선택한 날짜는 유지하며, 이전 기록의 메모는 불러오지 않습니다.'}</p>
    ${hasCurrentInput ? '<p class="record-import-warning">현재 입력한 해당 항목은 불러온 내용으로 바뀝니다.</p>' : ''}
    <dl class="record-import-values">${details.join('')}</dl>
    <h4>개인 운동</h4>${importExerciseDetails(Array.isArray(item.customExercises) ? item.customExercises : [])}
    ${!isRoutine && item.memo ? `<p class="record-import-note">이전 메모: ${escapeHtml(item.memo)}</p>` : ''}
    <p class="record-import-note">불러온 뒤 입력 화면에서 수정할 수 있습니다. 기록은 저장 버튼을 눌러야 저장됩니다.</p>`;
  const routineDialog = document.getElementById('routineDialog');
  if (routineDialog && routineDialog.open) routineDialog.close();
  dialog.showModal();
}

function closeRecordImportPreview() {
  const dialog = document.getElementById('recordImportDialog');
  if (dialog && dialog.open) dialog.close();
  pendingRecordImport = null;
}

function confirmRecordImport() {
  if (!pendingRecordImport) return;
  const { type, item } = pendingRecordImport;
  if (type === 'routine') {
    for (const [id, value] of Object.entries({
      fWalking: item.walking, fWalkingKm: item.walkingKm,
      fRunning: item.running, fRunningKm: item.runningKm,
    })) document.getElementById(id).value = value || '';
    customExercises = item.customExercises.map(exercise => ({ ...exercise, id: genId() }));
    renderCustomExList();
    updateProgress('fWalking', 'progressWalking', 'pctWalking', 'walking');
    updateProgress('fRunning', 'progressRunning', 'pctRunning', 'running');
  } else {
    const preservedDate = document.getElementById('fDate').value;
    populateForm({ ...item, date: preservedDate, memo: '' });
    document.getElementById('fDate').value = preservedDate;
  }
  updateSummary();
  scheduleDraftSave();
  closeRecordImportPreview();
  showToast('내용을 불러왔습니다. 필요한 항목을 수정한 뒤 기록을 저장해 주세요.', 'success');
}

function routineStorageKey() {
  return `${RECORD_ROUTINES_PREFIX}_${currentUser.id}`;
}

function routineMigrationKey() {
  return `${RECORD_ROUTINES_MIGRATED_PREFIX}_${currentUser.id}`;
}

function normalizeRoutine(item) {
  if (!item || typeof item !== 'object' || !item.id || !String(item.name || '').trim()) return null;
  const number = (value, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, 0, max) : 0;
  };
  return {
    id: String(item.id).slice(0, 100),
    slot: Number.isInteger(Number(item.slot)) && Number(item.slot) >= 1 && Number(item.slot) <= MAX_RECORD_ROUTINES ? Number(item.slot) : null,
    name: String(item.name).trim().slice(0, 30),
    walking: number(item.walking, 999),
    walkingKm: number(item.walkingKm, 999),
    running: number(item.running, 999),
    runningKm: number(item.runningKm, 999),
    customExercises: Array.isArray(item.customExercises)
      ? item.customExercises.slice(0, 30).map(normalizeExerciseTemplate).filter(exercise => exercise.name)
      : [],
  };
}

function loadRecordRoutines() {
  if (!currentUser) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(routineStorageKey()) || '[]');
    return Array.isArray(saved) ? saved.slice(0, MAX_RECORD_ROUTINES).map(normalizeRoutine).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function routineApiUrl(slot = null) {
  const url = new URL('api/records', window.location.href);
  url.searchParams.set('view', 'routines');
  if (slot != null) url.searchParams.set('slot', String(slot));
  return url.toString();
}

async function requestRoutineApi(method, routineOrSlot = null) {
  const response = await fetch(routineApiUrl(method === 'DELETE' ? routineOrSlot : null), {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(routineOrSlot) } : {}),
  });
  const payload = await response.json();
  if (!response.ok || !payload || !payload.ok) throw new Error(payload && payload.message || '루틴 서버에 연결하지 못했습니다.');
  return payload;
}

async function syncRecordRoutines() {
  if (currentUser.authProvider === 'test') return;
  const local = localStorage.getItem(routineMigrationKey()) === '1' ? [] : recordRoutines;
  try {
    const payload = await requestRoutineApi('GET');
    const cloud = payload.routines.map(normalizeRoutine).filter(Boolean);
    let unmerged = 0;
    for (const routine of local) {
      if (cloud.some(item => item.id === routine.id)) continue;
      const freeSlot = Array.from({ length: MAX_RECORD_ROUTINES }, (_, index) => index + 1).find(slot => !cloud.some(item => item.slot === slot));
      if (!freeSlot) { unmerged += 1; continue; }
      const saved = await requestRoutineApi('POST', { ...routine, slot: freeSlot });
      cloud.push(normalizeRoutine(saved.routine));
    }
    cloud.sort((a, b) => a.slot - b.slot);
    recordRoutines = cloud;
    routineServerReady = true;
    if (!unmerged) {
      localStorage.setItem(routineStorageKey(), JSON.stringify(cloud));
      localStorage.setItem(routineMigrationKey(), '1');
    }
    else showToast(`${unmerged}개 기기 루틴을 옮기지 못했습니다. DB 루틴을 정리한 뒤 새로고침해 주세요.`, 'error');
    const note = document.getElementById('routineStorageNote');
    if (note) note.textContent = '실제 계정의 루틴은 DB에 저장되어 다른 기기에서도 사용할 수 있습니다. 기존 기기 루틴은 빈 자리에 자동으로 옮깁니다.';
  } catch (error) {
    console.warn('[RecordRoutines] Sync failed:', error.message);
    showToast('루틴 DB에 연결하지 못했습니다. 기록 입력은 계속할 수 있습니다.', 'error');
  }
  updateRoutineCount();
}

async function persistRecordRoutines(next, operation) {
  if (currentUser.authProvider === 'test') {
    try { localStorage.setItem(routineStorageKey(), JSON.stringify(next)); }
    catch (error) {
      showToast('루틴을 이 기기에 저장하지 못했습니다. 저장 공간을 확인해 주세요.', 'error');
      return false;
    }
  }
  if (currentUser.authProvider !== 'test') {
    if (!routineServerReady) {
      showToast('루틴 DB에 연결한 뒤 다시 시도해 주세요.', 'error');
      return false;
    }
    try {
      if (operation.type === 'delete') await requestRoutineApi('DELETE', operation.slot);
      else await requestRoutineApi('POST', operation.routine);
    } catch (error) {
      showToast(error.message || '루틴을 DB에 저장하지 못했습니다.', 'error');
      return false;
    }
  }
  recordRoutines = next;
  updateRoutineCount();
  renderRecordRoutines();
  if (currentUser.authProvider !== 'test') {
    try { localStorage.setItem(routineStorageKey(), JSON.stringify(next)); }
    catch (error) { console.warn('[RecordRoutines] Local cache unavailable:', error.message); }
  }
  return true;
}

function captureCurrentRoutine(name, id = genId()) {
  const fields = ['fWalking', 'fWalkingKm', 'fRunning', 'fRunningKm'];
  const invalid = fields.map(field => document.getElementById(field)).find(input => !input.checkValidity());
  if (invalid) {
    invalid.reportValidity();
    return null;
  }
  return normalizeRoutine({
    id, name,
    walking: document.getElementById('fWalking').value,
    walkingKm: document.getElementById('fWalkingKm').value,
    running: document.getElementById('fRunning').value,
    runningKm: document.getElementById('fRunningKm').value,
    customExercises,
  });
}

function routineHasExercise(routine) {
  return !!(routine && (routine.walking || routine.running || routine.walkingKm || routine.runningKm || routine.customExercises.length));
}

function routineSummary(routine) {
  const parts = [];
  if (routine.walking || routine.walkingKm) parts.push(`걷기 ${routine.walking}분${routine.walkingKm ? ` · ${routine.walkingKm}km` : ''}`);
  if (routine.running || routine.runningKm) parts.push(`러닝 ${routine.running}분${routine.runningKm ? ` · ${routine.runningKm}km` : ''}`);
  if (routine.customExercises.length) {
    const names = routine.customExercises.slice(0, 2).map(exercise => exercise.name).join('·');
    const rest = routine.customExercises.length > 2 ? ` 외 ${routine.customExercises.length - 2}종목` : '';
    parts.push(`${names}${rest}`);
  }
  return parts.join(' / ');
}

function renderRoutineQuickList() {
  const section = document.getElementById('routineQuickSection');
  const list = document.getElementById('routineQuickList');
  if (!section || !list) return;
  const available = currentUser.authProvider === 'test' || routineServerReady;
  section.hidden = !available;
  list.innerHTML = section.hidden ? '' : Array.from({ length: MAX_RECORD_ROUTINES }, (_, index) => {
    const slot = index + 1;
    const routineIndex = recordRoutines.findIndex((item, itemIndex) => (item.slot || itemIndex + 1) === slot);
    if (routineIndex < 0) return `
      <div class="routine-quick-card routine-quick-placeholder" aria-label="${slot}번 루틴 빈 자리">
        <strong>루틴 ${slot}</strong>
        <small>비어 있음</small>
      </div>`;
    const routine = recordRoutines[routineIndex];
    return `
      <button type="button" class="routine-quick-card" onclick="applyRecordRoutine(${routineIndex})" aria-label="${slot}번 ${escapeAttribute(routine.name)} 루틴 내용 확인 후 적용">
        <strong>${slot}. ${escapeHtml(routine.name)}</strong>
        <small>${escapeHtml(routineSummary(routine))}</small>
      </button>`;
  }).join('');
}

function updateRoutineCount() {
  const count = document.getElementById('routineCount');
  if (count) count.textContent = `${recordRoutines.length}/${MAX_RECORD_ROUTINES}`;
  const button = document.getElementById('openRoutineBtn');
  if (button) button.disabled = currentUser.authProvider !== 'test' && !routineServerReady;
  renderRoutineQuickList();
}

function renderRecordRoutines() {
  const list = document.getElementById('routineList');
  if (!list) return;
  list.innerHTML = recordRoutines.length ? recordRoutines.map((routine, index) => `
    <div class="routine-slot">
      <div class="routine-slot-heading"><strong>${escapeHtml(routine.name)}</strong><small>${routine.slot || index + 1}/${MAX_RECORD_ROUTINES}</small></div>
      <p class="routine-slot-summary">${escapeHtml(routineSummary(routine))}</p>
      <div class="routine-slot-actions">
        <button type="button" onclick="applyRecordRoutine(${index})">내용 확인 후 적용</button>
        <button type="button" onclick="replaceRecordRoutine(${index})">현재 입력으로 갱신</button>
        <button type="button" class="routine-delete" onclick="deleteRecordRoutine(${index})">삭제</button>
      </div>
    </div>`).join('') : '<p class="routine-slot-summary">저장한 루틴이 없습니다. 운동 내용을 입력하고 아래에서 첫 루틴을 저장해 보세요.</p>';
  const saveButton = document.getElementById('saveRoutineBtn');
  if (saveButton) saveButton.disabled = recordRoutines.length >= MAX_RECORD_ROUTINES;
  const hint = document.getElementById('routineSaveHint');
  if (hint) hint.textContent = recordRoutines.length >= MAX_RECORD_ROUTINES
    ? '5개를 사용 중입니다. 기존 루틴을 갱신하거나 삭제해 주세요.'
    : `${MAX_RECORD_ROUTINES - recordRoutines.length}개 더 저장할 수 있습니다. ${currentUser.authProvider === 'test' ? '테스트 계정은 이 기기에만 저장됩니다.' : 'DB에 저장되어 다른 기기에서도 사용할 수 있습니다.'}`;
}

function openRoutineDialog() {
  if (currentUser.authProvider !== 'test' && !routineServerReady) return;
  renderRecordRoutines();
  document.getElementById('routineDialog').showModal();
}

async function saveCurrentRoutine() {
  if (recordRoutines.length >= MAX_RECORD_ROUTINES) {
    showToast('루틴은 최대 5개까지 저장할 수 있습니다.', 'default');
    return;
  }
  const nameInput = document.getElementById('routineName');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    showToast('루틴 이름을 입력해 주세요.', 'default');
    return;
  }
  const routine = captureCurrentRoutine(name);
  if (!routine || !routineHasExercise(routine)) {
    if (routine) showToast('걷기·러닝 또는 개인 운동을 입력한 뒤 저장해 주세요.', 'default');
    return;
  }
  const freeSlot = Array.from({ length: MAX_RECORD_ROUTINES }, (_, index) => index + 1).find(slot => !recordRoutines.some(item => item.slot === slot));
  routine.slot = freeSlot || recordRoutines.length + 1;
  if (await persistRecordRoutines([...recordRoutines, routine], { type: 'save', routine })) {
    nameInput.value = '';
    showToast(`‘${routine.name}’ 루틴을 저장했습니다.`, 'success');
  }
}

async function replaceRecordRoutine(index) {
  const previous = recordRoutines[index];
  if (!previous) return;
  const routine = captureCurrentRoutine(previous.name, previous.id);
  if (!routine || !routineHasExercise(routine)) {
    if (routine) showToast('운동 내용을 입력한 뒤 갱신해 주세요.', 'default');
    return;
  }
  if (!window.confirm(`‘${previous.name}’ 루틴을 현재 운동 입력으로 바꿀까요?`)) return;
  const next = [...recordRoutines];
  routine.slot = previous.slot || index + 1;
  next[index] = routine;
  if (await persistRecordRoutines(next, { type: 'save', routine })) showToast('루틴을 갱신했습니다.', 'success');
}

function applyRecordRoutine(index) {
  const routine = recordRoutines[index];
  if (!routine) return;
  openRecordImportPreview('routine', routine);
}

async function deleteRecordRoutine(index) {
  const routine = recordRoutines[index];
  if (!routine || !window.confirm(`‘${routine.name}’ 루틴을 삭제할까요?`)) return;
  if (await persistRecordRoutines(recordRoutines.filter((_, currentIndex) => currentIndex !== index), { type: 'delete', slot: routine.slot || index + 1 })) {
    showToast('루틴을 삭제했습니다.', 'default');
  }
}

function addWater(amount) {
  const input = document.getElementById('fWater');
  const next = Math.min((parseFloat(input.value) || 0) + amount, 9999);
  input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setFasting(hours) {
  const input = document.getElementById('fFasting');
  input.value = hours;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── 기존 기록 모달 컨트롤 ────────────────────────────
function loadExistingRecord() {
  if (!pendingDuplicateRecord) return;
  clearRecordDraft();
  setReplacingRecord(null);
  editingId = pendingDuplicateRecord.id;
  populateForm(pendingDuplicateRecord);
  document.getElementById('saveBtn').textContent = '✏️ 수정 저장';
  document.getElementById('pageSubtitle').textContent = '기존 기록을 불러왔습니다. 수정 후 저장하세요.';
  updateRecentRecordButton();
  closeDuplicateModal();
  showToast('기존 기록을 불러왔습니다 📂', 'default');
}

function showDuplicateModal(record) {
  pendingDuplicateRecord = record;
  document.getElementById('duplicateModalDate').textContent = `${formatDate(record.date)} 날짜에 이미 작성된 기록이 있습니다.`;
  document.getElementById('duplicateModal').style.display = 'flex';
}

function handleRecordDateChange(dateVal) {
  if (editingId) return;
  if (replacingRecord && replacingRecord.date !== dateVal) setReplacingRecord(null);
  if (!dateVal) return;
  const existing = userRecords.find(record => record.date === dateVal);
  if (existing && (!replacingRecord || replacingRecord.id !== existing.id)) showDuplicateModal(existing);
  updateSummary();
}

function setReplacingRecord(record) {
  replacingRecord = record ? { id: record.id, date: record.date } : null;
  const notice = document.getElementById('replaceRecordNotice');
  if (notice) notice.hidden = !replacingRecord;
  const saveButton = document.getElementById('saveBtn');
  if (saveButton && !editingId) saveButton.textContent = replacingRecord ? '💾 기존 기록 대체 저장' : '💾 기록 저장하기';
}

function startNewRecordForExistingDate() {
  if (!pendingDuplicateRecord) return;
  const record = pendingDuplicateRecord;
  if (editingId) {
    editingId = null;
    updateRecentRecordButton();
  }
  setReplacingRecord(record);
  closeDuplicateModal();
  showToast('새로 작성하여 저장하면 이 날짜의 이전 기록이 사라집니다.', 'default');
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
    customExercises = record.customExercises.map(item => ({
      id: item.id || genId(),
      ...normalizeExerciseTemplate(item),
    }));
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
  toggle.setAttribute('aria-expanded', String(panel.classList.contains('open')));
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
    if (dup && (!replacingRecord || replacingRecord.date !== dateVal)) {
      showDuplicateModal(dup);
      return; // 저장 중단 — 사용자가 선택하도록
    }
  }

  const record = {
    id: editingId || (replacingRecord && replacingRecord.date === dateVal ? replacingRecord.id : genId()),
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
      setReplacingRecord(null);
      showDuplicateModal(error.existingRecord);
      isSaving = false;
      saveButton.disabled = false;
      saveButton.textContent = editingId ? originalButtonText : '💾 기록 저장하기';
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
  renderExerciseShortcuts();
}

function renderExPresets(cat) {
  const el = document.getElementById('exPresets');
  if (!el) return;
  const cfg = EX_CAT_CFG[cat];
  if (!cfg) { el.innerHTML = ''; return; }
  const heading = document.getElementById('exercisePresetTitle');
  if (heading) heading.textContent = `${cat} 종목`;

  el.innerHTML = cfg.presets.map(name => `
    <span class="preset-item">
      <button type="button" class="preset-chip" onclick="addCustomExerciseWithName('${name}')">${cfg.icon} ${name}</button>
      <button type="button" class="favorite-toggle ${isFavoriteExercise({ category: cat, name }) ? 'active' : ''}"
        aria-label="${escapeAttribute(name)} 즐겨찾기 ${isFavoriteExercise({ category: cat, name }) ? '해제' : '추가'}"
        aria-pressed="${isFavoriteExercise({ category: cat, name })}"
        onclick="toggleFavoriteExercise('${cat}','${name}')">★</button>
    </span>
  `).join('');
}

function addCustomExerciseWithName(name) {
  const strength = currentExCat === '근력' ? STRENGTH_TEMPLATES[activeStrengthTemplate] : null;
  addExerciseTemplate({ category: currentExCat, name, duration: strength ? strength.duration : 30, intensity: '중', sets: strength ? strength.sets : 3, reps: strength ? strength.reps : 10 });
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
  const hint = document.getElementById('addExerciseHint');
  if (hint) hint.hidden = customExercises.length > 0;

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
        <div class="ex-controls">
        <div class="ex-dur-wrap">
          <input
            type="number"
            min="1" max="999"
            aria-label="${escapeAttribute(ex.name)} 시간(분)"
            value="${escapeAttribute(ex.duration)}"
            data-exercise-id="${escapeAttribute(ex.id)}"
            oninput="updateExercise(this.dataset.exerciseId,'duration',this.value); updateSummary()"
          >
          <span>분</span>
        </div>
        ${ex.category === '근력' ? `<div class="set-rep-wrap">
          <input type="number" min="1" max="99" value="${escapeAttribute(ex.sets || 3)}" aria-label="${escapeAttribute(ex.name)} 세트" data-exercise-id="${escapeAttribute(ex.id)}" oninput="updateExercise(this.dataset.exerciseId,'sets',this.value)"><span>세트</span>
          <input type="number" min="1" max="999" value="${escapeAttribute(ex.reps || 10)}" aria-label="${escapeAttribute(ex.name)} 횟수" data-exercise-id="${escapeAttribute(ex.id)}" oninput="updateExercise(this.dataset.exerciseId,'reps',this.value)"><span>회</span>
        </div>` : ''}
        <select class="ex-intensity-select"
          aria-label="${escapeAttribute(ex.name)} 강도"
          data-exercise-id="${escapeAttribute(ex.id)}"
          onchange="updateExercise(this.dataset.exerciseId,'intensity',this.value)">
          <option value="하" ${ex.intensity === '하' ? 'selected' : ''}>하</option>
          <option value="중" ${ex.intensity === '중' ? 'selected' : ''}>중</option>
          <option value="상" ${ex.intensity === '상' ? 'selected' : ''}>상</option>
        </select>
        <button type="button" class="favorite-toggle ${isFavoriteExercise(ex) ? 'active' : ''}"
          aria-label="${escapeAttribute(ex.name)} 즐겨찾기 ${isFavoriteExercise(ex) ? '해제' : '추가'}"
          aria-pressed="${isFavoriteExercise(ex)}"
          data-exercise-id="${escapeAttribute(ex.id)}"
          onclick="toggleFavoriteExercise('','',this.dataset.exerciseId)">★</button>
        <button type="button" class="ex-remove-btn"
          aria-label="${escapeAttribute(ex.name)} 삭제"
          data-exercise-id="${escapeAttribute(ex.id)}"
          onclick="removeExercise(this.dataset.exerciseId)">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateExercise(id, field, value) {
  const ex = customExercises.find(e => e.id === id);
  if (!ex) return;
  ex[field] = ['duration', 'sets', 'reps'].includes(field) ? (parseFloat(value) || 0) : value;
  const favoriteIndex = favoriteExercises.findIndex(item => exerciseTemplateKey(item) === exerciseTemplateKey(ex));
  if (favoriteIndex >= 0) {
    favoriteExercises[favoriteIndex] = normalizeExerciseTemplate(ex);
    saveFavoriteExercises();
    renderExerciseShortcuts();
  }
  scheduleDraftSave();
}
