const {
  clearStateCookie,
  encodeBase64Url,
  getOrigin,
  getRequestUrl,
  parseCookies,
  readStatePayload,
  redirectWithError,
} = require('./_lib/naver');
const { syncProfile } = require('./_lib/supabase');

function normalizePhone(value) {
  if (!value) return '';
  return String(value).replace(/[^0-9+]/g, '');
}

function buildBirthday(profile) {
  if (profile.birthyear && profile.birthday) {
    return `${profile.birthyear}-${String(profile.birthday).replace('.', '-')}`;
  }
  return profile.birthday || '';
}

function buildSessionPayload(naverProfile, syncedProfile) {
  return {
    supabaseUserId: syncedProfile.id || '',
    oauthProviderId: naverProfile.oauthProviderId || '',
    authProvider: 'naver',
    username: syncedProfile.username || '',
    isAdmin: !!syncedProfile.is_admin,
    name: naverProfile.name || naverProfile.nickname || 'Naver User',
    email: naverProfile.email || '',
    gender: naverProfile.gender || '',
    birthday: buildBirthday(naverProfile),
    birthyear: naverProfile.birthyear || '',
    phone: normalizePhone(naverProfile.mobile || ''),
    avatarUrl: naverProfile.profile_image || '',
  };
}

async function exchangeCodeForToken({ clientId, clientSecret, code, state }) {
  const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
  tokenUrl.searchParams.set('grant_type', 'authorization_code');
  tokenUrl.searchParams.set('client_id', clientId);
  tokenUrl.searchParams.set('client_secret', clientSecret);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('state', state);

  const response = await fetch(tokenUrl.toString(), { method: 'POST' });
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error_description || payload.error || 'Failed to exchange the Naver authorization code.');
  }

  return payload;
}

async function fetchNaverProfile(accessToken) {
  const response = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json();

  if (!response.ok || payload.resultcode !== '00' || !payload.response) {
    throw new Error((payload && payload.message) || 'Failed to fetch the Naver profile.');
  }

  return {
    ...payload.response,
    oauthProviderId: payload.response.id || '',
  };
}

module.exports = async function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID || '';
  const clientSecret = process.env.NAVER_CLIENT_SECRET || '';
  const origin = getOrigin(req);
  const requestUrl = getRequestUrl(req, origin, '/api/naver-callback');
  const cookie = clearStateCookie(origin);

  if (!clientId || !clientSecret) {
    redirectWithError(res, `${origin}/index.html`, 'naver_config_missing', 'NAVER_CLIENT_ID or NAVER_CLIENT_SECRET is missing.', cookie);
    return;
  }

  const statePayload = requestUrl.searchParams.get('state') || '';
  const state = readStatePayload(statePayload);
  const cookies = parseCookies(req);
  const redirectTo = state && state.redirectTo ? state.redirectTo : `${origin}/index.html`;

  if (!state || !cookies.HealthGuardian_naver_state || cookies.HealthGuardian_naver_state !== state.nonce) {
    redirectWithError(res, redirectTo, 'naver_state_invalid', '네이버 로그인 상태 검증에 실패했습니다. 다시 시도해 주세요.', cookie);
    return;
  }

  const upstreamError = requestUrl.searchParams.get('error');
  if (upstreamError) {
    redirectWithError(
      res,
      redirectTo,
      upstreamError,
      requestUrl.searchParams.get('error_description') || '네이버 로그인이 취소되었습니다.',
      cookie
    );
    return;
  }

  const code = requestUrl.searchParams.get('code');
  if (!code) {
    redirectWithError(res, redirectTo, 'naver_code_missing', '네이버 인증 코드가 전달되지 않았습니다.', cookie);
    return;
  }

  try {
    const token = await exchangeCodeForToken({
      clientId,
      clientSecret,
      code,
      state: statePayload,
    });
    const naverProfile = await fetchNaverProfile(token.access_token);
    const syncResult = await syncProfile({
      oauthProviderId: naverProfile.oauthProviderId,
      name: naverProfile.name || naverProfile.nickname || '',
      email: naverProfile.email || '',
      gender: naverProfile.gender || '',
      birthday: buildBirthday(naverProfile),
      birthyear: naverProfile.birthyear || '',
      phone: normalizePhone(naverProfile.mobile || ''),
      avatarUrl: naverProfile.profile_image || '',
    });

    const session = buildSessionPayload(naverProfile, syncResult.profile);
    const target = new URL(redirectTo);
    target.hash = `naver_session=${encodeBase64Url(JSON.stringify(session))}`;

    res.statusCode = 302;
    res.setHeader('Set-Cookie', cookie);
    res.setHeader('Location', target.toString());
    res.end();
  } catch (error) {
    redirectWithError(res, redirectTo, 'naver_callback_failed', error.message || '네이버 로그인 처리에 실패했습니다.', cookie);
  }
};
