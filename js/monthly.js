/* ===================================================
   monthly.js — Monthly Calendar & Analysis
   건강지킴이
   =================================================== */

let currentUser = null;
let userRecords = [];
let monthOffset = 0; // 0 = 이번 달

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = Auth.require();
  if (!currentUser) return;

  userRecords = (await Records.getUserRecordsAsync(currentUser.id))
    .sort((a, b) => a.date.localeCompare(b.date));

  renderMonthlyPage();
});

// ─── 월 이동 ──────────────────────────────────────────
function changeMonth(delta) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset + delta, 1);
  if (target > new Date(now.getFullYear(), now.getMonth(), 1)) return;
  monthOffset += delta;
  renderMonthlyPage();
}

// ─── 전체 렌더 ────────────────────────────────────────
function renderMonthlyPage() {
  const now      = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year     = viewDate.getFullYear();
  const month    = viewDate.getMonth() + 1; // 1-12

  // ── 레이블 & 버튼 상태
  document.getElementById('monthLabel').textContent = `${year}년 ${month}월`;
  const nextBtn = document.getElementById('nextMonthBtn');
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
  nextBtn.disabled      = isCurrent;
  nextBtn.style.opacity = isCurrent ? '0.3' : '1';

  const monthStr    = `${year}-${String(month).padStart(2, '0')}`;
  const monthRecs   = userRecords.filter(r => r.date.startsWith(monthStr));
  const recMap      = {};
  monthRecs.forEach(r => { recMap[r.date] = r; });

  renderCalendar(year, month, recMap, monthRecs.length);
  renderStats(year, month, monthRecs);
  renderCatCards(monthRecs);
}

// ─── 달력 렌더 ────────────────────────────────────────
function renderCalendar(year, month, recMap, totalDays) {
  const todayStr    = today();
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow    = new Date(year, month - 1, 1).getDay(); // 0=일
  const monthStr    = `${year}-${String(month).padStart(2, '0')}`;
  const COND_EMOJIS = ['', '😔', '😕', '😊', '😄', '🤩'];
  const DAY_HDRS    = ['일', '월', '화', '수', '목', '금', '토'];

  // 요일 헤더
  document.getElementById('calHdrRow').innerHTML = DAY_HDRS.map((h, i) =>
    `<div class="cal-hdr" style="${i===0?'color:#ef4444':i===6?'color:#3b82f6':''}">${h}</div>`
  ).join('');

  // 셀 생성
  let cells = '';
  for (let i = 0; i < firstDow; i++) {
    cells += `<div class="cal-cell"></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${monthStr}-${String(d).padStart(2, '0')}`;
    const rec      = recMap[dateStr];
    const isToday  = dateStr === todayStr;
    const isFuture = dateStr >  todayStr;
    const dow      = (firstDow + d - 1) % 7;
    const numColor = dow === 0 ? '#ef4444'
                   : dow === 6 ? '#3b82f6'
                   : isToday   ? 'var(--gold-dark)'
                   : rec        ? 'var(--primary)'
                   : 'var(--text-muted)';
    const cond = rec ? COND_EMOJIS[rec.condition || 3] : '';
    cells += `
      <div class="cal-cell${rec ? ' cal-has' : ''}${isToday ? ' cal-today' : ''}${isFuture ? ' cal-future' : ''}"
           ${rec ? `onclick="showRecordSummary('${rec.id}')" title="${dateStr} 기록 요약 보기"` : ''}>
        <span class="cal-num" style="color:${numColor};${rec&&!isToday?'font-weight:800;':''}">${d}</span>
        ${cond ? `<span class="cal-cond-emoji">${cond}</span>` : ''}
        ${rec  ? `<span class="cal-dot"></span>` : ''}
      </div>`;
  }

  document.getElementById('calGrid').innerHTML = cells;
  document.getElementById('totalDaysLabel').textContent = `총 ${totalDays}일 기록`;
}

// ─── 통계 패널 렌더 ───────────────────────────────────
function renderStats(year, month, monthRecs) {
  const sum = key => monthRecs.reduce((s, r) => s + (r[key] || 0), 0);

  document.getElementById('statsPanelTitle').textContent = `${year}년 ${month}월 합계`;

  const totalCustomMins = monthRecs.reduce((sum, r) => {
    return sum + (r.customExercises || []).reduce((s, ex) => s + (ex.duration || 0), 0);
  }, 0);

  const rows = [
    { icon: '🚶', label: '걷기',   val: sum('walking'),  unit: '분' },
    { icon: '🏃', label: '러닝',   val: sum('running'),  unit: '분' },
    { icon: '🏅', label: '개인운동', val: totalCustomMins, unit: '분' },
    { icon: '💧', label: '수분',   val: sum('water'),    unit: 'ml' },
  ];
  document.getElementById('statsRows').innerHTML = rows.map(r => `
    <div class="stat-row">
      <span class="stat-row-label">${r.icon} ${r.label}</span>
      <span class="stat-row-val">${r.val}<span class="stat-row-unit"> ${r.unit}</span></span>
    </div>`).join('');

  const avgCond = monthRecs.length
    ? (monthRecs.reduce((s, r) => s + (r.condition || 3), 0) / monthRecs.length).toFixed(1)
    : '-';
  document.getElementById('avgCondEl').textContent =
    avgCond !== '-' ? `${avgCond} / 5` : '-';

  document.getElementById('recordDayBadge').innerHTML =
    `${monthRecs.length}<span style="font-size:0.85rem;font-weight:500;color:var(--text-muted);">일</span>`;
}

// ─── 카테고리 카드 렌더 ───────────────────────────────
function renderCatCards(monthRecs) {
  const catCfg = [
    { key: '유산소', icon: '🏃', color: '#16a34a',          bg: 'rgba(34,197,94,0.08)'  },
    { key: '근력',   icon: '🏋️', color: '#004680',          bg: 'rgba(0,70,128,0.07)'   },
    { key: '유연성', icon: '🤸', color: '#8b5cf6',          bg: 'rgba(139,92,246,0.08)' },
    { key: '스포츠', icon: '⚽', color: '#b45309',          bg: 'rgba(221,202,75,0.12)' },
  ];
  const catMins = { '유산소': 0, '근력': 0, '유연성': 0, '스포츠': 0 };
  monthRecs.forEach(r => {
    (r.customExercises || []).forEach(ex => {
      if (catMins[ex.category] !== undefined) catMins[ex.category] += (ex.duration || 0);
    });
  });

  document.getElementById('catGrid').innerHTML = catCfg.map(c => {
    const mins    = catMins[c.key];
    const isEmpty = mins === 0;
    return `
      <div class="cat-card" style="background:${c.bg};border-color:${c.color}33;${isEmpty?'opacity:0.45;':''}">
        <div class="cat-icon">${c.icon}</div>
        <div class="cat-name">${c.key}</div>
        <div class="cat-mins" style="color:${isEmpty?'var(--text-muted)':c.color};">${mins}</div>
        <div class="cat-unit">분</div>
      </div>`;
  }).join('');
}

// ─── 기록 요약 모달 제어 ─────────────────────────────────

function showRecordSummary(recId) {
  const rec = userRecords.find(r => r.id === recId);
  if (!rec) return;

  const dateLabel = formatDate(rec.date, { month: 'long', day: 'numeric' }) + ` (${dayOfWeek(rec.date)})`;
  document.getElementById('summaryModalTitle').textContent = `📅 ${dateLabel} 기록 요약`;

  // 컨디션 이모지 및 별점
  const COND_EMOJIS = ['', '😔', '😕', '😊', '😄', '🤩'];
  const condEmoji = COND_EMOJIS[rec.condition || 3];
  const starsHtml = renderStars(rec.condition || 3);

  // 개인 운동 기록 목록 구성
  let customExHtml = `<div class="modal-custom-title">🏅 개인 운동 기록</div>`;
  if (rec.customExercises && rec.customExercises.length > 0) {
    const catIcons = { '유산소': '🏃', '근력': '🏋️', '유연성': '🤸', '스포츠': '⚽' };
    customExHtml += rec.customExercises.map(ex => `
      <div class="modal-custom-item">
        <span>${catIcons[ex.category] || '🏅'} [${ex.category}] <strong>${ex.name}</strong></span>
        <span style="font-weight:700;color:var(--primary);">${ex.duration}분</span>
      </div>
    `).join('');
  } else {
    customExHtml += `<div style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:8px 0;">기록된 개인 운동이 없습니다.</div>`;
  }

  // 메모 HTML 구성
  const memoText = rec.memo ? rec.memo.trim() : '';
  const memoHtml = memoText 
    ? `<div style="background:rgba(0,70,128,0.03);border:1px dashed var(--border);border-radius:var(--radius-md);padding:10px 12px;font-size:0.8rem;color:var(--text-secondary);line-height:1.4;">📝 <strong>메모:</strong> ${memoText}</div>`
    : `<div style="font-size:0.8rem;color:var(--text-muted);font-style:italic;">📝 메모가 작성되지 않았습니다.</div>`;

  const bodyHtml = `
    <div class="modal-info-grid">
      <div class="modal-info-item">
        <span class="modal-info-label">🚶 걷기</span>
        <span class="modal-info-val">${rec.walking || 0} <span style="font-size:0.75rem;font-weight:500;color:var(--text-muted);">분</span></span>
      </div>
      <div class="modal-info-item">
        <span class="modal-info-label">🏃 러닝</span>
        <span class="modal-info-val">${rec.running || 0} <span style="font-size:0.75rem;font-weight:500;color:var(--text-muted);">분</span></span>
      </div>
      <div class="modal-info-item">
        <span class="modal-info-label">💧 수분섭취</span>
        <span class="modal-info-val">${rec.water || 0} <span style="font-size:0.75rem;font-weight:500;color:var(--text-muted);">ml</span></span>
      </div>
      <div class="modal-info-item">
        <span class="modal-info-label">⏱️ 공복시간</span>
        <span class="modal-info-val">${rec.fasting || 0} <span style="font-size:0.75rem;font-weight:500;color:var(--text-muted);">시간</span></span>
      </div>
    </div>
    
    <div class="modal-info-item" style="flex-direction:row;justify-content:space-between;align-items:center;">
      <span class="modal-info-label" style="margin-bottom:0;">⭐ 컨디션</span>
      <span class="modal-info-val" style="font-size:0.9rem;color:var(--gold-dark);">${condEmoji} ${starsHtml}</span>
    </div>

    <div class="modal-custom-list">
      ${customExHtml}
    </div>

    ${memoHtml}
  `;

  document.getElementById('summaryModalBody').innerHTML = bodyHtml;

  // 수정 가능 여부 판단 (기한 제한 없음)
  let footerHtml = `
    <button class="modal-btn modal-btn-secondary" onclick="hideSummaryModal()">닫기</button>
    <button class="modal-btn modal-btn-primary" onclick="window.location.href='record.html?edit=${rec.id}'">기록 수정하기</button>
  `;

  document.getElementById('summaryModalFooter').innerHTML = footerHtml;

  const overlay = document.getElementById('summaryModalOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function hideSummaryModal() {
  const overlay = document.getElementById('summaryModalOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function closeSummaryModal(event) {
  if (event.target === document.getElementById('summaryModalOverlay')) {
    hideSummaryModal();
  }
}

// ESC 키로 모달 닫기 지원
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideSummaryModal();
});
