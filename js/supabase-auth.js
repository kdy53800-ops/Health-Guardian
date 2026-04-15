(function () {
  let initPromise = null;
  let configWarningShown = false;

  function normalizePhone(value) {
    if (!value) return '';
    return String(value).replace(/[^0-9+]/g, '');
  }

  function buildBirthday(profile) {
    if (profile.birthdate) return profile.birthdate;
    if (profile.birthday && profile.birthyear) {
      return `${profile.birthyear}-${String(profile.birthday).replace('.', '-')}`;
    }
    return profile.birthday || '';
  }

  function pickProfile(user) {
    const identity = (user.identities || []).find(item => item.provider === 'custom:naver' || item.provider === 'naver');
    const source = {
      ...(identity && identity.identity_data ? identity.identity_data : {}),
      ...(user.user_metadata || {}),
      ...(user.app_metadata || {}),
    };

    return {
      supabaseUserId: user.id,
      oauthProviderId: source.id || source.sub || user.id,
      authProvider: 'naver',
      name: source.name || source.full_name || source.nickname || user.email || 'Naver User',
      email: source.email || user.email || '',
      gender: source.gender || '',
      birthday: buildBirthday(source),
      birthyear: source.birthyear || '',
      phone: normalizePhone(source.mobile || source.mobile_e164 || source.phone || user.phone || ''),
      avatarUrl: source.profile_image || source.avatar_url || '',
    };
  }

  function buildUsername(profile, users, existingId) {
    const baseSource = profile.email
      ? profile.email.split('@')[0]
      : `naver_${String(profile.oauthProviderId || profile.supabaseUserId || 'user').slice(0, 8)}`;

    const base = String(baseSource)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '') || 'naver_user';

    let candidate = base;
    let count = 1;

    while (users.some(user => user.username === candidate && user.id !== existingId)) {
      count += 1;
      candidate = `${base}_${count}`;
    }

    return candidate;
  }

  function upsertLocalUser(profile) {
    const users = Auth.getUsers();
    const existing = users.find(user =>
      user.supabaseUserId === profile.supabaseUserId ||
      (profile.email && user.email === profile.email) ||
      (profile.oauthProviderId && user.oauthProviderId === profile.oauthProviderId)
    );

    const baseUser = existing || {
      id: `naver_${String(profile.oauthProviderId || profile.supabaseUserId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '')}`,
      createdAt: new Date().toISOString(),
      isAdmin: false,
    };

    const mergedUser = {
      ...baseUser,
      name: profile.name || baseUser.name || 'Naver User',
      email: profile.email || baseUser.email || '',
      gender: profile.gender || baseUser.gender || '',
      birthday: profile.birthday || baseUser.birthday || '',
      birthyear: profile.birthyear || baseUser.birthyear || '',
      phone: profile.phone || baseUser.phone || '',
      avatarUrl: profile.avatarUrl || baseUser.avatarUrl || '',
      authProvider: 'naver',
      supabaseUserId: profile.supabaseUserId,
      oauthProviderId: profile.oauthProviderId,
      username: baseUser.username || buildUsername(profile, users, baseUser.id),
    };

    const nextUsers = existing
      ? users.map(user => user.id === existing.id ? mergedUser : user)
      : [...users, mergedUser];

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
    });

    return mergedUser;
  }

  async function syncProfileRow(client, profile, localUser) {
    const payload = {
      id: profile.supabaseUserId,
      username: localUser.username,
      name: profile.name || localUser.name || '',
      email: profile.email || localUser.email || '',
      gender: profile.gender || localUser.gender || '',
      birthday: profile.birthday || localUser.birthday || '',
      birthyear: profile.birthyear || localUser.birthyear || '',
      phone: profile.phone || localUser.phone || '',
      avatar_url: profile.avatarUrl || localUser.avatarUrl || '',
      auth_provider: 'naver',
      oauth_provider_id: profile.oauthProviderId || '',
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('[SupabaseAuth] profiles upsert skipped:', error.message);
    }
  }

  function getInlineConfig() {
    const inline = window.__SUPABASE_CONFIG__;
    if (!inline || !inline.supabaseUrl || !inline.supabaseAnonKey) {
      return null;
    }

    return {
      ok: true,
      supabaseUrl: inline.supabaseUrl,
      supabaseAnonKey: inline.supabaseAnonKey,
      naverProvider: inline.naverProvider || 'custom:naver',
    };
  }

  function createConfigError(message, cause) {
    const error = new Error(message);
    error.code = 'SUPABASE_CONFIG_UNAVAILABLE';
    if (cause) error.cause = cause;
    return error;
  }

  function isConfigUnavailableError(error) {
    return !!(error && error.code === 'SUPABASE_CONFIG_UNAVAILABLE');
  }

  function warnConfigUnavailable(error) {
    if (configWarningShown) return;
    configWarningShown = true;
    console.warn('[SupabaseAuth] Supabase config unavailable. Naver login is disabled until runtime config is provided.', error);
  }

  function replaceSearch(params) {
    const clean = params.toString();
    history.replaceState({}, '', `${window.location.pathname}${clean ? `?${clean}` : ''}`);
  }

  async function fetchConfig() {
    const inlineConfig = getInlineConfig();
    if (inlineConfig) {
      return inlineConfig;
    }

    const configUrl = new URL('api/client-config', window.location.href).toString();
    let response;

    try {
      response = await fetch(configUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      throw createConfigError('Supabase runtime configuration could not be loaded.', error);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      throw createConfigError('Supabase runtime configuration response was invalid.', error);
    }

    if (!response.ok || !payload.ok || !payload.supabaseUrl || !payload.supabaseAnonKey) {
      throw createConfigError(payload && payload.message ? payload.message : 'Supabase configuration request failed.');
    }

    return payload;
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw createConfigError('Supabase browser client is not loaded.');
      }

      const config = await fetchConfig();
      const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      });

      return { client, config };
    })().catch(error => {
      initPromise = null;
      throw error;
    });

    return initPromise;
  }

  async function syncCurrentSession() {
    const setup = await init();
    const { data, error } = await setup.client.auth.getSession();

    if (error) throw error;
    if (!data.session || !data.session.user) return null;

    const profile = pickProfile(data.session.user);
    const localUser = upsertLocalUser(profile);
    await syncProfileRow(setup.client, profile, localUser);
    return profile;
  }

  async function signInWithNaver() {
    const setup = await init();
    const redirectTo = `${window.location.origin}${window.location.pathname}`;

    const { data, error } = await setup.client.auth.signInWithOAuth({
      provider: setup.config.naverProvider,
      options: { redirectTo },
    });

    if (error) throw error;
    if (data && data.url) {
      window.location.assign(data.url);
    }
  }

  async function signOut() {
    const setup = await init();
    await setup.client.auth.signOut();
  }

  async function handleIndexSession() {
    const params = new URLSearchParams(window.location.search);

    try {
      if (params.get('logout') === '1') {
        try {
          await signOut();
        } catch (error) {
          if (!isConfigUnavailableError(error)) throw error;
          warnConfigUnavailable(error);
        }

        params.delete('logout');
        replaceSearch(params);
        return { signedOut: true };
      }

      const authCode = params.get('code');
      if (authCode) {
        const setup = await init();
        const { error } = await setup.client.auth.exchangeCodeForSession(authCode);
        if (error) throw error;

        params.delete('code');
        params.delete('state');
        replaceSearch(params);
      }

      let profile;
      try {
        profile = await syncCurrentSession();
      } catch (error) {
        if (!isConfigUnavailableError(error)) throw error;
        warnConfigUnavailable(error);
        return null;
      }

      if (!profile) return null;

      if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
        window.location.href = 'dashboard.html';
      }

      return profile;
    } catch (error) {
      console.error('[SupabaseAuth]', error);
      if (params.get('code') || params.get('error_description') || params.get('error')) {
        alert(`네이버 로그인 처리 중 오류가 발생했습니다.\n${error.message || '세션을 생성하지 못했습니다.'}`);
      }
      return { error };
    }
  }

  window.SupabaseAuth = {
    init,
    signInWithNaver,
    signOut,
    syncCurrentSession,
    handleIndexSession,
  };
})();
