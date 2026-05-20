/**
 * API del club — backend Supabase.
 *
 * Mantiene las firmas de las funciones que App.jsx ya usa, pero por debajo
 * habla con Supabase (auth + tablas profiles/cuotas/pagos/config).
 *
 * Helpers de presentación (sortCuotasDesc, buildWhatsappLink, etc.) son lógica
 * pura y no dependen del backend.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

const MES_NOMBRE = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// ============================================================
// Auth + sesión
// ============================================================

/**
 * Login dual: detecta si el identificador es email o DNI y elige el camino.
 *  - Si tiene '@': es admin (o jugador que tiene email registrado) → login
 *    directo con signInWithPassword.
 *  - Si son solo dígitos: es jugador con DNI → resolvemos el email vía RPC
 *    get_email_by_dni y de ahí signInWithPassword.
 *
 * El admin sigue ingresando con su email + password de siempre (sin tocar).
 * Los jugadores entran con DNI; la primera vez el profile trae
 * must_change_password=true y App.jsx fuerza el cambio antes de mostrar el
 * portal.
 */
export async function loginUser(identifier, password) {
  if (!isSupabaseConfigured) return { ok: false, error: 'API_URL_NOT_CONFIGURED' };

  const id = String(identifier || '').trim().toLowerCase();
  if (!id) return { ok: false, error: 'missing_credentials' };

  let email;
  if (id.includes('@')) {
    email = id;
  } else {
    const dniClean = id.replace(/\D/g, '');
    if (!dniClean || dniClean.length < 7 || dniClean.length > 9) {
      return { ok: false, error: 'invalid_credentials' };
    }
    const { data: resolved, error: rpcErr } = await supabase.rpc('get_email_by_dni', { p_dni: dniClean });
    if (rpcErr || !resolved) return { ok: false, error: 'invalid_credentials' };
    email = resolved;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: mapAuthError(error) };
  if (!data.user) return { ok: false, error: 'invalid_credentials' };

  return await loadFullSession();
}

/**
 * Marca must_change_password=false en el profile del usuario logueado.
 * Se llama después de que el socio cambia su contraseña inicial.
 */
export async function clearMustChangePassword() {
  if (!isSupabaseConfigured) return { ok: false, error: 'API_URL_NOT_CONFIGURED' };
  const { error } = await supabase.rpc('clear_must_change_password');
  if (error) return { ok: false, error: 'server_error' };
  return { ok: true };
}

export async function logoutUser() {
  await supabase.auth.signOut();
}

/**
 * Refresca la sesión actual: vuelve a tirar profile + cuotas + config.
 * Antes recibía un token, ahora la sesión la mantiene Supabase Auth.
 * Se acepta el parámetro para no romper la firma.
 */
export async function refreshSession(_token) {
  if (!isSupabaseConfigured) return { ok: false, error: 'API_URL_NOT_CONFIGURED' };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'invalid_token' };
  return await loadFullSession();
}

// Nota: el reset de contraseña NO se hace desde el lado del socio. El admin
// usa el botón "Resetear contraseña a DNI" en el detalle del socio, que llama
// a invite-socio (resend) y deja al socio con pass=DNI + must_change_password.

// ============================================================
// Pagos (MP) — stubs hasta que se implemente la Edge Function
// ============================================================

export async function createPayment(_token, _items) {
  return { ok: false, error: 'mp_not_configured' };
}

export async function confirmPayment(_token, _preference_id) {
  return { ok: false, error: 'mp_not_configured' };
}

// ============================================================
// Helpers internos
// ============================================================

async function loadFullSession() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'invalid_token' };

  const [profileRes, cuotasRes, configRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('cuotas').select('*').eq('socio_id', user.id).order('anio', { ascending: false }).order('mes', { ascending: false }),
    supabase.from('config').select('key, value')
  ]);

  if (profileRes.error || !profileRes.data) return { ok: false, error: 'user_not_found' };

  const profile = profileRes.data;
  if (profile.estado === 'desactivado') return { ok: false, error: 'account_deactivated' };

  // Estado financiero real: si tiene al menos una cuota con saldo > 0, está
  // "con deuda". Sin esto, el portal del socio mostraba "al día" siempre.
  const cuotas = cuotasRes.data || [];
  const tieneDeuda = cuotas.some((c) => c.estado !== 'pagado' && Number(c.saldo) > 0);

  return {
    ok: true,
    role: profile.role,
    user: shapeUser(profile, user.email, tieneDeuda),
    cuotas: cuotas.map(shapeCuota),
    config: shapeConfig(configRes.data || [])
  };
}

function shapeUser(profile, email, tieneDeuda) {
  return {
    socio_id: profile.numero_socio || profile.id,
    profile_id: profile.id,
    email,
    nombre: profile.nombre,
    dni: profile.dni || '',
    dorsal: profile.dorsal != null ? String(profile.dorsal) : '',
    categoria: profile.categoria || '',
    telefono: profile.telefono || '',
    fecha_alta: profile.fecha_alta || '',
    estado_cuenta: profile.estado === 'activo' ? 'activo' : 'desactivado',
    estado: tieneDeuda ? 'con_deuda' : 'al_dia',
    must_change_password: !!profile.must_change_password
  };
}

function shapeCuota(c) {
  return {
    cuota_id: c.id,
    mes: MES_NOMBRE[c.mes] || String(c.mes),
    anio: c.anio,
    monto: Number(c.monto),
    monto_pagado: Number(c.monto_pagado),
    recargo: Number(c.recargo),
    saldo: Number(c.saldo),
    total_cobrar: Number(c.total_a_cobrar),
    estado: c.estado,
    fecha_vencimiento: c.fecha_vencimiento || '',
    fecha_pago: c.fecha_pago || ''
  };
}

function shapeConfig(rows) {
  const out = {};
  for (const r of rows) out[r.key] = r.value || '';
  // Compat con la UI vieja
  out.mp_enabled = !!(out.mp_link);
  return out;
}

function mapAuthError(err) {
  const msg = (err && err.message || '').toLowerCase();
  if (msg.includes('invalid login')) return 'invalid_credentials';
  if (msg.includes('email not confirmed')) return 'invalid_credentials';
  if (msg.includes('rate')) return 'too_many_attempts';
  return 'server_error';
}

// ============================================================
// Helpers de presentación (lógica pura, sin backend)
// ============================================================
const MES_ORDEN = {
  Enero: 1, Febrero: 2, Marzo: 3, Abril: 4, Mayo: 5, Junio: 6,
  Julio: 7, Agosto: 8, Septiembre: 9, Octubre: 10, Noviembre: 11, Diciembre: 12
};

export function sortCuotasDesc(cuotas) {
  return [...cuotas].sort((a, b) => {
    if (a.anio !== b.anio) return (b.anio || 0) - (a.anio || 0);
    return (MES_ORDEN[b.mes] || 0) - (MES_ORDEN[a.mes] || 0);
  });
}

export function buildWhatsappLink(config, user, cuotaPendiente) {
  const phone = String(config && config.whatsapp || '').replace(/\D/g, '');
  if (!phone) return null;

  const dorsal = user && user.dorsal ? ` (dorsal #${user.dorsal})` : '';
  const nombre = user && user.nombre || 'un socio del club';

  let msg;
  if (cuotaPendiente) {
    const monto = Number(cuotaPendiente.monto || 0).toLocaleString('es-AR');
    msg = `Hola! Soy ${nombre}${dorsal}. Quiero regularizar mi cuota de ${cuotaPendiente.mes} ${cuotaPendiente.anio} ($${monto}). ¡Gracias!`;
  } else {
    msg = `Hola! Soy ${nombre}${dorsal}. Quiero hacer una consulta sobre mi cuota.`;
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function buildCartWhatsappLink(config, user, cartItems) {
  const phone = String(config && config.whatsapp || '').replace(/\D/g, '');
  if (!phone) return null;
  if (!cartItems || cartItems.length === 0) return null;

  const dorsal = user && user.dorsal ? ` (dorsal #${user.dorsal})` : '';
  const nombre = user && user.nombre || 'un socio';
  const lista = cartItems.map(c =>
    `• ${c.mes} ${c.anio} — $${Number(c.monto || 0).toLocaleString('es-AR')}`
  ).join('\n');
  const total = cartItems.reduce((s, c) => s + Number(c.monto || 0), 0);

  const msg =
    `Hola! Soy ${nombre}${dorsal}. Quiero coordinar el pago de:\n\n` +
    `${lista}\n\n` +
    `Total: $${total.toLocaleString('es-AR')}\n\n` +
    `¿Me pasan los datos para transferir? ¡Gracias!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function describeError(code) {
  switch (code) {
    case 'invalid_credentials':   return 'Credenciales incorrectas. Revisá tu DNI/email y contraseña.';
    case 'missing_credentials':   return 'Completá tu DNI o email y la contraseña.';
    case 'invalid_input':         return 'Datos inválidos.';
    case 'too_many_attempts':     return 'Demasiados intentos. Esperá unos minutos.';
    case 'invalid_token':         return 'Tu sesión expiró. Volvé a ingresar.';
    case 'user_not_found':        return 'No encontramos tu usuario.';
    case 'account_deactivated':   return 'Tu cuenta está desactivada. Comunicate con la secretaría.';
    case 'weak_password':         return 'La contraseña tiene que tener al menos 8 caracteres.';
    case 'invalid_code':          return 'El link expiró o es inválido. Pedí uno nuevo.';
    case 'mp_not_configured':     return 'El pago con Mercado Pago no está habilitado todavía. Coordiná por WhatsApp.';
    case 'NETWORK_ERROR':         return 'No pudimos conectar. Revisá tu conexión.';
    case 'API_URL_NOT_CONFIGURED':return 'El servicio no está disponible. Comunicate con la secretaría.';
    case 'server_error':          return 'Error del servidor. Intentá de nuevo en un momento.';
    default:                      return 'Algo salió mal. Probá de nuevo.';
  }
}
