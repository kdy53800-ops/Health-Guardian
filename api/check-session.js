const { readSessionFromRequest } = require('./_lib/session');
const { fetchSupabase } = require('./_lib/supabase');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function encodeEq(value) {
  return encodeURIComponent(String(value));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const session = readSessionFromRequest(req);
    if (!session || !session.uid) {
      sendJson(res, 401, { ok: false, message: 'Login session is required.' });
      return;
    }

    const rows = await fetchSupabase(
      `/rest/v1/profiles?select=*&id=eq.${encodeEq(session.uid)}&limit=1`,
      { headers: { Accept: 'application/json' } }
    );
    const profile = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!profile) {
      sendJson(res, 404, { ok: false, message: 'User profile not found.' });
      return;
    }

    if (profile.is_blocked) {
      sendJson(res, 403, { ok: false, message: 'This account has been blocked.' });
      return;
    }

    // 클라이언트 LocalStorage의 KEYS.CURRENT_USER 형태에 맞춘 스키마 반환
    const userSession = {
      id: profile.id,
      name: profile.name,
      username: profile.username,
      email: profile.email || '',
      phone: profile.phone || '',
      gender: profile.gender || '',
      birthday: profile.birthday || '',
      birthyear: profile.birthyear || '',
      isAdmin: !!profile.is_admin,
      isSpecial: !!profile.is_special,
      authProvider: profile.auth_provider || 'naver',
      supabaseUserId: profile.id,
      oauthProviderId: profile.oauth_provider_id || '',
    };

    sendJson(res, 200, { ok: true, user: userSession });
  } catch (error) {
    console.error('[CheckSessionAPI]', error);
    sendJson(res, 500, { ok: false, message: error.message || 'Internal Server Error' });
  }
};
