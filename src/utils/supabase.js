import { createClient } from '@supabase/supabase-js';

const URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!URL || !ANON) {
  // No tiramos throw para que el sitio público (landing) siga renderizando
  // sin auth configurada. El portal y el panel admin sí van a fallar al
  // intentar leer/escribir y mostrar un mensaje claro.
  if (import.meta.env.DEV) {
    console.warn('[AC] Supabase no está configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env');
  }
}

export const supabase = createClient(URL || 'https://placeholder.supabase.co', ANON || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce'
  }
});

export const isSupabaseConfigured = !!(URL && ANON);
