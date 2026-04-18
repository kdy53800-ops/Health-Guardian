// js/supabase-config.js
let supabaseClient = null;

async function initSupabase() {
  if (supabaseClient) return supabaseClient;
  
  try {
    const response = await fetch(new URL('api/config', window.location.href).toString());
    const config = await response.json();
    
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      console.error('Supabase config missing. Please check environment variables.');
      return null;
    }
    
    // Initialize Supabase client with auth disabled to avoid JWT conflicts
    supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    return supabaseClient;
  } catch (err) {
    console.error('Failed to initialize Supabase:', err);
    return null;
  }
}

// Global initialization
(async () => {
  // If supabase library is loaded, try to initialize
  if (typeof supabase !== 'undefined') {
    await initSupabase();
  }
})();
