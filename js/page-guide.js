/* 일반 사용자 화면의 첫 방문 안내. 예시 화면에는 실제 건강정보를 사용하지 않습니다. */
(() => {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const guides = {
    'index.html': {
      title: '건강지킴이 시작하기',
      intro: '소개 화면을 지나 네이버 계정으로 간편하게 시작할 수 있어요.',
      steps: ['휴대전화에서는 소개 화면을 터치하거나 ‘로그인하기’를 누르세요.', '‘네이버로 간편 시작’을 눌러 로그인하세요.', '로그인 후 대시보드에서 나의 기록을 확인할 수 있어요.'],
      preview: '<div class="guide-mock-login"><div class="guide-mock-logo">건강지킴이</div><div class="guide-mock-pill-row"><span>운동 추적</span><span>생활 기록</span></div><div class="guide-mock-naver">N&nbsp; 네이버로 간편 시작</div></div>'
    },
    'dashboard.html': {
      title: '내 기록 한눈에 보기',
      intro: '입력한 건강지표의 흐름을 살펴보는 화면이에요.',
      steps: ['최근 7일·30일의 활동과 건강지표 변화를 확인하세요.', '‘나의 건강기록 리포트’에서 기록을 요약해 보세요.', '필요하면 월간 건강지표를 PDF로 저장할 수 있어요.'],
      preview: '<div class="guide-mock-cards"><div><small>최근 7일 기록</small><strong>3일</strong></div><div><small>목표 달성률</small><strong>예시</strong></div></div><div class="guide-mock-chart" aria-hidden="true"><i style="height:38%"></i><i style="height:60%"></i><i style="height:48%"></i><i style="height:76%"></i><i style="height:55%"></i><i style="height:88%"></i><i style="height:68%"></i></div><div class="guide-mock-caption">나의 건강기록 리포트 · 최근 7일 / 30일</div>'
    },
    'monthly.html': {
      title: '월별 기록 살펴보기',
      intro: '달력에서 어느 날 기록했는지 쉽게 확인할 수 있어요.',
      steps: ['상단 화살표로 확인할 달을 바꿔 보세요.', '기록이 있는 날짜를 누르면 그날의 기록 요약이 열려요.', '옆의 통계에서 한 달의 기록 현황을 확인하세요.'],
      preview: '<div class="guide-mock-month">‹ <strong>2026년 9월</strong> ›</div><div class="guide-mock-calendar"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span><span>13</span><span class="marked">14</span><span>15</span><span>16</span><span class="marked">17</span><span>18</span><span class="marked">19</span></div><div class="guide-mock-caption">색이 표시된 날짜에 기록이 있어요</div>'
    },
    'record.html': {
      title: '오늘의 기록 남기기',
      intro: '운동과 생활 기록을 내 속도에 맞게 입력해 보세요.',
      steps: ['날짜와 원하는 건강지표를 입력하세요. 모든 항목을 채울 필요는 없어요.', '최근 기록, 즐겨찾기, 세트 템플릿으로 반복 입력을 줄일 수 있어요.', '입력 중에는 이 기기에 임시 저장되며, 마지막에 저장 버튼을 눌러 기록을 완료하세요.'],
      preview: '<div class="guide-mock-form"><div><small>날짜</small><span>2026-09-29</span></div><div><small>걷기</small><span>30분</span></div></div><div class="guide-mock-pill-row"><span>⭐ 즐겨찾기</span><span>🕒 최근 운동</span></div><div class="guide-mock-save">기록 저장하기</div>'
    },
    'history.html': {
      title: '지난 기록 찾아보기',
      intro: '날짜별 기록을 간단히 훑어보고 관리할 수 있어요.',
      steps: ['월별 필터와 정렬을 사용해 원하는 기록을 찾으세요.', '각 카드에는 주요 기록이 먼저 요약되어 보여요.', '내용을 바꾸려면 ‘수정’, 지우려면 삭제 버튼을 사용하세요.'],
      preview: '<div class="guide-mock-filter">📅 2026년 9월 <span>최신순⌄</span></div><div class="guide-mock-record"><strong>9월 15일</strong><span>걷기 30분 · 수분 1,800ml</span><em>수정</em></div><div class="guide-mock-record"><strong>9월 13일</strong><span>체중 기록</span><em>수정</em></div>'
    },
    'inbody.html': {
      title: '인바디 변화 확인하기',
      intro: '등록된 체성분 측정 기록을 비교해 볼 수 있어요.',
      steps: ['측정값별 그래프에서 이전 기록과 최근 기록의 흐름을 확인하세요.', '아래 검사 기록 목록에서 측정일과 결과를 다시 볼 수 있어요.', '이 화면은 기록 변화를 살펴보기 위한 것이며 의료적 판단을 제공하지 않아요.'],
      preview: '<div class="guide-mock-cards"><div><small>체중 변화</small><strong>추이 보기</strong></div><div><small>골격근량</small><strong>추이 보기</strong></div></div><div class="guide-mock-line" aria-hidden="true"><svg viewBox="0 0 280 86" preserveAspectRatio="none"><polyline points="8,63 75,48 142,56 209,30 272,38" /></svg></div><div class="guide-mock-caption">측정일별 변화를 비교해 보세요</div>'
    }
  };

  const guide = guides[page];
  if (!guide) return;
  let trigger;
  let overlay;
  let autoTimer;
  const getUser = () => typeof Auth === 'undefined' ? null : Auth.getUser();
  const storageKey = () => {
    const userId = page === 'index.html' ? 'guest' : (getUser()?.id || 'guest');
    return `HealthGuardian_pageGuide_20260929_${userId}_${page}`;
  };

  function closeGuide() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onKeydown);
    trigger?.focus({ preventScroll: true });
  }

  function onKeydown(event) {
    if (event.key === 'Escape') closeGuide();
    if (event.key !== 'Tab' || !overlay) return;
    const controls = [...overlay.querySelectorAll('button')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function openGuide() {
    if (overlay) return;
    try { localStorage.setItem(storageKey(), 'seen'); } catch (error) { /* 저장이 제한돼도 안내는 표시합니다. */ }
    overlay = document.createElement('div');
    overlay.className = 'page-guide-overlay';
    overlay.innerHTML = `<section class="page-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="pageGuideTitle" aria-describedby="pageGuideIntro">
      <div class="page-guide-header"><span class="page-guide-kicker">화면 사용 안내</span><button type="button" class="page-guide-close" aria-label="화면 안내 닫기">×</button></div>
      <h2 id="pageGuideTitle">${guide.title}</h2><p class="page-guide-intro" id="pageGuideIntro">${guide.intro}</p>
      <div class="page-guide-preview" role="img" aria-label="${guide.title} 예시 화면"><div class="page-guide-preview-bar"><span>건강지킴이</span><span>가상 예시 화면</span></div><div class="page-guide-preview-body">${guide.preview}</div></div>
      <ol class="page-guide-steps">${guide.steps.map(step => `<li>${step}</li>`).join('')}</ol>
      <button type="button" class="page-guide-done">이 화면 사용하기</button>
    </section>`;
    overlay.addEventListener('click', event => { if (event.target === overlay) closeGuide(); });
    overlay.querySelector('.page-guide-close').addEventListener('click', closeGuide);
    overlay.querySelector('.page-guide-done').addEventListener('click', closeGuide);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeydown);
    overlay.querySelector('.page-guide-close').focus();
  }

  function tryAutoOpen() {
    if (overlay) { clearInterval(autoTimer); return; }
    if (document.querySelector('.health-notification-overlay.open, .pwa-install-overlay.open')) return;
    if (page !== 'index.html') {
      const user = getUser();
      if (!user || (page === 'inbody.html' && !user.isSpecial)) return;
    }
    try {
      if (localStorage.getItem(storageKey()) === 'seen') { clearInterval(autoTimer); return; }
    } catch (error) { clearInterval(autoTimer); return; }
    clearInterval(autoTimer);
    openGuide();
  }

  function initialize() {
    if (page === 'inbody.html' && getUser() && !getUser().isSpecial) return;
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'page-guide-trigger';
    trigger.setAttribute('aria-label', '이 화면 안내 다시 보기');
    trigger.textContent = '?';
    trigger.addEventListener('click', openGuide);
    document.body.appendChild(trigger);
    setTimeout(() => {
      autoTimer = setInterval(tryAutoOpen, 800);
      tryAutoOpen();
      setTimeout(() => clearInterval(autoTimer), 30000);
    }, 2200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
