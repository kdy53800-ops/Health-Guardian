function getSupabaseEnv() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function hasSupabaseAdmin() {
  const env = getSupabaseEnv();
  return !!(env.supabaseUrl && env.serviceRoleKey);
}

function createHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    const invalid = new Error('Supabase returned a non-JSON response.');
    invalid.status = response.status;
    invalid.body = text;
    throw invalid;
  }
}

async function fetchSupabase(path, options = {}) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: createHeaders(serviceRoleKey, options.headers),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    const message = payload && (payload.msg || payload.message || payload.error_description || payload.error);
    const error = new Error(message || 'Supabase request failed.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function buildUsername(profile, existingUsername) {
  if (existingUsername) return existingUsername;

  const emailBase = profile.email ? profile.email.split('@')[0] : '';
  const oauthSuffix = String(profile.oauthProviderId || 'user')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-8)
    .toLowerCase();

  const base = String(emailBase || `naver_${oauthSuffix || 'user'}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '') || 'naver_user';

  return oauthSuffix && !base.endsWith(oauthSuffix) ? `${base}_${oauthSuffix}` : base;
}

function buildAuthEmail(profile) {
  if (profile.email) return profile.email;

  const oauthId = String(profile.oauthProviderId || profile.naverId || 'user')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

  return `naver_${oauthId || 'user'}@users.health-guardian.local`;
}

async function findProfile(profile) {
  const filters = [];
  if (profile.oauthProviderId) {
    filters.push(`oauth_provider_id=eq.${encodeURIComponent(profile.oauthProviderId)}`);
  }
  if (profile.email) {
    filters.push(`email=eq.${encodeURIComponent(profile.email)}`);
  }

  for (const filter of filters) {
    const rows = await fetchSupabase(`/rest/v1/profiles?select=*&${filter}&limit=1`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (Array.isArray(rows) && rows.length) {
      return rows[0];
    }
  }

  return null;
}

async function createAuthUser(profile) {
  const payload = {
    email: buildAuthEmail(profile),
    email_confirm: true,
    user_metadata: {
      full_name: profile.name || '',
      name: profile.name || '',
      avatar_url: profile.avatarUrl || '',
      phone: profile.phone || '',
      gender: profile.gender || '',
      birthday: profile.birthday || '',
      birthyear: profile.birthyear || '',
      oauth_provider_id: profile.oauthProviderId || '',
      auth_provider: 'naver',
    },
    app_metadata: {
      provider: 'naver',
      providers: ['naver'],
    },
  };

  return fetchSupabase('/auth/v1/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function upsertProfileRow(profile, existingProfile) {
  const authUser = existingProfile ? { id: existingProfile.id, email: existingProfile.email || buildAuthEmail(profile) } : await createAuthUser(profile);
  const payload = {
    id: authUser.id,
    username: buildUsername(profile, existingProfile && existingProfile.username),
    name: profile.name || '',
    email: profile.email || authUser.email || '',
    gender: profile.gender || '',
    birthday: profile.birthday || '',
    birthyear: profile.birthyear || '',
    phone: profile.phone || '',
    avatar_url: profile.avatarUrl || '',
    auth_provider: 'naver',
    oauth_provider_id: profile.oauthProviderId || '',
    updated_at: new Date().toISOString(),
  };

  const rows = await fetchSupabase('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  return Array.isArray(rows) && rows[0] ? rows[0] : payload;
}

async function syncProfile(profile) {
  if (!hasSupabaseAdmin()) {
    return {
      synced: false,
      profile: {
        id: '',
        username: buildUsername(profile, ''),
        is_admin: false,
      },
    };
  }

  const existingProfile = await findProfile(profile);
  const row = await upsertProfileRow(profile, existingProfile);

  return {
    synced: true,
    profile: row,
  };
}

module.exports = {
  buildAuthEmail,
  hasSupabaseAdmin,
  syncProfile,
};
