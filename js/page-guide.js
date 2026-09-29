/* Page guides use the real controls on each screen. No user data is changed automatically. */
(() => {
  'use strict';

  const page = location.pathname.split('/').pop() || 'index.html';
  const configs = {
    'index.html': [
      { target: '#ongil-intro-title', title: '건강지킴이 시작하기', body: '이 화면은 건강지킴이의 시작 화면입니다. 기록과 분석을 통해 자신의 건강지표 변화를 살펴볼 수 있습니다.' },
      { target: '.mobile-login-next', title: '로그인 화면으로 이동', body: '휴대전화에서는 실제 화살표를 누르거나 화면을 터치해 로그인 화면으로 이동해 보세요.', mobileOnly: true, action: true },
      { target: '.btn-naver', title: '네이버로 로그인', body: '이 버튼을 누르면 실제 네이버 로그인으로 이동합니다. 안내만 살펴보려면 완료를 누르세요.' }
    ],
    'dashboard.html': [
      { target: '#mainContent .page-header', title: '나의 건강 현황', body: '대시보드는 내가 남긴 기록과 건강지표의 흐름을 한곳에 모아 보여줍니다.' },
      { target: '#weekGrid', title: '이번 주 기록', body: '날짜별 기록 상태를 실제 화면에서 확인할 수 있습니다. 기록이 없는 날에는 기록하기 화면에서 새로 입력해 보세요.' },
      { target: '#personalReportTitle', title: '개인 건강기록 리포트', body: '최근 7일과 30일의 운동·생활 기록, 측정 지표의 변화를 여기에서 확인하세요.' },
      { target: '.report-action[onclick*="openConsultReportDialog"]', title: '월간 건강지표 PDF 만들기', body: '실제 버튼을 눌러 PDF 설정 창을 열어 보세요. 안내가 자동으로 다운로드하거나 인쇄하지는 않습니다.', action: true },
      { target: '#consultReportMonth', title: '보고서 월 선택', body: 'PDF에 담을 월을 직접 선택할 수 있습니다.', require: '#consultReportDialog.open' },
      { target: '.privacy-options', title: '개인정보 표시 범위', body: '이름·생년·연락처 등 PDF에 표시할 항목을 직접 체크해 보세요. 필요한 정보만 포함할 수 있습니다.', require: '#consultReportDialog.open' },
      { target: '#createConsultReportBtn', title: 'PDF 미리보기·출력', body: '이 버튼을 누르면 실제 보고서가 열리고 브라우저에서 PDF로 저장할 수 있습니다. 준비가 되었을 때 직접 실행하세요.', require: '#consultReportDialog.open' },
      { target: '#mainContent .empty-state', title: '첫 기록을 시작해 보세요', body: '아직 기록이 없다면 여기에 시작 안내가 나타납니다. 기록을 남기면 대시보드와 PDF 리포트가 채워집니다.' }
    ],
    'monthly.html': [
      { target: '#prevMonthBtn', title: '월 이동', body: '실제 화살표 버튼으로 이전 달을 살펴보세요. 오른쪽 화살표를 누르면 다음 달로 돌아갈 수 있습니다.' },
      { target: '#calGrid', title: '월별 기록 달력', body: '기록이 있는 날짜를 눌러 그날의 상세 요약을 열어 보세요. 달을 바꾸면 달력도 함께 바뀝니다.' },
      { target: '.stats-panel', title: '한 달의 변화', body: '선택한 달에 입력한 기록을 바탕으로 지표와 활동 현황을 확인할 수 있습니다.' }
    ],
    'record.html': [
      { target: '#fDate', title: '기록할 날짜 선택', body: '오늘이나 이전 날짜를 선택해 자신의 기록을 입력할 수 있습니다.' },
      { target: '#loadRecentBtn', title: '최근 기록 불러오기', body: '이 버튼을 누르면 마지막 기록의 입력값이 현재 작성 중인 화면에 채워집니다. 작성 중인 값이 있다면 바뀔 수 있으니 확인한 뒤 눌러 보세요. 이전 기록이 없으면 버튼이 비활성화됩니다.' },
      { target: '#exPresets .favorite-toggle', title: '자주 하는 운동 즐겨찾기', body: '실제 별 버튼을 눌러 종목을 즐겨찾기에 추가하거나 해제해 보세요. 선택은 저장되어 다음 입력 때도 사용할 수 있습니다.', action: true },
      { target: '#favoriteExerciseList', title: '즐겨찾기에서 빠르게 추가', body: '즐겨찾기한 운동이 이곳에 표시됩니다. 종목을 누르면 현재 기록에 바로 추가할 수 있습니다.' },
      { target: '#goalsToggle', title: '나의 목표 설정', body: '이 버튼을 눌러 실제 목표 입력칸을 펼쳐 보세요. 목표는 기록 진행률에 반영됩니다.', action: true },
      { target: '#goalEditRow', title: '목표값 입력', body: '걷기·운동·수분 등 원하는 목표값을 직접 조정해 보세요. 입력만으로는 저장되지 않습니다.', require: '#goalsPanel.open' },
      { target: '#goalsPanel button[onclick="saveGoals()"]', title: '목표 저장', body: '값을 정했다면 이 버튼으로 저장하세요. 저장한 목표는 이후 기록 화면에도 적용됩니다.', require: '#goalsPanel.open' },
      { target: '#saveBtn', title: '기록 저장', body: '작성한 내용을 확인한 뒤 이 버튼으로 저장합니다. 안내가 대신 기록을 제출하지는 않습니다.' }
    ],
    'history.html': [
      { target: '#filterMonth', title: '월별 기록 찾기', body: '실제 월 선택창에서 원하는 달을 고르면 해당 기간의 기록만 볼 수 있습니다.' },
      { target: '#filterSort', title: '기록 순서 바꾸기', body: '최신순이나 오래된순을 선택해 목록을 정렬해 보세요.' },
      { target: '#recordsList .record-card', title: '기록 확인하기', body: '카드에는 그날의 핵심 지표가 표시됩니다. 수정 버튼으로 입력한 내용을 다시 확인하고 고칠 수 있습니다.' },
      { target: '#recordsList', title: '기록 목록', body: '아직 기록이 없다면 이곳에 안내가 표시됩니다. 기록을 저장하면 날짜별 카드가 생깁니다.', emptyOnly: true }
    ],
    'inbody.html': [
      { target: '#chartComposition', title: '체성분 변화', body: '실제 측정 기록을 바탕으로 체성분 지표의 변화를 그래프로 볼 수 있습니다.' },
      { target: '#chartWeight', title: '체중 변화', body: '측정 시점별 체중의 흐름을 살펴보세요. 기록이 쌓일수록 비교하기 쉽습니다.' },
      { target: '#recordListBody', title: '측정 기록 목록', body: '아래 목록에서 측정 날짜와 값을 확인할 수 있습니다.' },
      { target: '#noDataMessage', title: '측정 기록 안내', body: '아직 등록된 인바디 기록이 없다면 이 화면의 안내가 표시됩니다.', emptyOnly: true }
    ]
  };
  if (!configs[page]) return;
  if (page !== 'index.html') {
    configs[page].push(
      { target: '#notificationBell', title: '알림 설정 열기', body: '상단의 실제 종 버튼을 눌러 알림과 예약 설정을 열어 보세요. 설치형 앱에서도 같은 위치에서 설정할 수 있습니다.', action: true },
      { target: '#healthNotificationHelp summary', title: '알림 사용법 다시 보기', body: '알림 창에서 이 항목을 누르면 기기에 맞는 설정 순서와 테스트 방법을 언제든 다시 읽을 수 있습니다.', require: '#healthNotificationOverlay.open' }
    );
  }

  const ready = () => {
    if (page === 'dashboard.html') return !!document.querySelector('#mainContent .page-header, #mainContent .empty-state');
    if (page === 'record.html') return !!document.querySelector('#exPresets .favorite-toggle');
    if (page === 'history.html') return !!document.querySelector('#recordsList > *');
    if (page === 'inbody.html') return visible(document.querySelector('#noDataMessage')) || !!document.querySelector('#recordListBody > *');
    return true;
  };
  const currentUser = typeof Auth !== 'undefined' && Auth.getUser ? Auth.getUser() : null;
  const storageKey = `HealthGuardian_pageGuide_v2_${currentUser?.id || 'guest'}_${page}`;
  let root, card, border, shades, currentTarget, currentIndex = 0, steps = [], clickHandler, resizeObserver;
  let updateFrame = 0;

  const visible = el => {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const mobile = () => matchMedia('(max-width: 1100px)').matches;
  const isStepAvailable = step => {
    if (step.mobileOnly && !mobile()) return false;
    if (page === 'index.html' && step.target === '.mobile-login-next' && document.querySelector('.login-container.login-visible')) return false;
    if (step.require && !visible(document.querySelector(step.require))) return false;
    if (step.emptyOnly && page === 'history.html' && document.querySelector('#recordsList .record-card')) return false;
    if (step.emptyOnly && page === 'inbody.html' && !visible(document.querySelector('#noDataMessage'))) return false;
    return visible(document.querySelector(step.target));
  };

  function detachTarget() {
    if (currentTarget && clickHandler) currentTarget.removeEventListener('click', clickHandler);
    resizeObserver?.disconnect();
    currentTarget = null;
    clickHandler = null;
  }

  function close() {
    detachTarget();
    cancelAnimationFrame(updateFrame);
    window.removeEventListener('scroll', schedulePosition, true);
    window.removeEventListener('resize', schedulePosition);
    document.removeEventListener('keydown', onKeyDown);
    root?.remove();
    root = null;
    const focusTarget = document.querySelector('#healthNotificationOverlay.open #healthNotificationHelp summary') || trigger;
    focusTarget?.focus({ preventScroll: true });
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') close();
  }

  function schedulePosition() {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(() => { updateFrame = 0; position(); });
  }

  function position() {
    if (!root || !currentTarget?.isConnected) return;
    const r = currentTarget.getBoundingClientRect();
    const w = innerWidth, h = innerHeight, gap = 5;
    const x1 = Math.max(0, Math.min(w, r.left - gap));
    const x2 = Math.max(0, Math.min(w, r.right + gap));
    const y1 = Math.max(0, Math.min(h, r.top - gap));
    const y2 = Math.max(0, Math.min(h, r.bottom + gap));
    const boxes = [
      [0, 0, w, y1], [0, y2, w, h - y2],
      [0, y1, x1, y2 - y1], [x2, y1, w - x2, y2 - y1]
    ];
    shades.forEach((el, i) => {
      const [left, top, width, height] = boxes[i];
      Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` });
    });
    Object.assign(border.style, { left: `${x1}px`, top: `${y1}px`, width: `${Math.max(0, x2 - x1)}px`, height: `${Math.max(0, y2 - y1)}px` });
    const cardWidth = Math.min(360, w - 24);
    card.style.width = `${cardWidth}px`;
    const cardHeight = card.offsetHeight;
    const below = h - y2, above = y1;
    const top = below >= cardHeight + 18 || below >= above
      ? Math.min(h - cardHeight - 12, y2 + 12)
      : Math.max(12, y1 - cardHeight - 12);
    const left = Math.max(12, Math.min(w - cardWidth - 12, x1 + (x2 - x1 - cardWidth) / 2));
    Object.assign(card.style, { top: `${Math.max(12, top)}px`, left: `${left}px` });
  }

  function show(index) {
    detachTarget();
    let next = index;
    while (next < steps.length && !isStepAvailable(steps[next])) next++;
    if (next >= steps.length) { close(); return; }
    if (page === 'index.html' && steps[next].target === '.btn-naver' && mobile() && !document.querySelector('.login-container.login-visible')) {
      document.querySelector('.mobile-login-next')?.click();
      setTimeout(() => { if (root) show(next); }, 650);
      return;
    }
    currentIndex = next;
    const step = steps[next];
    currentTarget = document.querySelector(step.target);
    card.querySelector('.page-guide-progress').textContent = `${next + 1} / ${steps.length}`;
    card.querySelector('.page-guide-title').textContent = step.title;
    card.querySelector('.page-guide-copy').textContent = step.body;
    const hint = card.querySelector('.page-guide-hint');
    const actionable = step.action && !currentTarget.disabled;
    hint.hidden = !actionable;
    hint.textContent = '밝게 표시된 실제 버튼을 눌러 체험할 수 있습니다.';
    const nextButton = card.querySelector('.page-guide-next');
    nextButton.textContent = next === steps.length - 1 ? '완료' : '다음';
    if (step.action && !currentTarget.disabled) {
      clickHandler = () => setTimeout(() => {
        if (root) show(currentIndex + 1);
      }, step.target === '.mobile-login-next' ? 650 : 180);
      currentTarget.addEventListener('click', clickHandler);
    }
    resizeObserver = new ResizeObserver(schedulePosition);
    resizeObserver.observe(currentTarget);
    currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    schedulePosition();
    setTimeout(schedulePosition, 450);
    try { localStorage.setItem(storageKey, 'seen'); } catch (_) { /* Storage may be disabled. */ }
  }

  function start() {
    if (root) { show(0); return; }
    steps = configs[page].filter(step => {
      if (page === 'index.html' && mobile() && document.querySelector('.login-container.login-visible')) return step.target === '.btn-naver';
      if (step.mobileOnly && !mobile()) return false;
      if (step.emptyOnly && page === 'history.html') return !document.querySelector('#recordsList .record-card');
      if (step.emptyOnly && page === 'inbody.html') return visible(document.querySelector('#noDataMessage'));
      return true;
    });
    if (!steps.some(isStepAvailable)) return;
    root = document.createElement('div');
    root.className = 'page-guide-live';
    root.innerHTML = '<div class="page-guide-shade"></div><div class="page-guide-shade"></div><div class="page-guide-shade"></div><div class="page-guide-shade"></div><div class="page-guide-highlight"></div><section class="page-guide-card" role="dialog" aria-modal="false" aria-label="화면 안내"><div class="page-guide-top"><span class="page-guide-progress"></span><button type="button" class="page-guide-exit" aria-label="안내 닫기">×</button></div><h2 class="page-guide-title"></h2><p class="page-guide-copy"></p><p class="page-guide-hint"></p><div class="page-guide-controls"><button type="button" class="page-guide-next">다음</button></div></section>';
    document.body.appendChild(root);
    shades = [...root.querySelectorAll('.page-guide-shade')];
    border = root.querySelector('.page-guide-highlight');
    card = root.querySelector('.page-guide-card');
    root.querySelector('.page-guide-exit').addEventListener('click', close);
    root.querySelector('.page-guide-next').addEventListener('click', () => show(currentIndex + 1));
    window.addEventListener('scroll', schedulePosition, true);
    window.addEventListener('resize', schedulePosition);
    document.addEventListener('keydown', onKeyDown);
    show(0);
  }

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'page-guide-trigger';
  trigger.innerHTML = '<span aria-hidden="true">?</span><span>화면 설명 다시 보기</span>';
  trigger.setAttribute('aria-label', '현재 화면 설명 다시 보기');
  trigger.title = '현재 화면 설명 다시 보기';
  trigger.addEventListener('click', start);
  document.body.appendChild(trigger);

  let attempts = 0;
  const autoStart = () => {
    let viewed = false;
    try { viewed = !!localStorage.getItem(storageKey); } catch (_) { /* Storage may be disabled. */ }
    if (viewed) return;
    const blockingDialog = document.querySelector('.health-notification-overlay.open, .pwa-install-overlay.open');
    if ((!ready() || blockingDialog) && attempts++ < 40) { setTimeout(autoStart, 500); return; }
    if (ready() && !blockingDialog) start();
  };
  setTimeout(autoStart, 1800);
})();
