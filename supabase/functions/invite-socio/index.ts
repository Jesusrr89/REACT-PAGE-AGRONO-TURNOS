// Edge Function: invite-socio
//
// Llama el panel admin para crear un socio nuevo:
//   POST /functions/v1/invite-socio
//   Body: { nombre, dni, dorsal, categoria, telefono }
//
// Lo que hace:
//  1. Valida que quien llama esté logueado y tenga role='admin' en profiles.
//  2. NO se le pide email al admin: el sistema genera un email sintético
//     (dni-XXXX@ac.local) que solo se usa internamente como identificador
//     para Supabase Auth. El socio nunca lo ve ni lo usa.
//  3. Usa el SERVICE_ROLE para crear el auth.user con password = DNI y email
//     ya confirmado (auth.admin.createUser). El trigger handle_new_user crea
//     la fila en profiles con must_change_password=true. El socio se loguea
//     con DNI/DNI y en el primer ingreso la app lo fuerza a elegir una
//     contraseña real.
//  4. Si viene resend=true, resetea la pass al DNI vigente y vuelve a poner
//     must_change_password=true (sirve cuando el socio se olvida la pass y
//     el admin lo destraba).
//
// Por qué no se hace desde el cliente:
//  - admin.createUser / updateUserById requieren SERVICE_ROLE, que NO debe
//    estar en el frontend. Edge Functions lo guardan como env var server-side.

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

    // 2. Validar payload (defensa en profundidad: el cliente también valida,
    // pero acá blindamos longitudes y charsets server-side).
    const body = await req.json().catch(() => ({}));
    const nombre = String(body.nombre || '').trim();
    const isResend = !!body.resend;

    if (!isResend) {
      if (!nombre) return json({ error: 'missing_fields' }, 400);
      if (nombre.length < 2 || nombre.length > 80) return json({ error: 'invalid_nombre' }, 400);
      // Letras unicode + espacios + guiones + apóstrofes + puntos
      if (!/^[\p{L}\s.\-'’]{2,80}$/u.test(nombre)) return json({ error: 'invalid_nombre' }, 400);
    }

    // Normalizar DNI a solo dígitos. El DNI es la pass inicial: obligatorio.
    const dni = body.dni ? String(body.dni).replace(/\D/g, '') : '';
    if (!dni) return json({ error: 'dni_requerido' }, 400);
    if (dni.length < 7 || dni.length > 9) return json({ error: 'invalid_dni' }, 400);

    // Email siempre sintético desde el DNI. El admin NO carga email, los
    // socios tampoco lo usan: es solo el identificador que necesita Supabase
    // Auth para crear el user. Cualquier `body.email` que venga del cliente
    // se ignora a propósito.
    const email = `dni-${dni}@ac.local`;

    // dorsal: 1-999
    let dorsal: number | null = null;
    if (body.dorsal != null && body.dorsal !== '') {
      const n = Number(body.dorsal);
      if (!Number.isInteger(n) || n < 1 || n > 999) return json({ error: 'invalid_dorsal' }, 400);
      dorsal = n;
    }

    const categoria = body.categoria ? String(body.categoria).trim().slice(0, 60) : '';
    if (categoria && !/^[\p{L}0-9\s.\-/]{1,60}$/u.test(categoria)) {
      return json({ error: 'invalid_categoria' }, 400);
    }

    const telefono = body.telefono ? String(body.telefono).trim().slice(0, 25) : '';
    if (telefono && !/^[\d\s+().\-]{6,25}$/.test(telefono)) {
      return json({ error: 'invalid_telefono' }, 400);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 2.5. Chequear unicidad de DNI antes de crear, así no queda un auth.user
    // huérfano si el trigger handle_new_user falla por unique constraint.
    if (!isResend) {
      const { data: dups, error: dupErr } = await adminClient
        .from('profiles')
        .select('dni')
        .eq('dni', dni);
      if (dupErr) return json({ error: 'check_failed', detail: dupErr.message }, 500);
      if (dups && dups.length > 0) {
        return json({ error: 'dni_duplicado' }, 409);
      }
    }

    const meta: Record<string, unknown> = { dni };
    if (nombre)         meta.nombre = nombre;
    if (!isResend) {
      meta.role = 'socio';
      meta.must_change_password = true;
    }
    if (dorsal != null) meta.dorsal = String(dorsal);
    if (categoria)      meta.categoria = categoria;
    if (telefono)       meta.telefono = telefono;

    if (isResend) {
      // Resetear pass al DNI y volver a forzar cambio en próximo ingreso.
      // 1) Buscar el auth.user via profiles (más robusto que listUsers, que
      // está paginado y rompe en clubes con >N socios). El admin client ignora RLS.
      const { data: profileRow, error: profErr } = await adminClient
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
      if (profErr || !profileRow) return json({ error: 'user_not_found' }, 404);

      // 2) Reset pass = DNI.
      const { error: updErr } = await adminClient.auth.admin.updateUserById(profileRow.id, {
        password: dni,
        email_confirm: true
      });
      if (updErr) return json({ error: updErr.message }, 400);

      // 3) Volver a marcar must_change_password.
      const { error: profUpdErr } = await adminClient
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', profileRow.id);
      if (profUpdErr) return json({ error: profUpdErr.message }, 500);

      return json({ ok: true, resent: true });
    }

    // 3. Crear nuevo: password inicial = DNI, email ya confirmado.
    // El trigger handle_new_user crea la fila en profiles con must_change_password=true.
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: dni,
      email_confirm: true,
      user_metadata: meta
    });
    if (createErr) {
      return json({ error: createErr.message }, 400);
    }

    return json({ ok: true, user_id: created?.user?.id });
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
