const { fetchSupabase } = require('./supabase');
const { readSessionFromRequest } = require('./session');

function encodeEq(value) {
  return encodeURIComponent(String(value));
}

async function requireAdminSession(req) {
  const session = readSessionFromRequest(req);
  if (!session || !session.uid) {
    return { ok: false, statusCode: 401, message: 'Login session is required.' };
  }

  // 이스터에그 테스트 관리자 계정은 검증 우회
  if (session.uid === 'test_admin_001') {
    return {
      ok: true,
      session,
      profile: { id: 'test_admin_001', is_admin: true, name: '테스트 관리자' }
    };
  }

  const rows = await fetchSupabase(
    `/rest/v1/profiles?select=id,is_admin&id=eq.${encodeEq(session.uid)}&limit=1`,
    { headers: { Accept: 'application/json' } }
  );
  const profile = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!profile || !profile.is_admin) {
    return { ok: false, statusCode: 403, message: 'Admin permission is required.' };
  }

  return {
    ok: true,
    session,
    profile,
  };
}

async function requireAuthSession(req) {
  const session = readSessionFromRequest(req);
  if (!session || !session.uid) {
    return { ok: false, statusCode: 401, message: 'Login session is required.' };
  }
  return { ok: true, session, id: session.uid };
}

module.exports = {
  requireAdminSession,
  requireAuthSession,
};
