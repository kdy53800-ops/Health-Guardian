    (async function () {
      await SupabaseAuth.handleIndexSession();
      let user = Auth.getUser();
      if (!user && typeof Auth.checkAndRestoreSession === 'function') {
        user = await Auth.checkAndRestoreSession();
      }
      if (user) {
        window.location.href = 'dashboard.html';
      }
    })();

    async function handleNaverLogin(event) {
      if (event) event.preventDefault();
      try {
        await SupabaseAuth.signInWithNaver();
      } catch (error) {
        console.error(error);
        alert('네이버 로그인 연결에 실패했습니다.\n잠시 후 다시 시도해 주세요.');
      }
    }

    // 모바일에서는 소개와 로그인을 한 화면씩 보여주는 슬라이드로 전환합니다.
    const mobileLoginMedia = window.matchMedia('(max-width: 1100px)');
    const loginContainer = document.querySelector('.login-container');
    const introPanel = document.querySelector('.ongil-intro');
    const nextLoginButton = document.querySelector('.mobile-login-next');
    const backIntroButton = document.querySelector('.mobile-login-back');

    function showMobileLogin() {
      if (!mobileLoginMedia.matches || !loginContainer) return;
      loginContainer.classList.add('login-visible');
      document.body.classList.add('mobile-login-open');
      window.setTimeout(() => document.querySelector('.btn-naver')?.focus({ preventScroll: true }), 520);
    }

    function showMobileIntro() {
      if (!loginContainer) return;
      loginContainer.classList.remove('login-visible');
      document.body.classList.remove('mobile-login-open');
      window.setTimeout(() => introPanel?.focus({ preventScroll: true }), 520);
    }

    introPanel?.addEventListener('click', showMobileLogin);
    nextLoginButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      showMobileLogin();
    });
    backIntroButton?.addEventListener('click', showMobileIntro);
    mobileLoginMedia.addEventListener('change', (event) => {
      if (!event.matches) showMobileIntro();
    });

    // 이스터에그: 로고 5번 연속 클릭 시 테스트 계정 로그인
    let clickCount = 0;
    let clickTimer = null;
    
    // 스크립트가 body 하단에 있으므로 DOMContentLoaded 없이 바로 요소를 찾을 수 있습니다.
    const logoArea = document.querySelector('.logo-area');
    if (logoArea) {
      // 빠른 클릭 시 텍스트/이미지 선택(드래그) 방지
      logoArea.style.userSelect = 'none';
      logoArea.style.webkitUserSelect = 'none';
      
      logoArea.addEventListener('click', () => {
        clickCount++;
        
        if (clickCount >= 5) {
          clickCount = 0;
          
          const type = confirm('테스트 계정으로 접속하시겠습니까?\n확인: 관리자 / 취소: 일반 사용자') ? 'admin' : 'user';
          
          const pass = prompt('테스트 계정 비밀번호를 입력하세요:');
          if (pass === null) return;

          const loginAndRedirect = (user) => {
            Auth.setUser(user);
            window.location.href = 'dashboard.html';
          };

          // 운영 환경에서는 서버가 비밀번호를 검증하고 서명된 세션 쿠키를 발급합니다.
          if (window.location.protocol.startsWith('http')) {
            fetch('api/naver-login', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type, password: pass })
            }).then(async (response) => {
              const payload = await response.json().catch(() => null);
              if (!response.ok || !payload || !payload.ok) {
                throw new Error((payload && payload.message) || '테스트 로그인에 실패했습니다.');
              }
              loginAndRedirect(payload.user);
            }).catch((err) => {
              alert(err.message || '테스트 로그인에 실패했습니다.');
            });
          } else {
            // 서버가 없는 로컬 파일 미리보기에서만 기존 테스트 비밀번호를 사용합니다.
            if (pass !== '6476') {
              alert('비밀번호가 틀렸습니다.');
              return;
            }
            loginAndRedirect({
              id: type === 'admin' ? 'test_admin_001' : 'test_user_001',
              name: type === 'admin' ? '테스트 관리자' : '테스트 유저',
              username: type === 'admin' ? 'test_admin' : 'test_user',
              isAdmin: type === 'admin',
              isSpecial: true,
              authProvider: 'test'
            });
          }
        }
        
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 1500); // 1.5초 내에 5번 클릭해야 발동
      });
    }
