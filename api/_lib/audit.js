const { fetchSupabase } = require('./supabase');

async function writeAdminAudit(auth, action, options = {}) {
  if (!auth || !auth.ok || !auth.profile || auth.session.provider === 'test') return;
  const payload = {
    actor_id: String(auth.profile.id || ''),
    actor_name: String(auth.profile.name || auth.session.name || '관리자').slice(0, 100),
    action: String(action || '').slice(0, 80),
    target_type: String(options.targetType || '').slice(0, 50),
    target_id: String(options.targetId || '').slice(0, 160),
    details: options.details && typeof options.details === 'object' ? options.details : {},
  };
  try {
    await fetchSupabase('/rest/v1/admin_audit_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[AdminAudit] Failed to write audit log:', error.message);
  }
}

module.exports = { writeAdminAudit };
