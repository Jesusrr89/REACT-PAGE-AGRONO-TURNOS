// Edge Function: delete-socio
//
// Borra DEFINITIVAMENTE un socio (datos personales + cuotas + pagos).
// Cumple con Ley 25.326 art. 16 (derecho de supresión).
//
// POST /functions/v1/delete-socio
// Body: { profile_id }
//
// Lo que hace:
//  1. Valida que quien llama esté logueado y tenga role='admin' en profiles.
//  2. Usa el SERVICE_ROLE para hacer auth.admin.deleteUser(profile_id).
//     El ON DELETE CASCADE del schema borra el profile, y a su vez cascada
//     borra cuotas y pagos asociados a ese socio.
//
// Por qué no se hace desde el cliente:
//  - auth.admin.deleteUser requiere SERVICE_ROLE, que NO va al frontend.
//  - Hace falta una sola operación atómica que también borre auth.users
//    (las RLS policies del cliente solo borrarían profiles).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verificar que el caller sea admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_auth' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: 'invalid_auth' }, 401);

    const { data: profile, error: profErr } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profErr || profile?.role !== 'admin') {
      return json({ error: 'not_admin' }, 403);
    }

    // 2. Validar payload — formato UUID v4 estándar (no solo "36 chars de hex/-")
    const body = await req.json().catch(() => ({}));
    const profileId = String(body.profile_id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId)) {
      return json({ error: 'invalid_profile_id' }, 400);
    }

    // 3. No permitir auto-borrado
    if (profileId === user.id) {
      return json({ error: 'cannot_delete_self' }, 400);
    }

    // 4. No permitir borrar a otro admin (chequeo extra)
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: target } = await adminClient
      .from('profiles')
      .select('role, email, nombre')
      .eq('id', profileId)
      .single();
    if (target?.role === 'admin') {
      return json({ error: 'cannot_delete_admin' }, 400);
    }

    // 5. Borrar auth.user — cascada borra profile, cuotas, pagos
    const { error: delErr } = await adminClient.auth.admin.deleteUser(profileId);
    if (delErr) {
      return json({ error: delErr.message }, 400);
    }

    return json({
      ok: true,
      deleted: { profile_id: profileId, email: target?.email, nombre: target?.nombre }
    });
  } catch (err) {
    return json({ error: 'server_error', detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
