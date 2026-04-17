(function () {
  function normalizePhone(value) {
    if (!value) return '';
    return String(value).replace(/[^0-9+]/g, '');
  }

  function buildBirthday(profile) {
    if (profile.birthdate) return profile.birthdate;
    if (profile.birthday && profile.birthyear) {
      return `${profile.birthyear}-${String(profile.birthday).replace(/\./g, '-')}`;
    }
    return profile.birthday || '';
  }

  function buildUsername(profile, users, existingId) {
    const emailBase = profile.email ? profile.email.split('@')[0] : '';
    const oauthBase = String(profile.oauthProviderId || profile.supabaseUserId || 'user')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toLowerCase();

    const base = String(emailBase || `naver_${oauthBase}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '') || 'naver_user';

    let candidate = oauthBase && !base.endsWith(oauthBase) ? `${base}_${oauthBase}` : base;
    let count = 1;

    while (users.some(user => user.username === candidate && user.id !== existingId)) {
      count += 1;
      candidate = `${base}_${count}`;
    }

    return candidate;
  }

  function decodeBase64Url(value) {
    const normalized = String(value)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function decodeSessionPayload(value) {
    try {
      return JSON.parse(decodeBase64Url(value));
    } catch (error) {
      throw new Error('네이버 로그인 세션 정보를 읽지 못했습니다.');
    }
  }

  function buildRedirectTo() {
    if (!window.location || !/^https?:$/i.test(window.location.protocol)) {
      throw new Error('네이버 로그인은 http:// 또는 https:// 주소에서만 시작할 수 있습니다.');
    }

    return `${window.location.origin}${window.location.pathname}`;
  }

  function buildServerLoginUrl(redirectTo) {
    const loginUrl = new URL('api/naver-login', window.location.href);
    loginUrl.searchParams.set('redirect_to', redirectTo);
    return loginUrl.toString();
  }

  function replaceLocation(params, hashParams) {
    const search = params.toString();
    const hash = hashParams.toString();
    history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`);
  }

  function migrateLocalUserStorageId(oldUserId, newUserId) {
    if (!oldUserId || !newUserId || oldUserId === newUserId) return;

    try {
      const recordsRaw = localStorage.getItem('HealthGuardian_records');
      if (recordsRaw) {
        const records = JSON.parse(recordsRaw);
        if (Array.isArray(records)) {
          const migrated = records.map(record => (
            record && record.userId === oldUserId
              ? { ...record, userId: newUserId }
              : record
          ));
          localStorage.setItem('HealthGuardian_records', JSON.stringify(migrated));
        }
      }
    } catch (error) {
      console.warn('[SupabaseAuth] Failed to migrate local records:', error);
    }

    const oldGoalsKey = `HealthGuardian_goals_${oldUserId}`;
    const newGoalsKey = `HealthGuardian_goals_${newUserId}`;
    const oldGoals = localStorage.getItem(oldGoalsKey);
    const newGoals = localStorage.getItem(newGoalsKey);
    if (oldGoals && !newGoals) {
      localStorage.setItem(newGoalsKey, oldGoals);
    }
    localStorage.removeItem(oldGoalsKey);
  }

  function upsertLocalUser(profile) {
    const users = Auth.getUsers();
    const existing = users.find(user =>
      (profile.supabaseUserId && user.supabaseUserId === profile.supabaseUserId) ||
      (profile.email && user.email === profile.email) ||
      (profile.oauthProviderId && user.oauthProviderId === profile.oauthProviderId)
    );

    const baseUser = existing || {
      id: `naver_${String(profile.oauthProviderId || profile.supabaseUserId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '')}`,
      createdAt: new Date().toISOString(),
      isAdmin: !!profile.isAdmin,
    };
    const preferredId = profile.supabaseUserId || baseUser.supabaseUserId || baseUser.id;

    const mergedUser = {
      ...baseUser,
      id: preferredId,
      name: profile.name || baseUser.name || 'Naver User',
      email: profile.email || baseUser.email || '',
      gender: profile.gender || baseUser.gender || '',
      birthday: buildBirthday(profile) || baseUser.birthday || '',
      birthyear: profile.birthyear || baseUser.birthyear || '',
      phone: normalizePhone(profile.phone || baseUser.phone || ''),
      avatarUrl: profile.avatarUrl || baseUser.avatarUrl || '',
      authProvider: 'naver',
      supabaseUserId: profile.supabaseUserId || baseUser.supabaseUserId || '',
      oauthProviderId: profile.oauthProviderId || baseUser.oauthProviderId || '',
      username: profile.username || baseUser.username || buildUsername(profile, users, preferredId),
      isAdmin: !!(profile.isAdmin || baseUser.isAdmin),
    };

    const nextUsers = existing
      ? users.map(user => user.id === existing.id ? mergedUser : user)
      : [...users, mergedUser];

    if (existing && existing.id && existing.id !== mergedUser.id) {
      migrateLocalUserStorageId(existing.id, mergedUser.id);
    }

    Auth.saveUsers(nextUsers);
    Auth.setUser({
      id: mergedUser.id,
      name: mergedUser.name,
      username: mergedUser.username,
      email: mergedUser.email,
      phone: mergedUser.phone,
      gender: mergedUser.gender,
      birthday: mergedUser.birthday,
      isAdmin: !!mergedUser.isAdmin,
      authProvider: 'naver',
      supabaseUserId: mergedUser.supabaseUserId,
      oauthProviderId: mergedUser.oauthProviderId,
    });

    return mergedUser;
  }

  async function signInWithNaver() {
    const redirectTo = buildRedirectTo();
    window.location.assign(buildServerLoginUrl(redirectTo));
  }

  async function signOut() {
    try {
      await fetch(new URL('api/logout', window.location.href).toString(), {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.warn('[SupabaseAuth] Logout API call failed:', error);
    }

    return { signedOut: true };
  }

  async function handleIndexSession() {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    try {
      if (params.get('logout') === '1') {
        params.delete('logout');
        replaceLocation(params, hashParams);
        return { signedOut: true };
      }

      const sessionParam = hashParams.get('naver_session');
      if (sessionParam) {
        const profile = decodeSessionPayload(sessionParam);
        upsertLocalUser(profile);
        hashParams.delete('naver_session');
        replaceLocation(params, hashParams);

        if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
          window.location.href = 'dashboard.html';
        }

        return profile;
      }

      const errorCode = params.get('error');
      if (errorCode) {
        const errorMessage = params.get('error_description') || '네이버 로그인 처리 중 오류가 발생했습니다.';
        alert(`네이버 로그인 처리 중 오류가 발생했습니다.\n${errorMessage}`);
        params.delete('error');
        params.delete('error_description');
        replaceLocation(params, hashParams);
        return { error: new Error(errorMessage) };
      }

      return null;
    } catch (error) {
      console.error('[SupabaseAuth]', error);
      alert(`네이버 로그인 처리 중 오류가 발생했습니다.\n${error.message || '세션을 생성하지 못했습니다.'}`);
      return { error };
    }
  }

  window.SupabaseAuth = {
    signInWithNaver,
    signOut,
    handleIndexSession,
  };
})();
