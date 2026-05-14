// Edge Function: invite-socio
//
// Llama el panel admin para crear un socio nuevo:
//   POST /functions/v1/invite-socio
//   Body: { email, nombre, dni, dorsal, categoria, telefono, numero_socio }
//
// Lo que hace:
//  1. Valida que quien llama esté logueado y tenga role='admin' en profiles.
//  2. Usa el SERVICE_ROLE para invitar al socio (auth.admin.inviteUserByEmail).
//     Esto crea el auth.user, dispara nuestro trigger handle_new_user que crea
//     la fila en profiles, y manda un mail al socio con un link para que ponga
//     su contraseña.
//
// Por qué no se hace desde el cliente:
//  - inviteUserByEmail requiere SERVICE_ROLE, que NO debe estar en el frontend.
//  - Edge Functions guardan el SERVICE_ROLE como env var server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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
    if (!authHeader) {
      return json({ error: 'missing_auth' }, 401);
    }

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

    // 2. Validar payload
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').toLowerCase().trim();
    const nombre = String(body.nombre || '').trim();
    const isResend = !!body.resend;
    if (!email) return json({ error: 'missing_fields' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email' }, 400);
    if (!isResend && !nombre) return json({ error: 'missing_fields' }, 400);

    // Normalizar DNI a solo dígitos
    const dni = body.dni ? String(body.dni).replace(/\D/g, '') : '';
    const numeroSocio = body.numero_socio ? String(body.numero_socio).trim() : '';

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 2.5. Si viene DNI o número de socio, chequear unicidad antes de invitar.
    // Si dejamos que falle el trigger handle_new_user por la unique constraint,
    // queda un auth.user huérfano sin profile.
    if (!isResend && (dni || numeroSocio)) {
      const filters: string[] = [];
      if (dni)          filters.push(`dni.eq.${dni}`);
      if (numeroSocio)  filters.push(`numero_socio.eq.${numeroSocio}`);
      const { data: dups, error: dupErr } = await adminClient
        .from('profiles')
        .select('dni, numero_socio')
        .or(filters.join(','));
      if (dupErr) return json({ error: 'check_failed', detail: dupErr.message }, 500);
      if (dups && dups.length > 0) {
        const hitDni  = dni && dups.some((d) => d.dni === dni);
        const hitNum  = numeroSocio && dups.some((d) => d.numero_socio === numeroSocio);
        return json({ error: hitDni ? 'dni_duplicado' : (hitNum ? 'numero_socio_duplicado' : 'duplicado') }, 409);
      }
    }

    const meta: Record<string, unknown> = {};
    if (nombre)            meta.nombre = nombre;
    if (!isResend)         meta.role = 'socio';
    if (dni)               meta.dni = dni;
    if (body.dorsal != null) meta.dorsal = String(body.dorsal);
    if (body.categoria)    meta.categoria = String(body.categoria);
    if (body.telefono)     meta.telefono = String(body.telefono);
    if (numeroSocio)       meta.numero_socio = numeroSocio;

    if (isResend) {
      // Reenviar: si el user no confirmó, generamos un nuevo link de invite.
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email
      });
      if (linkErr) return json({ error: linkErr.message }, 400);
      // generateLink no manda el mail por sí solo en algunos modos. inviteUserByEmail
      // con un user existente que no confirmó vuelve a mandar mail — usémoslo de fallback.
      const { error: invErr } = await adminClient.auth.admin.inviteUserByEmail(email, { data: meta });
      if (invErr && !String(invErr.message).toLowerCase().includes('already')) {
        return json({ error: invErr.message }, 400);
      }
      return json({ ok: true, resent: true, link: linkData?.properties?.action_link });
    }

    // 3. Crear nuevo (primer invite)
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: meta
    });
    if (inviteErr) {
      return json({ error: inviteErr.message }, 400);
    }

    return json({ ok: true, user_id: inviteData?.user?.id });
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
