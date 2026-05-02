import { createClient } from '@supabase/supabase-js';

const URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!URL || !ANON) {
  // No tiramos throw para que el sitio público (landing) siga renderizando
  // sin auth configurada. El portal y el panel admin sí van a fallar al
  // intentar leer/escribir y mostrar un mensaje claro.
  console.warn('[AC] Supabase no está configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env');
}

// Capturamos el "intent" de la URL ANTES de crear el cliente, porque
// detectSessionInUrl=true va a procesar y limpiar el hash/query. Sin esto
// perderíamos saber si el usuario vino de un link de invite o recovery.
const _initialUrl = typeof window !== 'undefined'
  ? (window.location.hash + window.location.search).toLowerCase()
  : '';
export const initialAuthIntent = (() => {
  if (_initialUrl.includes('type=invite')) return 'invite';
  if (_initialUrl.includes('type=recovery')) return 'recovery';
  if (_initialUrl.includes('type=signup')) return 'signup';
  return null;
})();

export const supabase = createClient(URL || 'https://placeholder.supabase.co', ANON || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,    // procesa tokens de invite/recovery del email
    flowType: 'pkce'
  }
});

export const isSupabaseConfigured = !!(URL && ANON);
