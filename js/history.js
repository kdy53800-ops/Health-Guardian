/* ===================================================
   history.js — Record History Management
   건강지킴이
   =================================================== */

let currentUser = null;
let pendingDeleteId = null;

const CONDITION_MAP = ['', '😔 매우 나쁨', '😕 나쁨', '😊 보통', '😄 좋음', '🤩 최고!'];
const CONDITION_EMOJI = ['', '😔', '😕', '😊', '😄', '🤩'];

document.addEventListener('DOMContentLoaded', () => {
  currentUser = Auth.require();
  if (!currentUser) return;

  // Default: current month
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('filterMonth').value = monthStr;

  renderHistory();
});

function renderHistory() {
  const container   = document.getElementById('recordsList');
  const monthFilter = document.getElementById('filterMonth').value;
  const sortOrder   = document.getElementById('filterSort').value;

  let records = Records.getUserRecords(currentUser.id);

  // Month filter
  if (monthFilter) {
    records = records.filter(r => r.date.startsWith(monthFilter));
  }

  // Sort
  records.sort((a, b) => {
    return sortOrder === 'asc'
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date);
  });

  // Update count badge
  document.getElementById('recordCountBadge').textContent = `${records.length}개`;

  if (!records.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>기록이 없습니다</h3>
        <p>${monthFilter ? '해당 월에는 기록이 없습니다.' : '아직 기록이 없습니다.'}</p>
        <a href="record.html" class="btn btn-primary">✏️ 첫 기록 작성하기</a>
      </div>
    `;
    return;
  }

  container.innerHTML = records.map(r => buildRecordCard(r)).join('');
}

function buildRecordCard(r) {
  const d = new Date(r.date + 'T00:00:00');
  const monthAbbr = d.toLocaleDateString('ko-KR', { month: 'short' });
  const dayNum = d.getDate();
  const dayOfWeekKo = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const cond = r.condition || 3;

  const metrics = [
    r.walking   ? { icon: '🚶', label: '걷기',   val: r.walking,   unit: '분',  cls: 'highlight' } : null,
    r.running   ? { icon: '🏃', label: '러닝',   val: r.running,   unit: '분',  cls: 'highlight' } : null,
    r.walkingKm ? { icon: '🗺️', label: '걷기거리', val: r.walkingKm, unit: 'km', cls: '' } : null,
    r.runningKm ? { icon: '🗺️', label: '러닝거리', val: r.runningKm, unit: 'km', cls: '' } : null,
    r.squats    ? { icon: '🏋️', label: '스쿼트', val: r.squats,    unit: '회',  cls: '' } : null,
    r.pushups   ? { icon: '💪', label: '푸쉬업', val: r.pushups,   unit: '회',  cls: '' } : null,
    r.situps    ? { icon: '🔄', label: '윗몸',   val: r.situps,    unit: '회',  cls: '' } : null,
    r.water     ? { icon: '💧', label: '수분',   val: r.water,     unit: 'ml',  cls: 'gold-chip' } : null,
    r.fasting   ? { icon: '⏱️', label: '공복',   val: r.fasting,   unit: 'h',   cls: 'gold-chip' } : null,
    r.weight    ? { icon: '⚖️', label: '체중',   val: r.weight,    unit: 'kg',  cls: '' } : null,
  ].filter(Boolean);

  const metricChips = metrics.map(m => `
    <div class="metric-chip ${m.cls}">
      <span class="chip-icon">${m.icon}</span>
      <span class="chip-val">${m.val}</span>
      <span style="color:var(--text-muted); font-weight:400; font-size:0.72rem">${m.unit}</span>
    </div>
  `).join('');

  // 개인 운동 기록 칩
  const customChips = (r.customExercises || []).map(ex => {
    const catIcon = { '유산소': '🏊', '근력': '🏋️', '유연성': '🧘', '스포츠': '⚽' }[ex.category] || '🏅';
    const intensityColor = { '하': '#22c55e', '중': '#f59e0b', '상': '#ef4444' }[ex.intensity] || '#5a7a9a';
    return `
      <div class="metric-chip" style="background:rgba(139,92,246,0.07); border-color:rgba(139,92,246,0.18);">
        <span class="chip-icon">${catIcon}</span>
        <span class="chip-val" style="color:#7c3aed">${ex.name || ex.category}</span>
        <span style="color:var(--text-muted); font-weight:400; font-size:0.72rem">${ex.duration}분</span>
        <span style="font-size:0.65rem; font-weight:700; color:${intensityColor}; margin-left:1px">[${ex.intensity}]</span>
      </div>
    `;
  }).join('');

  const dietBadge = r.diet ? `<span class="badge badge-gray" style="font-size:0.72rem">${r.diet}</span>` : '';

  return `
    <div class="record-card fade-in" id="card_${r.id}">
      <div class="record-card-top">
        <div class="record-card-date-block">
          <div class="date-icon">
            <span class="date-month">${monthAbbr}</span>
            <span class="date-day">${dayNum}</span>
          </div>
          <div class="record-card-date-info">
            <h4>${formatDate(r.date)}</h4>
            <div class="day-tag">${dayOfWeekKo}요일 ${dietBadge}</div>
          </div>
        </div>
        <div class="record-card-actions">
          <a href="record.html?edit=${r.id}" class="btn btn-outline btn-sm">✏️ 수정</a>
          <button class="btn btn-danger btn-sm" onclick="openDeleteConfirm('${r.id}')">🗑️</button>
        </div>
      </div>

      ${(metrics.length > 0 || customChips) ? `<div class="metrics-grid">${metricChips}${customChips}</div>` : ''}

      <div class="record-footer">
        <div class="record-condition">
          <span>${CONDITION_EMOJI[cond]}</span>
          <span style="font-size:0.8rem">${CONDITION_MAP[cond]}</span>
        </div>
        ${r.memo ? `<div class="record-memo">"${r.memo}"</div>` : ''}
      </div>
    </div>
  `;
}

function clearFilter() {
  document.getElementById('filterMonth').value = '';
  document.getElementById('filterSort').value = 'desc';
  renderHistory();
}

// ─── Delete ───────────────────────────────────────────
function openDeleteConfirm(id) {
  pendingDeleteId = id;
  document.getElementById('confirmModal').classList.add('show');
}

function closeConfirm() {
  pendingDeleteId = null;
  document.getElementById('confirmModal').classList.remove('show');
}

function confirmDelete() {
  if (!pendingDeleteId) return;
  Records.delete(pendingDeleteId);
  closeConfirm();
  showToast('기록이 삭제되었습니다.', 'error');
  renderHistory();
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirmModal').addEventListener('click', function(e) {
    if (e.target === this) closeConfirm();
  });
});
