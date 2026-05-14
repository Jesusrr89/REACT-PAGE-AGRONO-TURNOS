import React, { useState, useEffect, useRef } from 'react';
import {
  sanitizeText,
  isValidEmail,
  isValidPhone,
  isValidName,
  canSubmit
} from './utils/security.js';
import {
  loginUser,
  logoutUser,
  requestPasswordReset,
  refreshSession,
  createPayment,
  confirmPayment,
  sortCuotasDesc,
  buildWhatsappLink,
  buildCartWhatsappLink,
  describeError
} from './utils/api.js';
import { supabase, initialAuthIntent } from './utils/supabase.js';

// ============================================================
// LOGO del club (imagen real)
// ============================================================
function Logo({ className }) {
  return <img src="/media/logo.jpeg" alt="Escudo Agronomía Central" className={className} loading="eager" />;
}

// ============================================================
// NAVBAR
// ============================================================
function Navbar({ onLoginClick, onAdminClick, loggedUser, onLogout }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Landing reducida a una sola pantalla (Hero). El menú se queda solo con
  // el ancla a Inicio + los CTAs de auth.
  const links = [
    { href: '#inicio', label: 'Inicio' }
  ];

  const close = () => setMenuOpen(false);

  const handleLoginClick = () => {
    close();
    onLoginClick();
  };
  const handleAdminClick = () => {
    close();
    onAdminClick();
  };

  return (
    <header className={'navbar ' + (scrolled ? 'navbar--scrolled' : '')}>
      <div className="navbar__inner container">
        <a href="#inicio" className="navbar__brand" aria-label="Agronomía Central Inicio">
          <span className="navbar__shield" aria-hidden="true">
            <Logo className="navbar__logo-img" />
          </span>
          <span className="navbar__brand-text">
            <strong>Agronomía</strong>
            <span>Central</span>
          </span>
        </a>

        <nav className={'navbar__nav ' + (menuOpen ? 'navbar__nav--open' : '')}>
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={close}>{l.label}</a>
              </li>
            ))}
          </ul>

          {loggedUser ? (
            <div className="navbar__user">
              <span className="navbar__user-name">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z"/>
                </svg>
                {loggedUser.nombre.split(' ')[0]}
              </span>
              <button type="button" className="navbar__logout" onClick={() => { close(); onLogout(); }}>
                Salir
              </button>
            </div>
          ) : (
            <div className="navbar__auth">
              <button type="button" className="navbar__cta-jugador" onClick={handleLoginClick}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>
                </svg>
                <span>Jugador</span>
              </button>
              <button type="button" className="navbar__cta-admin" onClick={handleAdminClick}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 1l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
                </svg>
                <span>CSM Admin</span>
              </button>
            </div>
          )}
        </nav>

        <button
          type="button"
          className={'navbar__burger ' + (menuOpen ? 'navbar__burger--open' : '')}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
        >
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>
  );
}

// ============================================================
// LOGIN MODAL
// ============================================================
function LoginModal({ open, onClose, onLogin, onSwitchToReset }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEmail(''); setPass(''); setError(''); setSubmitting(false);
    }
  }, [open]);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Rate limit client-side (el server tiene su propio rate limit más estricto)
    if (!canSubmit('login', 2000)) {
      setError('Esperá un momento antes de reintentar.');
      return;
    }

    const emailClean = sanitizeText(email).toLowerCase().trim();
    const passClean = pass.trim();

    if (!emailClean || !passClean) {
      setError('Completá email y contraseña.');
      return;
    }

    if (emailClean.length > 120 || passClean.length > 100) {
      setError('Datos inválidos.');
      return;
    }

    if (!isValidEmail(emailClean)) {
      setError('Ingresá un email válido.');
      return;
    }

    setSubmitting(true);

    const res = await loginUser(emailClean, passClean);

    if (res && res.ok) {
      onLogin(res);
    } else {
      setError(describeError(res && res.error));
      setSubmitting(false);
    }
  };

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="loginTitle">
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <div className="modal__header">
          <img src="/media/logo.jpeg" alt="AC" className="modal__logo" />
          <h2 id="loginTitle">Portal del Socio</h2>
          <p>Ingresá para ver tu estado de cuenta y mensualidades.</p>
        </div>

        <form className="modal__form" onSubmit={handleSubmit} noValidate>
          <div className="modal__field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              autoComplete="email"
              placeholder="tu@email.com"
              autoFocus
            />
          </div>

          <div className="modal__field">
            <label htmlFor="login-pass">Contraseña</label>
            <input
              id="login-pass"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              maxLength={100}
              autoComplete="current-password"
              placeholder="••••••"
            />
          </div>

          {error && <div className="modal__error">{error}</div>}

          <button type="submit" className="modal__submit" disabled={submitting}>
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </button>

          <p className="modal__disclaimer">
            ¿Olvidaste tu contraseña?{' '}
            <button type="button" className="modal__inline-link" onClick={onSwitchToReset}>
              Restablecela acá
            </button>
          </p>

          <p className="modal__disclaimer">
            ¿Todavía no tenés cuenta? Comunicate con la secretaría del club.
          </p>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// SET PASSWORD MODAL — para socios que vienen por link de invite o recovery
// ============================================================
function SetPasswordModal({ open, intent, onSuccess }) {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!pass || pass.length < 8) {
      setError('La contraseña tiene que tener al menos 8 caracteres.');
      return;
    }
    if (pass !== pass2) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password: pass });
    if (err) {
      setError(err.message || 'No pudimos guardar la contraseña. Pedí un nuevo link.');
      setSubmitting(false);
      return;
    }
    onSuccess();
  };

  const titulo = intent === 'recovery' ? 'Restablecé tu contraseña' : '¡Bienvenido al club!';
  const sub = intent === 'recovery'
    ? 'Elegí una nueva contraseña para entrar al portal.'
    : 'Para terminar tu alta, elegí una contraseña que vas a usar para entrar al portal.';

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="setPassTitle">
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <img src="/media/logo.jpeg" alt="AC" className="modal__logo" />
          <h2 id="setPassTitle">{titulo}</h2>
          <p>{sub}</p>
        </div>
        <form className="modal__form" onSubmit={handleSubmit} noValidate>
          <div className="modal__field">
            <label htmlFor="set-pass">Nueva contraseña</label>
            <input
              id="set-pass"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              maxLength={100}
              autoFocus
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="modal__field">
            <label htmlFor="set-pass2">Repetí la contraseña</label>
            <input
              id="set-pass2"
              type="password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              maxLength={100}
              autoComplete="new-password"
            />
          </div>
          {error && <div className="modal__error">{error}</div>}
          <button type="submit" className="modal__submit" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar y entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// RESET PASSWORD MODAL — pedir mail de recovery
// ============================================================
function ResetPasswordModal({ open, onClose, onSwitchToLogin }) {
  // Flujo Supabase: el usuario ingresa su mail -> le llega un LINK al mail
  // (no un código). Al clickear el link vuelve al sitio con ?type=recovery y
  // se abre SetPasswordModal automáticamente (manejado vía initialAuthIntent).
  // Acá solo pedimos el mail y mostramos confirmación.
  const [step, setStep] = useState('request'); // request | sent
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  useEffect(() => {
    if (!open) {
      setStep('request'); setEmail(''); setError(''); setInfo(''); setSubmitting(false);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleRequest = async (e) => {
    e.preventDefault();
    setError('');
    if (!canSubmit('reset', 3000)) { setError('Esperá un momento antes de reintentar.'); return; }
    const emailClean = sanitizeText(email).toLowerCase().trim();
    if (!isValidEmail(emailClean)) { setError('Ingresá un email válido.'); return; }

    setSubmitting(true);
    const res = await requestPasswordReset(emailClean);
    setSubmitting(false);
    if (res && res.ok) {
      setEmail(emailClean);
      setInfo(res.message || 'Si el email está registrado, te llegará un link en unos minutos. Abrilo desde el mismo dispositivo donde querés ingresar.');
      setStep('sent');
    } else {
      setError(describeError(res && res.error));
    }
  };

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="resetTitle">
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        {step === 'sent' ? (
          <div className="modal__success">
            <div className="modal__success-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M22 6 12 13 2 6"/><path d="M2 6h20v12H2z"/>
              </svg>
            </div>
            <h3>Revisá tu mail</h3>
            <p>{info}</p>
            <p className="modal__disclaimer">Si no te llega en 5 minutos, revisá la carpeta de spam o probá de nuevo.</p>
            <button type="button" className="modal__submit" onClick={onSwitchToLogin}>Volver a ingresar</button>
          </div>
        ) : (
          <>
            <div className="modal__header">
              <img src="/media/logo.jpeg" alt="AC" className="modal__logo" />
              <h2 id="resetTitle">Restablecer contraseña</h2>
              <p>Ingresá tu email y te mandamos un link para crear una contraseña nueva.</p>
            </div>

            <form className="modal__form" onSubmit={handleRequest} noValidate>
              <div className="modal__field">
                <label htmlFor="reset-email">Email</label>
                <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  maxLength={120} autoComplete="email" autoFocus />
              </div>
              {error && <div className="modal__error">{error}</div>}
              <button type="submit" className="modal__submit" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviarme el link'}
              </button>
              <div className="modal__switch">
                ¿Te acordaste?{' '}
                <button type="button" onClick={onSwitchToLogin}>Volver a ingresar</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}


// ============================================================
// PORTAL DEL SOCIO — versión 2 (interactiva, con carrito + MP)
// ============================================================
const fmtARS = (n) => Number(n || 0).toLocaleString('es-AR');
const cuotaKey = (c) => c.mes + '|' + c.anio;
const MES_ABBR = {
  Enero: 'Ene', Febrero: 'Feb', Marzo: 'Mar', Abril: 'Abr', Mayo: 'May', Junio: 'Jun',
  Julio: 'Jul', Agosto: 'Ago', Septiembre: 'Sep', Octubre: 'Oct', Noviembre: 'Nov', Diciembre: 'Dic'
};

// ============================================================
// Categorías del club — agrupadas. Se usan en alta/edición de socio
// y en el formulario público "Sumate".
// ============================================================
const CATEGORIA_GRUPOS = [
  { grupo: 'Formativa mixta', items: [
    'Formativa mixta 2013', 'Formativa mixta 2014', 'Formativa mixta 2015',
    'Formativa mixta 2016/17', 'Formativa mixta 2018/19',
  ] },
  { grupo: 'Baby color', items: ['Baby color 2010/11', 'Baby color 2013'] },
  { grupo: 'Baby letra', items: ['Baby letra 2010/11', 'Baby letra 2013'] },
  { grupo: 'Jardincito', items: ['Jardincito'] },
  { grupo: 'Promo', items: ['Promo 2015', 'Promo 2016', 'Promo 2017', 'Promo 2018'] },
  { grupo: 'Promo de honor', items: [
    'Promo de honor 8va', 'Promo de honor 7ma', 'Promo de honor 6ta', 'Promo de honor 5ta',
    'Promo de honor 4ta', 'Promo de honor 3ra', 'Promo de honor 1ra',
  ] },
  { grupo: 'Zona de honor', items: [
    'Zona de honor 8va', 'Zona de honor 7ma', 'Zona de honor 6ta', 'Zona de honor 5ta',
    'Zona de honor 4ta', 'Zona de honor 3ra', 'Zona de honor 1ra',
  ] },
  { grupo: 'Liga B', items: [
    'Liga B 8va', 'Liga B 7ma', 'Liga B 6ta', 'Liga B 5ta', 'Liga B 4ta', 'Liga B 3ra', 'Liga B 1ra',
  ] },
  { grupo: 'Liga C', items: ['Liga C 5ta', 'Liga C 4ta', 'Liga C 3ra', 'Liga C 1ra'] },
  { grupo: 'Proyección futsal', items: [
    'Proyección futsal 2012/2013', 'Proyección futsal 2014', 'Proyección futsal 2015',
    'Proyección futsal 2016', 'Proyección futsal 2017', 'Proyección futsal 2018/2019',
  ] },
];
const CATEGORIAS_FLAT = CATEGORIA_GRUPOS.flatMap((g) => g.items);

// ============================================================
// Modo demo — con ?demo=1 en la URL, el panel admin se llena con datos
// generados en el navegador (no toca Supabase). Útil para mostrar el sistema.
// ============================================================
const DEMO_MODE = typeof window !== 'undefined' && /[?&]demo=1\b/.test(window.location.search);
const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.');
const DEMO_NOMBRES = ['Juan','Mateo','Lucas','Benjamín','Thiago','Santiago','Tomás','Bautista','Felipe','Joaquín','Valentino','Lautaro','Martina','Catalina','Emma','Mía','Olivia','Valentina','Isabella','Renata','Victoria','Sofía','Camila','Julieta','Lola','Bruno','Ramiro','Iván','Nicolás','Agustín','Franco','Diego','Gonzalo','Ezequiel','Federico','Ignacio','Maximiliano','Ariana','Delfina','Guadalupe'];
const DEMO_APELLIDOS = ['Gómez','Rodríguez','Fernández','López','Martínez','García','Pérez','Sánchez','Romero','Sosa','Álvarez','Torres','Ruiz','Díaz','Acosta','Benítez','Medina','Suárez','Herrera','Aguirre','Giménez','Molina','Silva','Castro','Rojas','Ortiz','Núñez','Luna','Cabrera','Ramos','Ferreyra','Domínguez','Vega','Ríos','Morales','Godoy','Vera','Quiroga','Ojeda','Peralta'];

function buildDemoSocios(n = 150) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const nombre = _pick(DEMO_NOMBRES) + ' ' + _pick(DEMO_APELLIDOS);
    const activo = Math.random() > 0.1;
    const adeuda = activo && Math.random() > 0.5 ? _pick([15000, 30000, 45000, 18000, 33000, 12000]) : 0;
    const numSocio = 'AC-' + String(1001 + i);
    out.push({
      socio_id: numSocio,
      numero_socio: numSocio,
      profile_id: 'demo-' + i,
      nombre,
      email: _slug(nombre) + (i + 1) + '@mail.com',
      dni: String(18000000 + Math.floor(Math.random() * 27000000)),
      dorsal: Math.random() > 0.45 ? String(1 + Math.floor(Math.random() * 99)) : '',
      categoria: CATEGORIAS_FLAT[i % CATEGORIAS_FLAT.length],
      telefono: '11' + String(30000000 + Math.floor(Math.random() * 69999999)),
      cuota_monto: Math.random() > 0.7 ? _pick([8000, 12000, 18000, 20000, 25000]) : null,
      cuota_pausada: Math.random() > 0.92,
      estado: activo ? 'activo' : 'desactivado',
      adeuda,
      ultPago: Math.random() > 0.25 ? new Date(Date.now() - Math.floor(Math.random() * 120) * 86400000).toLocaleDateString('es-AR') : '—',
    });
  }
  return out;
}
function buildDemoPagos(socios, n = 60) {
  const metodos = ['mp', 'transferencia', 'efectivo', 'debito', 'manual'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = _pick(socios);
    const d = new Date(Date.now() - Math.floor(Math.random() * 90) * 86400000 - Math.floor(Math.random() * 86400000));
    out.push({
      id: 'demo-pago-' + i,
      fecha: d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
      fecha_iso: d.toISOString(),
      socio_id: s.socio_id,
      socio: s.nombre,
      monto: _pick([15000, 30000, 45000, 12000, 18000, 25000]),
      metodo: _pick(metodos),
      estado: Math.random() > 0.1 ? 'confirmado' : 'anulado',
      ref: 'demo-' + Math.floor(Math.random() * 1e6),
    });
  }
  return out.sort((a, b) => b.fecha_iso.localeCompare(a.fecha_iso));
}
function buildDemoCuotas(socio) {
  const now = new Date();
  const base = socio.cuota_monto != null ? socio.cuota_monto : 15000;
  const out = [];
  for (let k = 0; k < 6; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const pagada = k > 1 || socio.adeuda === 0;
    const monto = base;
    const monto_pagado = pagada ? monto : (Math.random() > 0.6 ? Math.floor(monto / 2) : 0);
    out.push({
      id: 'demo-c-' + socio.profile_id + '-' + k,
      mes: d.getMonth() + 1, anio: d.getFullYear(),
      monto, monto_pagado, recargo: 0,
      total_a_cobrar: monto, saldo: Math.max(monto - monto_pagado, 0),
      estado: monto_pagado >= monto ? 'pagado' : monto_pagado > 0 ? 'parcial' : 'pendiente',
      fecha_pago: monto_pagado >= monto ? d.toISOString().slice(0, 10) : null,
      fecha_vencimiento: new Date(d.getFullYear(), d.getMonth(), 10).toISOString().slice(0, 10),
    });
  }
  return out;
}

// <select> reutilizable con las categorías agrupadas. Si el socio tiene una
// categoría vieja que ya no está en la lista, la agregamos como opción suelta
// para no perderla.
function CategoriaSelect({ name = 'categoria', value = '', onChange, includeEmpty = false, className, id }) {
  const legacy = value && !CATEGORIAS_FLAT.includes(value);
  return (
    <select id={id} name={name} value={value} onChange={onChange} className={className}>
      {includeEmpty && <option value="">Seleccionar…</option>}
      {legacy && <option value={value}>{value} (actual)</option>}
      {CATEGORIA_GRUPOS.map((g) => (
        <optgroup key={g.grupo} label={g.grupo}>
          {g.items.map((it) => <option key={it} value={it}>{it}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function WhatsappIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.463 3.488z"/>
    </svg>
  );
}

function StatCard({ icon, label, value, accent, hint }) {
  return (
    <div className={'portal-stat' + (accent ? ' portal-stat--' + accent : '')}>
      <div className="portal-stat__icon" aria-hidden="true">{icon}</div>
      <div className="portal-stat__body">
        <span className="portal-stat__label">{label}</span>
        <strong className="portal-stat__value">{value}</strong>
        {hint && <span className="portal-stat__hint">{hint}</span>}
      </div>
    </div>
  );
}

function PaymentBanner({ status, onClose }) {
  if (!status) return null;
  const variants = {
    verificando: {
      title: 'Verificando tu pago…',
      msg: 'Estamos consultando con Mercado Pago. Esto suele tardar unos segundos, no cierres esta página.',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="portal-banner__spinner"><path d="M21 12a9 9 0 1 1-6.22-8.55"/></svg>
    },
    ok: {
      title: '¡Pago recibido y acreditado!',
      msg: 'Mercado Pago confirmó tu pago y ya se aplicó a tus cuotas. Podés ver el detalle actualizado abajo.',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg>
    },
    pendiente: {
      title: 'Pago pendiente de acreditación',
      msg: 'MP recibió tu pago pero todavía no lo aprobó. En cuanto se acredite vas a ver el cambio reflejado — refrescá esta página en unos minutos.',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/></svg>
    },
    error: {
      title: 'No pudimos procesar el pago',
      msg: 'MP rechazó la operación o el pago se canceló. Volvé a intentarlo o coordiná por WhatsApp con la secretaría.',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
    }
  };
  const v = variants[status] || variants.pendiente;
  return (
    <div className={'portal-banner portal-banner--' + status} role="status">
      <div className="portal-banner__icon">{v.icon}</div>
      <div className="portal-banner__body">
        <strong>{v.title}</strong>
        <p>{v.msg}</p>
      </div>
      {status !== 'verificando' && (
        <button type="button" className="portal-banner__close" onClick={onClose} aria-label="Cerrar aviso">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function PortalSocio({ user, cuotas, config, token, onSessionUpdate }) {
  const cuotasOrdenadas = sortCuotasDesc(cuotas);
  // "deudoras" = cuotas que tienen saldo (pendientes + parciales)
  const deudoras = cuotasOrdenadas.filter((c) => c.estado !== 'pagado');
  const cuotaPendienteMasVieja = deudoras[deudoras.length - 1] || null;
  const saldoOf = (c) => Number(c.saldo != null ? c.saldo : c.monto - (c.monto_pagado || 0)) || 0;
  const totalAdeudado = deudoras.reduce((s, c) => s + saldoOf(c), 0);

  // Stats por año actual
  const currentYear = new Date().getFullYear();
  const cuotasAnio = cuotasOrdenadas.filter((c) => Number(c.anio) === currentYear);
  const pagadasAnio = cuotasAnio.filter((c) => c.estado === 'pagado');
  const totalPagadoAnio = cuotasAnio.reduce((s, c) => s + Number(c.monto_pagado || 0), 0);
  const progresoAnio = cuotasAnio.length > 0
    ? Math.round((pagadasAnio.length / cuotasAnio.length) * 100)
    : 0;

  // Antigüedad del socio (meses desde fecha_alta)
  const antiguedadMeses = (() => {
    if (!user.fecha_alta) return null;
    const alta = new Date(user.fecha_alta);
    if (isNaN(alta.getTime())) return null;
    const now = new Date();
    return (now.getFullYear() - alta.getFullYear()) * 12 + (now.getMonth() - alta.getMonth());
  })();

  // Carrito
  const [cart, setCart] = useState(() => new Set());
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const cartItems = deudoras.filter((c) => cart.has(cuotaKey(c)));
  const cartTotal = cartItems.reduce((s, c) => s + saldoOf(c), 0);

  const toggleCart = (cuota) => {
    const k = cuotaKey(cuota);
    setCart((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
    setPaymentError('');
  };
  const selectAllPending = () => {
    setCart(new Set(deudoras.map(cuotaKey)));
    setPaymentError('');
  };
  const clearCart = () => { setCart(new Set()); setPaymentError(''); };

  const mpEnabled = !!config.mp_enabled;
  const cartWhatsapp = buildCartWhatsappLink(config, user, cartItems);
  const generalWhatsapp = buildWhatsappLink(config, user, cuotaPendienteMasVieja);

  const handleMPPayment = async () => {
    if (cartItems.length === 0) { setPaymentError('Seleccioná al menos una cuota.'); return; }
    setPaying(true);
    setPaymentError('');
    // Mandamos cuota_id para que el backend matchee preciso (no por mes+anio)
    const items = cartItems.map((c) => ({ cuota_id: c.cuota_id, mes: c.mes, anio: c.anio }));
    const res = await createPayment(token, items);
    if (res && res.ok && res.init_point) {
      // Defensa en profundidad: validamos que el init_point efectivamente
      // apunte a un dominio de Mercado Pago antes de redirigir, así si
      // alguna vez la respuesta de MP se manipula no terminamos llevando
      // al usuario a un sitio arbitrario.
      const init = String(res.init_point);
      if (!/^https:\/\/(www\.)?mercadopago\.[a-z.]+\//i.test(init)) {
        setPaymentError('Mercado Pago devolvió una URL inesperada. Reintentá o coordiná por WhatsApp.');
        setPaying(false);
        return;
      }
      // Guardamos el preference_id + timestamp para poder validar al volver
      // de MP que el banner de éxito corresponde a un pago que ESTE usuario
      // efectivamente inició en esta sesión. Sin esto, alguien podría
      // mandarle un link `?pago=ok&preference_id=...` a la víctima y mostrarle
      // un banner falso (phishing intra-sitio).
      try {
        sessionStorage.setItem('ac_pending_pref', JSON.stringify({
          pref: res.preference_id,
          createdAt: Date.now()
        }));
      } catch (e) {}
      window.location.href = init;
      return;
    }
    setPaymentError(describeError(res && res.error));
    setPaying(false);
  };

  // Filtros del historial
  const [filter, setFilter] = useState('todas'); // todas | con_saldo | pagado
  const [yearFilter, setYearFilter] = useState('todos');
  const yearsAvailable = Array.from(new Set(cuotasOrdenadas.map((c) => Number(c.anio))))
    .filter(Boolean).sort((a, b) => b - a);

  let cuotasFiltradas = cuotasOrdenadas;
  if (filter === 'con_saldo') cuotasFiltradas = cuotasFiltradas.filter((c) => c.estado !== 'pagado');
  else if (filter === 'pagado') cuotasFiltradas = cuotasFiltradas.filter((c) => c.estado === 'pagado');
  if (yearFilter !== 'todos') cuotasFiltradas = cuotasFiltradas.filter((c) => Number(c.anio) === Number(yearFilter));

  // Banner de retorno desde MP. Si pago=ok y trae preference_id, llamamos a
  // confirmPayment para que el backend verifique server-to-server con MP y
  // actualice las cuotas. Refrescamos la sesión con la respuesta.
  const [bannerStatus, setBannerStatus] = useState(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const pago = params.get('pago');
    if (!pago) return;

    // Limpiamos el query para que no quede pegado al recargar (independientemente
    // de si validamos o no — no queremos que la URL quede expuesta).
    const clean = window.location.pathname + '#portal';
    window.history.replaceState({}, '', clean);

    // Recuperamos el preference_id que iniciamos en esta sesión. Sin esto NO
    // mostramos banner — protege contra que alguien mande a la víctima un link
    // `?pago=ok` y le aparezca el banner falso.
    let initiated = null;
    try {
      const raw = sessionStorage.getItem('ac_pending_pref');
      if (raw) initiated = JSON.parse(raw);
    } catch (e) {}
    try { sessionStorage.removeItem('ac_pending_pref'); } catch (e) {}

    // El pref válido es SOLO el guardado en sessionStorage y dentro de los
    // últimos 30 min. El query param es solo para correlación visual.
    const fresh = initiated && initiated.pref && (Date.now() - (initiated.createdAt || 0)) < 30 * 60 * 1000;
    if (!fresh) {
      // Nada en sessionStorage: el usuario no inició un pago en esta pestaña.
      // Ignoramos los query params para evitar mostrar un banner spoofeable.
      return;
    }
    const pref = initiated.pref;

    if (pago === 'ok' && token) {
      setBannerStatus('verificando');
      confirmPayment(token, pref).then((res) => {
        if (!res || !res.ok) {
          setBannerStatus('error');
          return;
        }
        if (res.payment_status === 'approved') {
          if (res.session && onSessionUpdate) onSessionUpdate(res.session);
          setBannerStatus('ok');
          setCart(new Set()); // vaciamos el carrito porque las cuotas se aplicaron
        } else if (res.payment_status === 'pending') {
          if (res.session && onSessionUpdate) onSessionUpdate(res.session);
          setBannerStatus('pendiente');
        } else {
          setBannerStatus('error');
        }
      });
    } else if (pago === 'pendiente' || pago === 'error') {
      setBannerStatus(pago);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section id="portal" className="portal">
      <div className="container">
        {bannerStatus && (
          <PaymentBanner status={bannerStatus} onClose={() => setBannerStatus(null)} />
        )}

        <div className="portal__header reveal">
          <span className="section-eyebrow section-eyebrow--light">Portal del Socio</span>
          <h2 className="section-title section-title--light">
            Bienvenido, <span className="accent">{user.nombre.split(' ')[0]}</span>.
          </h2>
          <p className="section-subtitle section-subtitle--light">
            Acá podés ver tu estado de cuenta, pagar tus cuotas con Mercado Pago o coordinar con la secretaría.
          </p>
        </div>

        {/* === BANDA DE STATS === */}
        <div className="portal-stats reveal">
          <StatCard
            accent={user.estado === 'al_dia' ? 'ok' : 'warn'}
            label="Estado"
            value={user.estado === 'al_dia' ? 'Al día' : 'Con deuda'}
            hint={user.estado === 'al_dia' ? 'Sin cuotas pendientes' : deudoras.length + ' con saldo'}
            icon={user.estado === 'al_dia'
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            }
          />
          <StatCard
            accent={totalAdeudado > 0 ? 'warn' : null}
            label="Total adeudado"
            value={'$' + fmtARS(totalAdeudado)}
            hint={deudoras.length === 0 ? '¡Felicitaciones!' : 'Pagable desde el carrito'}
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
          />
          <StatCard
            label={'Pagado en ' + currentYear}
            value={'$' + fmtARS(totalPagadoAnio)}
            hint={pagadasAnio.length + ' de ' + (cuotasAnio.length || '—') + ' cuotas'}
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z"/><path d="M9 12l2 2 4-4"/></svg>}
          />
          <StatCard
            label="Próximo vencimiento"
            value={cuotaPendienteMasVieja ? cuotaPendienteMasVieja.mes : '—'}
            hint={cuotaPendienteMasVieja ? cuotaPendienteMasVieja.anio + ' · $' + fmtARS(cuotaPendienteMasVieja.monto) : 'Sin pendientes'}
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
          />
        </div>

        {/* === LAYOUT 2 COLUMNAS === */}
        <div className="portal-layout">

          {/* Sidebar: carnet + acciones */}
          <aside className="portal-layout__side">
            <div className="portal__card portal__card--id reveal">
              <div className="portal__card-top">
                <img src="/media/logo.jpeg" alt="AC" className="portal__card-logo" />
                <div className="portal__card-label">
                  Carnet Digital
                  {antiguedadMeses != null && antiguedadMeses < 3 && (
                    <span className="portal__card-badge">Nuevo</span>
                  )}
                </div>
              </div>
              <div className="portal__card-body">
                <span className="portal__card-kicker">
                  {user.socio_id ? user.socio_id + ' · Jugador' : 'Jugador'}
                </span>
                <h3>{user.nombre}</h3>
                <div className="portal__card-data">
                  {user.dorsal && <div><span>Dorsal</span><strong>#{user.dorsal}</strong></div>}
                  {user.categoria && <div><span>Categoría</span><strong>{user.categoria}</strong></div>}
                  {user.fecha_alta && (
                    <div>
                      <span>Socio desde</span>
                      <strong>
                        {new Date(user.fecha_alta).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })}
                        {antiguedadMeses != null && antiguedadMeses >= 3 && (
                          <em style={{ fontStyle: 'normal', opacity: 0.6, fontSize: '0.78rem', marginLeft: 6 }}>
                            ({antiguedadMeses < 12 ? antiguedadMeses + ' meses' : Math.floor(antiguedadMeses / 12) + ' año(s)'})
                          </em>
                        )}
                      </strong>
                    </div>
                  )}
                  <div>
                    <span>Estado</span>
                    <strong className={'portal__status portal__status--' + user.estado}>
                      {user.estado === 'al_dia' ? '● Al día' : '● Con deuda'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="portal-actions reveal">
              <h4 className="portal-actions__title">Acciones rápidas</h4>
              {generalWhatsapp && (
                <a href={generalWhatsapp} target="_blank" rel="noopener noreferrer" className="portal-actions__btn portal-actions__btn--wa">
                  <WhatsappIcon size={20} />
                  <div>
                    <strong>WhatsApp con secretaría</strong>
                    <span>Mensaje pre-armado con tu consulta</span>
                  </div>
                </a>
              )}
              {config.telefono_secretaria && (
                <a href={'tel:' + String(config.telefono_secretaria).replace(/[^\d+]/g, '')} className="portal-actions__btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <div>
                    <strong>Llamar al club</strong>
                    <span>{config.telefono_secretaria}</span>
                  </div>
                </a>
              )}
              <a href="#pagos" className="portal-actions__btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/>
                </svg>
                <div>
                  <strong>Otros métodos de pago</strong>
                  <span>Transferencia, efectivo, débito</span>
                </div>
              </a>
            </div>
          </aside>

          {/* Main: carrito + historial */}
          <div className="portal-layout__main">

            {/* CARRITO */}
            <div className="portal-cart reveal">
              <div className="portal-cart__head">
                <div>
                  <span className="portal-cart__kicker">Carrito de pago</span>
                  <h3>Pagá tus cuotas en un click</h3>
                </div>
                <div className="portal-cart__head-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 0 1-8 0"/>
                  </svg>
                </div>
              </div>

              {deudoras.length === 0 ? (
                <div className="portal-cart__empty">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                  <p><strong>¡No tenés cuotas pendientes!</strong></p>
                  <p>Estás 100% al día con la mensualidad del club.</p>
                </div>
              ) : (
                <>
                  <div className="portal-cart__toolbar">
                    <span>{deudoras.length} cuota(s) con saldo</span>
                    <div>
                      <button type="button" className="portal-cart__link" onClick={selectAllPending} disabled={cart.size === deudoras.length}>
                        Seleccionar todas
                      </button>
                      {cart.size > 0 && (
                        <button type="button" className="portal-cart__link" onClick={clearCart}>
                          Vaciar
                        </button>
                      )}
                    </div>
                  </div>

                  <ul className="portal-cart__list">
                    {deudoras.map((c) => {
                      const k = cuotaKey(c);
                      const checked = cart.has(k);
                      const sld = saldoOf(c);
                      const esParcial = c.estado === 'parcial';
                      const recargo = Number(c.recargo || 0);
                      const tagText = esParcial
                        ? `Saldo de $${fmtARS(c.monto + recargo)} (pagaste $${fmtARS(c.monto_pagado || 0)})`
                        : recargo > 0
                          ? `Cuota vencida — incluye $${fmtARS(recargo)} de recargo por mora`
                          : 'Cuota mensual';
                      return (
                        <li key={k} className={'portal-cart__item' + (checked ? ' is-checked' : '') + (esParcial ? ' is-parcial' : '') + (recargo > 0 ? ' has-recargo' : '')}>
                          <label className="portal-cart__check">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCart(c)}
                              aria-label={'Seleccionar cuota ' + c.mes + ' ' + c.anio}
                            />
                            <span className="portal-cart__check-box" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                <path d="M20 6 9 17l-5-5"/>
                              </svg>
                            </span>
                          </label>
                          <div className="portal-cart__item-info">
                            <strong>
                              {c.mes} <span>{c.anio}</span>
                              {recargo > 0 && <em className="portal-cart__item-badge">+ recargo</em>}
                            </strong>
                            <span className="portal-cart__item-tag">{tagText}</span>
                          </div>
                          <div className="portal-cart__item-amount">${fmtARS(sld)}</div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="portal-cart__footer">
                    <div className="portal-cart__totals">
                      <span>{cart.size} seleccionada(s)</span>
                      <strong>${fmtARS(cartTotal)}</strong>
                    </div>

                    {paymentError && (
                      <div className="portal-cart__error">{paymentError}</div>
                    )}

                    <div className="portal-cart__actions">
                      {mpEnabled ? (
                        <button
                          type="button"
                          className="portal-cart__pay-btn"
                          disabled={cart.size === 0 || paying}
                          onClick={handleMPPayment}
                        >
                          {paying ? (
                            <>Redirigiendo a Mercado Pago…</>
                          ) : (
                            <>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M2 12c0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10S2 17.5 2 12zm14.6-3.5L11 14.1l-2.6-2.6L7 12.9l4 4 7-7-1.4-1.4z"/>
                              </svg>
                              <span>Pagar ${fmtARS(cartTotal)} con Mercado Pago</span>
                            </>
                          )}
                        </button>
                      ) : (
                        cartWhatsapp ? (
                          <a
                            href={cart.size > 0 ? cartWhatsapp : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={'portal-cart__pay-btn portal-cart__pay-btn--wa' + (cart.size === 0 ? ' is-disabled' : '')}
                            onClick={(e) => { if (cart.size === 0) e.preventDefault(); }}
                          >
                            <WhatsappIcon size={20} />
                            <span>Coordinar pago por WhatsApp</span>
                          </a>
                        ) : (
                          <a href="#pagos" className="portal-cart__pay-btn">
                            <span>Ver formas de pago</span>
                          </a>
                        )
                      )}

                      {mpEnabled && cartWhatsapp && (
                        <a
                          href={cart.size > 0 ? cartWhatsapp : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={'portal-cart__alt-btn' + (cart.size === 0 ? ' is-disabled' : '')}
                          onClick={(e) => { if (cart.size === 0) e.preventDefault(); }}
                        >
                          <WhatsappIcon size={16} />
                          <span>Prefiero coordinar por WhatsApp</span>
                        </a>
                      )}
                    </div>

                    {!mpEnabled && (
                      <p className="portal-cart__hint">
                        El pago directo con Mercado Pago todavía no está habilitado. Mientras tanto, coordiná con la secretaría o usá los métodos tradicionales.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* HISTORIAL CON FILTROS */}
            <div className="portal-history reveal">
              <div className="portal-history__head">
                <h3>Mi historial</h3>
                {cuotasAnio.length > 0 && (
                  <div className="portal-history__progress">
                    <div className="portal-history__progress-info">
                      <span>Año {currentYear}</span>
                      <strong>{pagadasAnio.length}/{cuotasAnio.length} pagadas</strong>
                    </div>
                    <div className="portal-history__progress-bar">
                      <div className="portal-history__progress-fill" style={{ width: progresoAnio + '%' }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="portal-history__filters">
                <div className="portal-history__filter-group" role="tablist" aria-label="Filtrar por estado">
                  {[
                    { k: 'todas',     label: 'Todas' },
                    { k: 'con_saldo', label: 'Con saldo' },
                    { k: 'pagado',    label: 'Pagadas' }
                  ].map((f) => (
                    <button
                      key={f.k}
                      type="button"
                      role="tab"
                      aria-selected={filter === f.k}
                      className={'portal-history__pill' + (filter === f.k ? ' is-active' : '')}
                      onClick={() => setFilter(f.k)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {yearsAvailable.length > 1 && (
                  <select
                    className="portal-history__year"
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    aria-label="Filtrar por año"
                  >
                    <option value="todos">Todos los años</option>
                    {yearsAvailable.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                )}
              </div>

              {cuotasFiltradas.length === 0 ? (
                <p className="portal__empty">No hay cuotas que coincidan con el filtro.</p>
              ) : (
                <ul className="portal-history__list">
                  {cuotasFiltradas.map((c, i) => {
                    const sld = saldoOf(c);
                    const recargo = Number(c.recargo || 0);
                    const totalCobrar = (Number(c.monto) || 0) + recargo;
                    const sub = c.estado === 'pagado'
                      ? (c.fecha_pago ? 'Pagado el ' + c.fecha_pago : 'Pagado')
                      : c.estado === 'parcial'
                        ? `Pagaste $${fmtARS(c.monto_pagado || 0)} de $${fmtARS(totalCobrar)}` + (recargo > 0 ? ` · incluye $${fmtARS(recargo)} de recargo` : '')
                        : recargo > 0
                          ? `Vencida · incluye $${fmtARS(recargo)} de recargo por mora`
                          : (c.fecha_vencimiento ? 'Vence el ' + c.fecha_vencimiento : 'Sin pagar');
                    const tagLabel = c.estado === 'pagado'
                      ? '✓ Pagado'
                      : c.estado === 'parcial'
                        ? '◐ Parcial'
                        : recargo > 0
                          ? '⚠ Con recargo'
                          : '! Pendiente';
                    const amountToShow = c.estado === 'parcial' ? sld : totalCobrar;
                    return (
                      <li key={i} className={'portal-history__row portal-history__row--' + c.estado + (recargo > 0 ? ' has-recargo' : '')}>
                        <div className="portal-history__row-month" aria-hidden="true">
                          <span>{MES_ABBR[c.mes] || c.mes.slice(0, 3)}</span>
                          <strong>{c.anio}</strong>
                        </div>
                        <div className="portal-history__row-info">
                          <strong>{c.mes} {c.anio}</strong>
                          <span>{sub}</span>
                        </div>
                        <div className="portal-history__row-amount">
                          <strong>${fmtARS(amountToShow)}</strong>
                          <span className={'portal__tag portal__tag--' + c.estado}>{tagLabel}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Métodos de pago tradicionales (sin cambios) */}
      <PaymentMethods config={config} />
    </section>
  );
}

// ============================================================
// MÉTODOS DE PAGO
// ============================================================
function PaymentMethods({ config = {} }) {
  const [copied, setCopied] = useState(null);

  const copy = (text, label) => {
    if (!text || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  };

  const titular = config.titular || 'Club S. y D. Agronomía Central';
  const cuit = config.cuit || '—';
  const cbu = config.cbu || '—';
  const alias = config.alias || '—';
  const mpAlias = config.mp_alias || '—';
  // Solo aceptamos un mp_link si es HTTPS — defensa contra que alguien
  // ponga "javascript:..." en hoja Config y dispare XSS al renderizar el href.
  const rawMpLink = String(config.mp_link || '');
  const mpLink = /^https:\/\//i.test(rawMpLink) ? rawMpLink : '';
  const direccion = config.direccion_pago || 'Bauness 958';
  const horario = config.horario_pago || 'Lun a Vie 18 a 22 hs · Sábados 10 a 14 hs';
  const diaDebito = config.dia_debito || 'Los 5 de cada mes';
  const telSecretaria = config.telefono_secretaria || '+541145242225';
  const telSecretariaHref = 'tel:' + telSecretaria.replace(/[^\d+]/g, '');

  return (
    <div id="pagos" className="pay container">
      <div className="pay__header reveal">
        <span className="section-eyebrow section-eyebrow--light">Formas de pago</span>
        <h3 className="section-title section-title--light">
          Pagá tu <span className="accent">mensualidad</span>.
        </h3>
        <p className="section-subtitle section-subtitle--light">
          Elegí el método que te resulte más cómodo. Todos los pagos se acreditan automáticamente en tu cuenta.
        </p>
      </div>

      <div className="pay__grid">
        {/* Transferencia */}
        <article className="pay__card reveal">
          <div className="pay__card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <path d="M2 10h20M6 15h4"/>
            </svg>
          </div>
          <h4>Transferencia bancaria</h4>
          <p>Transferí desde tu banco o billetera virtual.</p>
          <div className="pay__data">
            <div className="pay__data-row">
              <span>Titular</span>
              <strong>{titular}</strong>
            </div>
            <div className="pay__data-row">
              <span>CUIT</span>
              <strong>{cuit}</strong>
            </div>
            <div className="pay__data-row pay__data-row--copy">
              <div>
                <span>CBU</span>
                <strong>{cbu}</strong>
              </div>
              <button type="button" onClick={() => copy(cbu, 'cbu')}>
                {copied === 'cbu' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <div className="pay__data-row pay__data-row--copy">
              <div>
                <span>Alias</span>
                <strong>{alias}</strong>
              </div>
              <button type="button" onClick={() => copy(alias, 'alias')}>
                {copied === 'alias' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        </article>

        {/* Mercado Pago */}
        <article className="pay__card pay__card--highlighted reveal">
          <div className="pay__card-icon pay__card-icon--mp">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z"/>
            </svg>
          </div>
          <div className="pay__badge">Recomendado</div>
          <h4>Mercado Pago</h4>
          <p>Pagá con tarjeta, dinero en cuenta o QR desde la app.</p>
          <div className="pay__data">
            <div className="pay__data-row pay__data-row--copy">
              <div>
                <span>Alias</span>
                <strong>{mpAlias}</strong>
              </div>
              <button type="button" onClick={() => copy(mpAlias, 'mp')}>
                {copied === 'mp' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
          {mpLink ? (
            <a href={mpLink} target="_blank" rel="noopener noreferrer" className="pay__btn">
              Pagar con Mercado Pago
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M7 17 17 7M7 7h10v10"/>
              </svg>
            </a>
          ) : (
            <span className="pay__hint">Pegá el alias en tu app de Mercado Pago.</span>
          )}
        </article>

        {/* Efectivo en el club */}
        <article className="pay__card reveal">
          <div className="pay__card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <circle cx="12" cy="12" r="3"/>
              <path d="M6 12h.01M18 12h.01"/>
            </svg>
          </div>
          <h4>Efectivo en el club</h4>
          <p>Acercate a la secretaría del club en horario de atención.</p>
          <div className="pay__data">
            <div className="pay__data-row">
              <span>Dirección</span>
              <strong>{direccion}</strong>
            </div>
            <div className="pay__data-row">
              <span>Horario</span>
              <strong>{horario}</strong>
            </div>
          </div>
        </article>

        {/* Débito automático */}
        <article className="pay__card reveal">
          <div className="pay__card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
              <path d="M12 7v5l3 2"/>
            </svg>
          </div>
          <h4>Débito automático</h4>
          <p>Despreocupate cada mes. Se debita de tu tarjeta o CBU.</p>
          <div className="pay__data">
            <div className="pay__data-row">
              <span>Adhesión</span>
              <strong>En secretaría</strong>
            </div>
            <div className="pay__data-row">
              <span>Día de débito</span>
              <strong>{diaDebito}</strong>
            </div>
          </div>
          <a href={telSecretariaHref} className="pay__btn pay__btn--ghost">
            Solicitar por teléfono
          </a>
        </article>
      </div>
    </div>
  );
}

// ============================================================
// PORTAL ADMIN — vista para la secretaría / dirigentes del club
// ============================================================
const ADMIN_CONFIG_DEFAULT = {
  cuota_monto_base: '15000',
  cuota_dia_vencimiento: '10',
  recargo_monto: '3000',
  recargo_dias_post_vencimiento: '60',
  auto_generar_cuotas: 'si',
  cbu: '0110012345678901234567',
  alias: 'AGRONOMIA.CENTRAL.AC',
  cuit: '30-12345678-9',
  mp_alias: 'agronomiacentral.mp',
  mp_link: '',
  whatsapp: '541145242225',
  telefono_secretaria: '+541145242225',
  notification_email: 'secretaria@agronomiacentral.com.ar',
  direccion_pago: 'Bauness 958',
  horario_pago: 'Lun a Vie 18 a 22 hs · Sábados 10 a 14 hs',
  dia_debito: 'Los 5 de cada mes',
  site_url: 'https://agronomiacentral.com.ar'
};

// Convierte filas a CSV y dispara la descarga del archivo
function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v == null ? '' : v);
    if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))
  ];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function PortalAdmin({ onLogout }) {
  const [tab, setTab] = useState('resumen');
  const [socios, setSocios] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [config, setConfig] = useState(ADMIN_CONFIG_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [filterCat, setFilterCat] = useState('todas');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [showNewModal, setShowNewModal] = useState(false);
  const [detalleSocio, setDetalleSocio] = useState(null);
  const [editSocio, setEditSocio] = useState(null);
  const [addCuotaFor, setAddCuotaFor] = useState(null);
  const [generandoCuotas, setGenerandoCuotas] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // profile_id de socios seleccionados (bulk)
  const [bulkMonto, setBulkMonto] = useState('');
  const [toast, setToast] = useState('');
  // Anti doble-click: cualquier writer admin pone busy=true y los botones
  // críticos se deshabilitan hasta que termine.
  const [busy, setBusy] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800); };
  // Mapea los errores típicos a algo legible. El resto pasa tal cual.
  const friendlyError = (err) => {
    const code = String(err?.message || err?.code || err || 'desconocido');
    if (code.includes('not_admin'))           return 'No tenés permisos de admin para hacer esto.';
    if (code.includes('no_pending'))          return 'Este socio no tiene cuotas pendientes.';
    if (code.includes('already_paid'))        return 'La cuota ya está totalmente pagada.';
    if (code.includes('already_anulled'))     return 'Este pago ya estaba anulado.';
    if (code.includes('cuota_not_found'))     return 'No encontré la cuota (puede que la hayan borrado).';
    if (code.includes('pago_not_found'))      return 'No encontré el pago (puede que lo hayan borrado).';
    if (code.includes('invalid_amount'))      return 'El monto tiene que ser mayor a 0.';
    if (code.includes('cuotas_socio_id_anio_mes_key')) return 'Ya existe una cuota para ese mes/año.';
    if (code.includes('profiles_dni_key'))    return 'Ya hay otro socio con ese DNI.';
    if (code.includes('profiles_numero_socio_key')) return 'Ya hay otro socio con ese número.';
    if (code.includes('JWT') || code.includes('jwt'))  return 'Tu sesión expiró. Refrescá la página y volvé a entrar.';
    if (code.includes('NetworkError') || code.includes('Failed to fetch')) return 'No pude conectar con el servidor. Revisá tu conexión.';
    return 'Error: ' + code;
  };
  // En modo demo no se persiste nada: los writers cortan acá.
  const demoGuard = () => { if (DEMO_MODE) { showToast('Modo demo — los cambios no se guardan en la base.'); return true; } return false; };

  // Carga inicial: socios + cuotas + pagos + config desde Supabase.
  // Las RLS policies tiran error si el usuario no es admin — eso lo capturamos
  // y mostramos un mensaje claro.
  const reloadAll = async () => {
    setLoading(true);
    setLoadError('');

    // Modo demo: datos generados en el navegador, sin tocar Supabase.
    if (DEMO_MODE) {
      const ds = buildDemoSocios(150);
      setSocios(ds);
      setPagos(buildDemoPagos(ds, 60));
      setConfig({ ...ADMIN_CONFIG_DEFAULT, cuota_monto_base: '15000', cuota_dia_vencimiento: '10', titular: 'Club S. y D. Agronomía Central (DEMO)' });
      setLoading(false);
      return;
    }

    const [profilesRes, cuotasRes, pagosRes, configRes] = await Promise.all([
      supabase.from('profiles').select('*').neq('role', 'admin').order('nombre'),
      supabase.from('cuotas').select('*'),
      supabase.from('pagos').select('*').order('fecha', { ascending: false }),
      supabase.from('config').select('key, value')
    ]);

    const firstErr = [profilesRes, cuotasRes, pagosRes, configRes].find((r) => r.error);
    if (firstErr) {
      setLoadError('No pudimos cargar los datos: ' + firstErr.error.message);
      setLoading(false);
      return;
    }

    // Index cuotas por socio para calcular adeuda y último pago.
    const cuotasBySocio = new Map();
    for (const c of cuotasRes.data || []) {
      if (!cuotasBySocio.has(c.socio_id)) cuotasBySocio.set(c.socio_id, []);
      cuotasBySocio.get(c.socio_id).push(c);
    }

    const sociosShaped = (profilesRes.data || []).map((p) => {
      const cs = cuotasBySocio.get(p.id) || [];
      const adeuda = cs.reduce((s, c) => s + Number(c.saldo || 0), 0);
      const fechasPago = cs.map((c) => c.fecha_pago).filter(Boolean).sort();
      const ultFecha = fechasPago[fechasPago.length - 1];
      return {
        socio_id: p.numero_socio || p.id.slice(0, 8),
        numero_socio: p.numero_socio || '',
        profile_id: p.id,
        nombre: p.nombre,
        email: p.email || '',
        dni: p.dni || '',
        dorsal: p.dorsal != null ? String(p.dorsal) : '',
        categoria: p.categoria || '',
        telefono: p.telefono || '',
        cuota_monto: p.cuota_monto != null ? Number(p.cuota_monto) : null,
        cuota_pausada: !!p.cuota_pausada,
        estado: p.estado,
        adeuda,
        ultPago: ultFecha ? new Date(ultFecha).toLocaleDateString('es-AR') : '—'
      };
    });
    setSocios(sociosShaped);

    // Pagos: enriquecer con nombre del socio (lookup por profile_id).
    const nombreById = new Map(sociosShaped.map((s) => [s.profile_id, s.nombre]));
    const sidById = new Map(sociosShaped.map((s) => [s.profile_id, s.socio_id]));
    setPagos((pagosRes.data || []).map((p) => ({
      id: p.id,
      fecha: new Date(p.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
      fecha_iso: p.fecha,
      socio_id: sidById.get(p.socio_id) || '—',
      socio: nombreById.get(p.socio_id) || '—',
      monto: Number(p.monto),
      metodo: p.metodo,
      estado: p.estado,
      ref: p.referencia || '—'
    })));

    // Config: clave/valor.
    const cfg = { ...ADMIN_CONFIG_DEFAULT };
    for (const r of configRes.data || []) cfg[r.key] = r.value || '';
    setConfig(cfg);

    setLoading(false);
  };

  useEffect(() => { reloadAll(); }, []);

  // KPIs derivados
  const totalSocios = socios.length;
  const sociosActivos = socios.filter((s) => s.estado === 'activo').length;
  const sociosAlDia = socios.filter((s) => s.estado === 'activo' && s.adeuda === 0).length;
  const sociosConDeuda = socios.filter((s) => s.estado === 'activo' && s.adeuda > 0).length;
  const totalAdeudado = socios.reduce((s, x) => s + (x.adeuda || 0), 0);
  const ahora = new Date();
  const mesActualPrefix = ahora.getFullYear() + '-' + String(ahora.getMonth() + 1).padStart(2, '0');
  const pagosConfirmados = pagos.filter((p) => p.estado === 'confirmado');
  const pagosMes = pagosConfirmados.filter((p) => (p.fecha_iso || '').startsWith(mesActualPrefix));
  const cobradoMes = pagosMes.reduce((s, p) => s + p.monto, 0);
  const cobradoAnio = pagosConfirmados
    .filter((p) => (p.fecha_iso || '').startsWith(String(ahora.getFullYear())))
    .reduce((s, p) => s + p.monto, 0);
  const ticketPromedioMes = pagosMes.length > 0 ? Math.round(cobradoMes / pagosMes.length) : 0;
  const pctAlDia = sociosActivos > 0 ? Math.round((sociosAlDia / sociosActivos) * 100) : 0;
  const nombreMesActual = ahora.toLocaleDateString('es-AR', { month: 'long' });

  // Recaudación de los últimos 6 meses (incluido el actual). Devuelve [{label, total}].
  const ultimos6Meses = (() => {
    const out = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - k, 1);
      const prefix = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const total = pagosConfirmados
        .filter((p) => (p.fecha_iso || '').startsWith(prefix))
        .reduce((s, p) => s + p.monto, 0);
      out.push({
        label: d.toLocaleDateString('es-AR', { month: 'short' }),
        anio: d.getFullYear(),
        prefix,
        total
      });
    }
    return out;
  })();
  const maxRecaudacion = Math.max(1, ...ultimos6Meses.map((m) => m.total));

  // Export de pagos de un mes específico (MM-YYYY) en CSV.
  const exportPagosDelMes = (prefix, label) => {
    const rows = pagos
      .filter((p) => (p.fecha_iso || '').startsWith(prefix))
      .map((p) => ({
        fecha: p.fecha, socio_id: p.socio_id, socio: p.socio, metodo: p.metodo,
        ref: p.ref, estado: p.estado, monto: p.monto
      }));
    if (rows.length === 0) return showToast('No hay pagos en ' + label + '.');
    downloadCSV('pagos-' + prefix + '.csv',
      ['fecha', 'socio_id', 'socio', 'metodo', 'ref', 'estado', 'monto'],
      rows);
    showToast('✓ pagos-' + prefix + '.csv descargado');
  };

  const findSocio = (sid) => socios.find((s) => s.socio_id === sid);

  const desactivarSocio = async (sid) => {
    const socio = findSocio(sid);
    if (!socio) return;
    if (DEMO_MODE) { setSocios((p) => p.map((s) => s.socio_id === sid ? { ...s, estado: 'desactivado' } : s)); return showToast('Socio desactivado (demo)'); }
    const { error } = await supabase.from('profiles').update({ estado: 'desactivado' }).eq('id', socio.profile_id);
    if (error) return showToast('Error: ' + error.message);
    setSocios((p) => p.map((s) => s.socio_id === sid ? { ...s, estado: 'desactivado' } : s));
    showToast('Socio desactivado');
  };

  const reactivarSocio = async (sid) => {
    const socio = findSocio(sid);
    if (!socio) return;
    if (DEMO_MODE) { setSocios((p) => p.map((s) => s.socio_id === sid ? { ...s, estado: 'activo' } : s)); return showToast('Socio reactivado (demo)'); }
    const { error } = await supabase.from('profiles').update({ estado: 'activo' }).eq('id', socio.profile_id);
    if (error) return showToast('Error: ' + error.message);
    setSocios((p) => p.map((s) => s.socio_id === sid ? { ...s, estado: 'activo' } : s));
    showToast('Socio reactivado');
  };

  // Pausa o reanuda la cuota de un socio. Cuando está pausada, los generadores
  // mensuales lo saltean. El socio sigue logueando normalmente; no es lo mismo
  // que desactivar la cuenta.
  const togglePausaCuota = async (sid) => {
    const socio = findSocio(sid);
    if (!socio) return;
    const nueva = !socio.cuota_pausada;
    if (DEMO_MODE) {
      setSocios((p) => p.map((s) => s.socio_id === sid ? { ...s, cuota_pausada: nueva } : s));
      return showToast(nueva ? 'Cuota pausada (demo)' : 'Cuota reanudada (demo)');
    }
    const { error } = await supabase.from('profiles').update({ cuota_pausada: nueva }).eq('id', socio.profile_id);
    if (error) return showToast('Error: ' + error.message);
    setSocios((p) => p.map((s) => s.socio_id === sid ? { ...s, cuota_pausada: nueva } : s));
    showToast(nueva ? '✓ Cuota pausada' : '✓ Cuota reanudada');
  };

  // Pausa o reanuda en bulk para los seleccionados.
  const pausarBulk = async (pausar) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (DEMO_MODE) {
      const set = new Set(ids);
      setSocios((p) => p.map((s) => set.has(s.profile_id) ? { ...s, cuota_pausada: pausar } : s));
      clearSelection();
      return showToast(pausar ? `Cuota pausada en ${ids.length} socio(s) (demo)` : `Cuota reanudada en ${ids.length} socio(s) (demo)`);
    }
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ cuota_pausada: pausar }).in('id', ids);
      if (error) { showToast(friendlyError(error)); return; }
      showToast(pausar ? `✓ Cuota pausada en ${ids.length} socio(s)` : `✓ Cuota reanudada en ${ids.length} socio(s)`);
      clearSelection();
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  // Eliminación definitiva de un socio (Ley 25.326 art. 16 — derecho de
  // supresión). Borra auth.user vía Edge Function `delete-socio`, y cascada
  // del schema elimina profile + cuotas + pagos asociados.
  const eliminarSocioDefinitivo = async (sid) => {
    const socio = findSocio(sid);
    if (!socio) return;
    const txt = `¿Eliminar DEFINITIVAMENTE a ${socio.nombre}?\n\n` +
      `Esta acción NO se puede deshacer. Se borran:\n` +
      `- la cuenta de acceso del socio\n` +
      `- su perfil (DNI, teléfono, etc.)\n` +
      `- todas sus cuotas y pagos históricos\n\n` +
      `Si solo querés que deje de operar, usá "Desactivar" — eso es reversible.\n\n` +
      `Tipeá ELIMINAR para confirmar:`;
    const ans = prompt(txt);
    if (ans !== 'ELIMINAR') return;
    if (DEMO_MODE) {
      setSocios((p) => p.filter((s) => s.profile_id !== socio.profile_id));
      setPagos((p) => p.filter((x) => x.socio_id !== socio.socio_id));
      return showToast('Socio eliminado (demo)');
    }
    if (busy) return;
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('delete-socio', {
        body: { profile_id: socio.profile_id }
      });
      if (error || (res && res.error)) {
        const code = res?.error || error?.message || 'unknown';
        const msg = code === 'cannot_delete_admin' ? 'No se puede eliminar a otro admin.'
          : code === 'cannot_delete_self' ? 'No te podés eliminar a vos mismo.'
          : friendlyError(code);
        return showToast(msg);
      }
      showToast('✓ Socio eliminado definitivamente');
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  // Marca como pagadas TODAS las cuotas pendientes del socio en una sola operación
  // y registra una fila en `pagos` como audit trail.
  const marcarCuotaPagada = async (sid) => {
    const socio = findSocio(sid);
    if (!socio || socio.adeuda === 0) return;
    if (busy) return;
    if (DEMO_MODE) {
      const now = new Date();
      const monto = socio.adeuda;
      setSocios((p) => p.map((s) => s.socio_id === sid ? { ...s, adeuda: 0, ultPago: now.toLocaleDateString('es-AR') } : s));
      setPagos((prev) => [{
        id: 'demo-pago-' + now.getTime(),
        fecha: now.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
        fecha_iso: now.toISOString(),
        socio_id: socio.socio_id,
        socio: socio.nombre,
        monto,
        metodo: 'manual',
        estado: 'confirmado',
        ref: 'demo-' + now.getTime(),
      }, ...prev]);
      return showToast('Pago registrado (demo)');
    }

    // Una sola transacción server-side: la RPC update + insert + audit.
    setBusy(true);
    try {
      const monto = socio.adeuda;
      const { error } = await supabase.rpc('marcar_cuotas_pagadas', { p_socio_id: socio.profile_id });
      if (error) { showToast(friendlyError(error)); return; }
      showToast('Pago de $' + monto.toLocaleString('es-AR') + ' registrado');
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  const crearSocio = async (data) => {
    if (DEMO_MODE) {
      const id = 'demo-new-' + Date.now();
      const cuotaMontoNum = data.cuota_monto === '' || data.cuota_monto == null ? null : Number(data.cuota_monto);
      const numSocio = data.numero_socio || ('AC-' + Math.floor(Math.random() * 9000 + 1000));
      const nuevo = {
        socio_id: numSocio,
        numero_socio: numSocio,
        profile_id: id,
        nombre: data.nombre,
        email: data.email,
        dni: (data.dni || '').replace(/\D/g, ''),
        dorsal: data.dorsal || '',
        categoria: data.categoria || '',
        telefono: data.telefono || '',
        cuota_monto: Number.isFinite(cuotaMontoNum) && cuotaMontoNum > 0 ? cuotaMontoNum : null,
        cuota_pausada: false,
        estado: 'activo',
        adeuda: 0,
        ultPago: '—',
      };
      setSocios((p) => [nuevo, ...p]);
      setShowNewModal(false);
      return showToast('Socio creado (demo)');
    }
    // Llama a la Edge Function `invite-socio` que crea el auth.user + profile
    // y manda mail de invitación. Ver supabase/functions/invite-socio/.
    const dniClean = String(data.dni || '').replace(/\D/g, '');
    const { data: res, error } = await supabase.functions.invoke('invite-socio', {
      body: {
        email: data.email,
        nombre: data.nombre,
        dni: dniClean || null,
        dorsal: data.dorsal ? Number(data.dorsal) : null,
        categoria: data.categoria || null,
        telefono: data.telefono || null,
        numero_socio: data.numero_socio || null
      }
    });
    if (error || (res && res.error)) {
      const code = res?.error || error?.message || 'desconocido';
      const msg = code === 'dni_duplicado' ? 'Ya hay un socio con ese DNI.'
        : code === 'numero_socio_duplicado' ? 'Ya hay un socio con ese número.'
        : 'Error al crear socio: ' + code;
      return showToast(msg);
    }
    setShowNewModal(false);
    showToast('✓ Socio creado y mail de invitación enviado');
    reloadAll();
  };

  const editarSocio = async (data) => {
    if (!editSocio) return;
    const cuotaMontoNum = data.cuota_monto === '' || data.cuota_monto == null ? null : Number(data.cuota_monto);
    const dniClean = String(data.dni || '').replace(/\D/g, '');
    if (DEMO_MODE) {
      const numSocio = data.numero_socio || '';
      setSocios((p) => p.map((s) => s.profile_id === editSocio.profile_id ? {
        ...s, nombre: data.nombre, telefono: data.telefono || '', dorsal: data.dorsal || '',
        categoria: data.categoria || '', dni: dniClean,
        cuota_monto: Number.isFinite(cuotaMontoNum) && cuotaMontoNum > 0 ? cuotaMontoNum : null,
        numero_socio: numSocio,
        socio_id: numSocio || s.profile_id.slice(0, 8),
      } : s));
      setEditSocio(null);
      return showToast('Socio actualizado (demo)');
    }
    const updates = {
      nombre: data.nombre,
      telefono: data.telefono || null,
      dorsal: data.dorsal ? Number(data.dorsal) : null,
      categoria: data.categoria || null,
      numero_socio: data.numero_socio || null,
      dni: dniClean || null,
      cuota_monto: Number.isFinite(cuotaMontoNum) && cuotaMontoNum > 0 ? cuotaMontoNum : null
    };
    const { error } = await supabase.from('profiles').update(updates).eq('id', editSocio.profile_id);
    if (error) return showToast('Error: ' + error.message);
    showToast('✓ Socio actualizado');
    setEditSocio(null);
    reloadAll();
  };

  // === Bulk: selección de socios para acciones masivas ===
  const toggleSelected = (pid) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const selectAll = (pids, on) => setSelectedIds((prev) => {
    const next = new Set(prev);
    pids.forEach((p) => { if (on) next.add(p); else next.delete(p); });
    return next;
  });

  // Asigna (o quita, si monto vacío) un monto de cuota personalizado a todos
  // los socios seleccionados de una sola operación.
  const aplicarCuotaBulk = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const raw = String(bulkMonto).trim();
    const valor = raw === '' ? null : Number(raw);
    if (valor != null && (!Number.isFinite(valor) || valor <= 0)) return showToast('El monto tiene que ser mayor a 0. Para pausar la cuota, usá el botón Pausar.');
    if (DEMO_MODE) {
      const set = new Set(ids);
      setSocios((p) => p.map((s) => set.has(s.profile_id) ? { ...s, cuota_monto: valor } : s));
      setBulkMonto(''); clearSelection();
      return showToast(valor == null ? `Cuota personalizada quitada a ${ids.length} socio(s) (demo)` : `Cuota de $${valor.toLocaleString('es-AR')} asignada a ${ids.length} socio(s) (demo)`);
    }
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ cuota_monto: valor }).in('id', ids);
      if (error) { showToast(friendlyError(error)); return; }
      showToast(valor == null
        ? `✓ Cuota personalizada quitada a ${ids.length} socio(s)`
        : `✓ Cuota de $${valor.toLocaleString('es-AR')} asignada a ${ids.length} socio(s)`);
      setBulkMonto('');
      clearSelection();
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  // Genera la cuota del mes en curso para los socios seleccionados. Usa el
  // monto escrito en la barra, o si está vacío el cuota_monto de cada socio
  // (o el monto general). No duplica cuotas ya existentes.
  const generarCuotaMesBulk = async () => {
    const ids = new Set(selectedIds);
    if (ids.size === 0) return;
    if (demoGuard()) { clearSelection(); return; }
    const ahora = new Date();
    const mes = ahora.getMonth() + 1;
    const anio = ahora.getFullYear();
    const montoBase = Number(config.cuota_monto_base) || 15000;
    const dia = Math.max(1, Math.min(28, Number(config.cuota_dia_vencimiento) || 10));
    const fechaVenc = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const raw = String(bulkMonto).trim();
    const fijo = raw === '' ? null : Number(raw);
    if (fijo != null && (!Number.isFinite(fijo) || fijo <= 0)) return showToast('El monto tiene que ser mayor a 0.');

    const { data: yaTienen } = await supabase.from('cuotas').select('socio_id').eq('mes', mes).eq('anio', anio);
    const yaSet = new Set((yaTienen || []).map((c) => c.socio_id));
    // Saltea cuotas pausadas y los que ya tienen cuota del mes
    const target = socios.filter((s) => ids.has(s.profile_id) && !s.cuota_pausada && !yaSet.has(s.profile_id));
    if (target.length === 0) return showToast('Los seleccionados ya tienen cuota para este mes (o están pausados).');

    const rows = target.map((s) => ({
      socio_id: s.profile_id, mes, anio,
      monto: (fijo != null) ? fijo : (s.cuota_monto != null ? s.cuota_monto : montoBase),
      fecha_vencimiento: fechaVenc
    }));
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('cuotas').insert(rows);
      if (error) { showToast(friendlyError(error)); return; }
      showToast(`✓ ${rows.length} cuota(s) generadas para ${anio}-${String(mes).padStart(2, '0')}`);
      clearSelection();
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  // Marca una cuota específica como totalmente pagada + audit trail.
  const marcarCuotaPagadaIndividual = async (cuotaId) => {
    if (demoGuard()) return;
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('marcar_cuota_pagada', { p_cuota_id: cuotaId });
      if (error) { showToast(friendlyError(error)); return; }
      showToast('✓ Cuota marcada como pagada');
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  // Pago parcial — suma `monto` a monto_pagado (sin pasarse del total).
  const pagoParcial = async (cuotaId, monto) => {
    if (demoGuard()) return;
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('pagar_cuota_parcial', {
        p_cuota_id: cuotaId,
        p_monto: Number(monto)
      });
      if (error) { showToast(friendlyError(error)); return; }
      showToast('✓ Pago parcial de $' + Number(monto).toLocaleString('es-AR') + ' registrado');
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  // Crea una cuota one-off (multa, inscripción, ajuste).
  const agregarCuota = async ({ mes, anio, monto, fecha_vencimiento }) => {
    if (!addCuotaFor) return;
    if (DEMO_MODE) { setAddCuotaFor(null); return showToast('Cuota agregada (demo)'); }
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('cuotas').insert({
        socio_id: addCuotaFor.profile_id,
        mes, anio, monto,
        fecha_vencimiento
      });
      if (error) { showToast(friendlyError(error)); return; }
      showToast('✓ Cuota agregada');
      setAddCuotaFor(null);
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  // Genera cuota del mes en curso para todos los activos que no la tengan.
  const generarCuotasDelMes = async () => {
    if (demoGuard()) return;
    setGenerandoCuotas(true);
    const ahora = new Date();
    const mes = ahora.getMonth() + 1;
    const anio = ahora.getFullYear();
    const montoBase = Number(config.cuota_monto_base) || 15000;
    const dia = Math.max(1, Math.min(28, Number(config.cuota_dia_vencimiento) || 10));
    const fechaVenc = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

    // Activos no pausados, sin cuota para ese mes
    const activos = socios.filter((s) => s.estado === 'activo' && !s.cuota_pausada);
    const { data: yaTienen } = await supabase
      .from('cuotas').select('socio_id')
      .eq('mes', mes).eq('anio', anio);
    const yaSet = new Set((yaTienen || []).map((c) => c.socio_id));
    const faltan = activos.filter((s) => !yaSet.has(s.profile_id));

    if (faltan.length === 0) {
      setGenerandoCuotas(false);
      return showToast('Todos los socios activos ya tienen cuota para este mes.');
    }

    // Cada socio paga su cuota personalizada (cuota_monto) o el monto general.
    const rows = faltan.map((s) => ({
      socio_id: s.profile_id,
      mes, anio,
      monto: s.cuota_monto != null ? s.cuota_monto : montoBase,
      fecha_vencimiento: fechaVenc
    }));
    const { error } = await supabase.from('cuotas').insert(rows);
    setGenerandoCuotas(false);
    if (error) return showToast('Error: ' + error.message);
    showToast(`✓ Generadas ${faltan.length} cuotas para ${anio}-${String(mes).padStart(2, '0')}`);
    reloadAll();
  };

  // Reenvía mail de invitación (mismo Edge Function: si el user ya existe
  // pero no confirmó, Supabase manda un nuevo mail).
  const reenviarInvitacion = async (socioRef) => {
    const target = socioRef || detalleSocio;
    if (!target) return;
    if (demoGuard()) return;
    const { data: res, error } = await supabase.functions.invoke('invite-socio', {
      body: {
        email: target.email,
        nombre: target.nombre,
        resend: true
      }
    });
    if (error || (res && res.error)) {
      return showToast('Error al reenviar: ' + (res?.error || error?.message || 'desconocido'));
    }
    showToast('✓ Invitación reenviada');
  };

  // Anula un pago: marca el pago como 'anulado'. La admin debe ajustar
  // las cuotas afectadas a mano (mostramos un mensaje claro).
  const anularPago = async (pagoId) => {
    if (!pagoId) return;
    if (!confirm('¿Seguro que querés anular este pago?\n\nLas cuotas asociadas vuelven a quedar con saldo pendiente (las que cobrara este pago se descuentan automáticamente).')) return;
    if (DEMO_MODE) {
      setPagos((p) => p.map((x) => x.id === pagoId ? { ...x, estado: 'anulado' } : x));
      return showToast('Pago anulado (demo)');
    }
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('anular_pago', { p_pago_id: pagoId });
      if (error) { showToast(friendlyError(error)); return; }
      showToast('✓ Pago anulado. Cuotas revertidas.');
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  const exportSocios = () => {
    downloadCSV('socios.csv',
      ['socio_id', 'nombre', 'email', 'telefono', 'dorsal', 'categoria', 'estado', 'adeuda', 'ultPago'],
      socios);
    showToast('✓ socios.csv descargado');
  };
  const exportPagos = () => {
    downloadCSV('pagos.csv',
      ['fecha', 'socio_id', 'socio', 'metodo', 'ref', 'estado', 'monto'],
      pagos);
    showToast('✓ pagos.csv descargado');
  };
  const exportCuotas = () => {
    const rows = socios.map((s) => ({
      socio_id: s.socio_id, nombre: s.nombre, categoria: s.categoria,
      adeuda: s.adeuda, estado: s.adeuda > 0 ? 'con deuda' : 'al dia',
      ultimo_pago: s.ultPago
    }));
    downloadCSV('cuotas.csv',
      ['socio_id', 'nombre', 'categoria', 'adeuda', 'estado', 'ultimo_pago'],
      rows);
    showToast('✓ cuotas.csv descargado');
  };

  const guardarConfig = async (nueva) => {
    if (DEMO_MODE) { setConfig(nueva); return showToast('Configuración guardada (demo)'); }
    // Upsert clave por clave en la tabla config.
    const rows = Object.entries(nueva).map(([key, value]) => ({ key, value: String(value ?? '') }));
    const { error } = await supabase.from('config').upsert(rows, { onConflict: 'key' });
    if (error) return showToast('Error: ' + error.message);
    setConfig(nueva);
    showToast('✓ Configuración guardada');
  };

  // Reset de paginación + selección al cambiar filtros / búsqueda. Si no
  // limpiamos la selección, el admin podría aplicar un bulk a socios que ya
  // no son visibles con el nuevo filtro.
  useEffect(() => {
    setPage(1);
    setSelectedIds((prev) => (prev.size > 0 ? new Set() : prev));
  }, [search, filterEstado, filterCat, tab]);

  const categorias = Array.from(new Set(socios.map((s) => s.categoria).filter(Boolean)));
  const sociosFiltrados = socios.filter((s) => {
    const q = search.toLowerCase().trim();
    // El DNI guardado ya está normalizado a dígitos: matcheamos la query
    // también normalizada para que "12.345.678" encuentre "12345678".
    const qDigits = q.replace(/\D/g, '');
    if (q) {
      const matchText = s.nombre.toLowerCase().includes(q)
        || s.socio_id.toLowerCase().includes(q)
        || (s.email || '').toLowerCase().includes(q);
      const matchDni = qDigits && (s.dni || '').includes(qDigits);
      if (!matchText && !matchDni) return false;
    }
    if (filterEstado === 'activos' && s.estado !== 'activo') return false;
    if (filterEstado === 'desactivados' && s.estado !== 'desactivado') return false;
    if (filterEstado === 'al_dia' && !(s.estado === 'activo' && s.adeuda === 0)) return false;
    if (filterEstado === 'con_deuda' && !(s.estado === 'activo' && s.adeuda > 0)) return false;
    if (filterCat !== 'todas' && s.categoria !== filterCat) return false;
    return true;
  });
  const pageSocios = sociosFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageAllSelected = pageSocios.length > 0 && pageSocios.every((s) => selectedIds.has(s.profile_id));

  const topDeudores = [...socios].filter((s) => s.adeuda > 0 && s.estado === 'activo').sort((a, b) => b.adeuda - a.adeuda).slice(0, 5);

  return (
    <section id="admin" className="admin">
      <div className="container">
        {toast && <div className="admin__toast">{toast}</div>}
        {loadError && (
          <div className="admin__toast admin__toast--error" style={{ background: '#7f1d1d', color: '#fff' }}>
            {loadError}
          </div>
        )}
        {loading && !loadError && (
          <p className="admin-empty" style={{ color: '#fff', textAlign: 'center', padding: '2rem 0' }}>
            Cargando datos del club…
          </p>
        )}

        <div className="admin__header reveal">
          <span className="section-eyebrow section-eyebrow--light">Panel administrativo</span>
          <h2 className="section-title section-title--light">
            Control del <span className="accent">Club</span>
          </h2>
          <p className="section-subtitle section-subtitle--light">
            Gestión de socios, cuotas y pagos. Acá ves todo lo que pasa en el club.
          </p>
        </div>

        {/* === STATS === */}
        <div className="admin-stats reveal">
          <div className="admin-stat">
            <div className="admin-stat__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div className="admin-stat__body">
              <span>Socios activos</span>
              <strong>{sociosActivos}</strong>
              <em>{totalSocios} en total</em>
            </div>
          </div>

          <div className="admin-stat admin-stat--ok">
            <div className="admin-stat__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div className="admin-stat__body">
              <span>Al día</span>
              <strong>{sociosAlDia}</strong>
              <em>{pctAlDia}% del plantel</em>
            </div>
          </div>

          <div className="admin-stat admin-stat--warn">
            <div className="admin-stat__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            </div>
            <div className="admin-stat__body">
              <span>Con deuda</span>
              <strong>{sociosConDeuda}</strong>
              <em>${totalAdeudado.toLocaleString('es-AR')} adeudado</em>
            </div>
          </div>

          <div className="admin-stat admin-stat--accent">
            <div className="admin-stat__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div className="admin-stat__body">
              <span>Cobrado en {nombreMesActual}</span>
              <strong>${cobradoMes.toLocaleString('es-AR')}</strong>
              <em>{pagos.filter((p) => p.estado === 'confirmado').length} pagos confirmados</em>
            </div>
          </div>

        </div>

        {/* === TABS === */}
        <div className="admin-tabs reveal" role="tablist">
          {[
            { k: 'resumen', label: 'Resumen' },
            { k: 'socios',  label: 'Socios (' + socios.length + ')' },
            { k: 'pagos',   label: 'Pagos (' + pagos.length + ')' },
            { k: 'config',  label: 'Configuración' }
          ].map((t) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={tab === t.k}
              className={'admin-tabs__btn' + (tab === t.k ? ' is-active' : '')}
              onClick={() => setTab(t.k)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* === CONTENT === */}
        <div className="admin-content reveal">

          {tab === 'resumen' && (
            <div className="admin-grid">
              <div className="admin-card">
                <div className="admin-card__head">
                  <h3>Top deudores</h3>
                  <span>Los 5 que más deben</span>
                </div>
                {topDeudores.length === 0 ? (
                  <p className="admin-empty">¡Nadie debe!</p>
                ) : (
                  <ul className="admin-list">
                    {topDeudores.map((s) => (
                      <li key={s.socio_id} className="admin-list__row">
                        <div>
                          <strong><MiniShield />{s.nombre}</strong>
                          <span>{s.socio_id} · {s.categoria}</span>
                        </div>
                        <div className="admin-list__amount">${s.adeuda.toLocaleString('es-AR')}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="admin-card">
                <div className="admin-card__head">
                  <h3>Últimos pagos</h3>
                  <span>Actividad reciente</span>
                </div>
                <ul className="admin-list">
                  {pagos.slice(0, 6).map((p) => (
                    <li key={p.id} className="admin-list__row">
                      <div>
                        <strong><MiniShield />{p.socio}</strong>
                        <span>{p.fecha} · {p.metodo.toUpperCase()}</span>
                      </div>
                      <div className="admin-list__amount admin-list__amount--ok">
                        ${p.monto.toLocaleString('es-AR')}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="admin-card admin-card--full">
                <div className="admin-card__head">
                  <h3>Cobranza del mes</h3>
                  <span>{nombreMesActual.charAt(0).toUpperCase() + nombreMesActual.slice(1)} {ahora.getFullYear()} — {pctAlDia}% del plantel al día</span>
                </div>
                <div className="admin-progress">
                  <div className="admin-progress__bar">
                    <div className="admin-progress__fill" style={{ width: pctAlDia + '%' }} />
                  </div>
                  <div className="admin-progress__legend">
                    <div><strong>{sociosAlDia}</strong><span>al día</span></div>
                    <div><strong>{sociosConDeuda}</strong><span>con deuda</span></div>
                    <div><strong>${cobradoMes.toLocaleString('es-AR')}</strong><span>recaudado este mes</span></div>
                    <div><strong>${cobradoAnio.toLocaleString('es-AR')}</strong><span>recaudado en {ahora.getFullYear()}</span></div>
                    <div><strong>${ticketPromedioMes.toLocaleString('es-AR')}</strong><span>ticket promedio</span></div>
                    <div><strong>${totalAdeudado.toLocaleString('es-AR')}</strong><span>por cobrar</span></div>
                  </div>
                </div>
              </div>

              <div className="admin-card admin-card--full">
                <div className="admin-card__head admin-card__head--row">
                  <div>
                    <h3>Recaudación últimos 6 meses</h3>
                    <span>Click en una barra para descargar el CSV de pagos de ese mes.</span>
                  </div>
                </div>
                <div className="admin-chart">
                  {ultimos6Meses.map((m) => {
                    const pct = (m.total / maxRecaudacion) * 100;
                    const isActual = m.prefix === mesActualPrefix;
                    return (
                      <button
                        key={m.prefix}
                        type="button"
                        className={'admin-chart__bar' + (isActual ? ' is-actual' : '')}
                        onClick={() => exportPagosDelMes(m.prefix, m.label + ' ' + m.anio)}
                        title={`Descargar pagos de ${m.label} ${m.anio}`}
                      >
                        <span className="admin-chart__value">${m.total.toLocaleString('es-AR')}</span>
                        <span className="admin-chart__fill" style={{ height: Math.max(pct, 4) + '%' }} />
                        <span className="admin-chart__label">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {tab === 'socios' && (
            <div className="admin-card admin-card--full">
              <div className="admin-toolbar">
                <input
                  type="search"
                  placeholder="Buscar por nombre, ID, email o DNI…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="admin-toolbar__search"
                />
                <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className="admin-toolbar__select">
                  <option value="todos">Todos los estados</option>
                  <option value="activos">Activos</option>
                  <option value="al_dia">Al día</option>
                  <option value="con_deuda">Con deuda</option>
                  <option value="desactivados">Desactivados</option>
                </select>
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="admin-toolbar__select">
                  <option value="todas">Todas las categorías</option>
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" className="admin-toolbar__btn admin-toolbar__btn--ghost" onClick={exportSocios} title="Descargar como CSV">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  <span>Exportar CSV</span>
                </button>
                <button type="button" className="admin-toolbar__btn" onClick={() => setShowNewModal(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  <span>Nuevo socio</span>
                </button>
              </div>

              {selectedIds.size > 0 && (
                <div className="admin-bulkbar">
                  <span className="admin-bulkbar__count">{selectedIds.size} socio(s) seleccionados</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Monto de cuota $"
                    value={bulkMonto}
                    onChange={(e) => setBulkMonto(e.target.value)}
                    className="admin-bulkbar__input"
                  />
                  <button type="button" className="admin-toolbar__btn" onClick={aplicarCuotaBulk} disabled={busy}>
                    {String(bulkMonto).trim() === ''
                      ? `Quitar cuota personalizada (${selectedIds.size})`
                      : `Asignar $${Number(bulkMonto).toLocaleString('es-AR')} a ${selectedIds.size}`}
                  </button>
                  <button type="button" className="admin-toolbar__btn admin-toolbar__btn--ghost" onClick={generarCuotaMesBulk} disabled={busy} title="Crea la cuota del mes en curso para los seleccionados">
                    Generar cuota del mes ({selectedIds.size})
                  </button>
                  <button type="button" className="admin-toolbar__btn admin-toolbar__btn--ghost" onClick={() => pausarBulk(true)} disabled={busy} title="Los pausados se saltean al generar cuotas">
                    ⏸ Pausar cuota ({selectedIds.size})
                  </button>
                  <button type="button" className="admin-toolbar__btn admin-toolbar__btn--ghost" onClick={() => pausarBulk(false)} disabled={busy}>
                    ▶ Reanudar ({selectedIds.size})
                  </button>
                  <button type="button" className="admin-btn admin-btn--ghost" onClick={clearSelection}>✕ Limpiar</button>
                </div>
              )}

              <div className="admin-table admin-table--socios">
                <div className="admin-table__head">
                  <span className="admin-table__check">
                    <input type="checkbox" checked={pageAllSelected} onChange={(e) => selectAll(pageSocios.map((s) => s.profile_id), e.target.checked)} title="Seleccionar los de esta página" />
                  </span>
                  <span>ID</span>
                  <span>Socio</span>
                  <span>DNI</span>
                  <span>Categoría</span>
                  <span>Estado</span>
                  <span className="admin-table__num">Adeudado</span>
                  <span>Último pago</span>
                  <span>Acciones</span>
                </div>
                {sociosFiltrados.length === 0 ? (
                  <p className="admin-empty">Sin resultados con los filtros actuales.</p>
                ) : pageSocios.map((s) => {
                  const phone = String(s.telefono || '').replace(/\D/g, '');
                  const checked = selectedIds.has(s.profile_id);
                  return (
                  <div key={s.socio_id} className={'admin-table__row admin-table__row--clickable' + (checked ? ' is-selected' : '')} onClick={() => setDetalleSocio(s)} role="button" tabIndex={0}>
                    <span data-label="" className="admin-table__check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSelected(s.profile_id)} />
                    </span>
                    <span data-label="ID"><code>{s.socio_id}</code></span>
                    <span data-label="Socio">
                      <strong>{s.nombre}</strong>
                      <em>{s.email}</em>
                      {phone && (
                        <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className="admin-wa-link" title="Abrir chat de WhatsApp" onClick={(e) => e.stopPropagation()}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884z"/></svg>
                          <span>{s.telefono}</span>
                        </a>
                      )}
                    </span>
                    <span data-label="DNI">{s.dni || <em>—</em>}</span>
                    <span data-label="Categoría">
                      {s.categoria || <em>—</em>}
                      {s.cuota_monto != null && <em>Cuota ${s.cuota_monto.toLocaleString('es-AR')}</em>}
                    </span>
                    <span data-label="Estado">
                      <span className={'admin-pill admin-pill--' + (s.estado === 'activo' ? (s.adeuda > 0 ? 'warn' : 'ok') : 'off')}>
                        {s.estado === 'desactivado' ? 'Desactivado' : (s.adeuda > 0 ? 'Con deuda' : 'Al día')}
                      </span>
                      {s.cuota_pausada && <span className="admin-pill admin-pill--pausa" style={{ marginTop: 4 }}>⏸ Pausada</span>}
                    </span>
                    <span data-label="Adeudado" className="admin-table__num">
                      {s.adeuda > 0 ? <strong className="admin-text-warn">${s.adeuda.toLocaleString('es-AR')}</strong> : <em>—</em>}
                    </span>
                    <span data-label="Último pago">{s.ultPago}</span>
                    <span data-label="Acciones" className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                      {s.adeuda > 0 && (
                        <button type="button" className="admin-btn admin-btn--xs admin-btn--ok" onClick={() => marcarCuotaPagada(s.socio_id)} disabled={busy} title="Marcar deuda como pagada">✓ Pagar</button>
                      )}
                      {s.adeuda > 0 && phone && (
                        <a
                          href={`https://wa.me/${phone}?text=${encodeURIComponent('Hola ' + (s.nombre.split(' ')[0] || '') + ', te escribo del Club Agronomía Central. Tenés una cuota pendiente de $' + s.adeuda.toLocaleString('es-AR') + '. ¿Coordinamos el pago?')}`}
                          target="_blank" rel="noopener noreferrer"
                          className="admin-btn admin-btn--xs admin-btn--wa"
                          title="Recordar el pago por WhatsApp con mensaje pre-armado"
                        >📩 Recordar</a>
                      )}
                      {s.estado === 'activo'
                        ? <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={() => desactivarSocio(s.socio_id)} disabled={busy}>Desactivar</button>
                        : <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={() => reactivarSocio(s.socio_id)} disabled={busy}>Reactivar</button>
                      }
                    </span>
                  </div>
                  );
                })}
              </div>

              {sociosFiltrados.length > PAGE_SIZE && (
                <div className="admin-pagination">
                  <span className="admin-pagination__info">
                    Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sociosFiltrados.length)} de {sociosFiltrados.length}
                  </span>
                  <div className="admin-pagination__controls">
                    <button type="button" className="admin-btn admin-btn--ghost" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                    <button type="button" className="admin-btn admin-btn--ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ Anterior</button>
                    <span className="admin-pagination__page">Página {page} de {Math.max(1, Math.ceil(sociosFiltrados.length / PAGE_SIZE))}</span>
                    <button type="button" className="admin-btn admin-btn--ghost" disabled={page * PAGE_SIZE >= sociosFiltrados.length} onClick={() => setPage((p) => p + 1)}>Siguiente ›</button>
                    <button type="button" className="admin-btn admin-btn--ghost" disabled={page * PAGE_SIZE >= sociosFiltrados.length} onClick={() => setPage(Math.ceil(sociosFiltrados.length / PAGE_SIZE))}>»</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'config' && (
            <AdminConfig
              config={config}
              onSave={guardarConfig}
              onGenerarCuotasMes={generarCuotasDelMes}
              generandoCuotas={generandoCuotas}
              activosNoPausados={socios.filter((s) => s.estado === 'activo' && !s.cuota_pausada).length}
            />
          )}

          {tab === 'pagos' && (
            <div className="admin-card admin-card--full">
              <div className="admin-card__head admin-card__head--row">
                <div>
                  <h3>Historial de pagos</h3>
                  <span>Audit trail completo</span>
                </div>
                <button type="button" className="admin-toolbar__btn admin-toolbar__btn--ghost" onClick={exportPagos}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  <span>Exportar CSV</span>
                </button>
              </div>
              {pagos.length === 0 ? (
                <p className="admin-empty">Todavía no hay pagos registrados.</p>
              ) : (
              <div className="admin-table admin-table--pagos">
                <div className="admin-table__head">
                  <span>Fecha</span>
                  <span>Socio</span>
                  <span>Método</span>
                  <span>Referencia</span>
                  <span>Estado</span>
                  <span className="admin-table__num">Monto</span>
                  <span>Acciones</span>
                </div>
                {pagos.map((p) => (
                  <div key={p.id} className="admin-table__row">
                    <span data-label="Fecha">{p.fecha}</span>
                    <span data-label="Socio"><strong>{p.socio}</strong><em>{p.socio_id}</em></span>
                    <span data-label="Método">
                      <span className="admin-pill admin-pill--method">{p.metodo}</span>
                    </span>
                    <span data-label="Ref"><code>{p.ref}</code></span>
                    <span data-label="Estado">
                      <span className={'admin-pill admin-pill--' + (p.estado === 'confirmado' ? 'ok' : p.estado === 'anulado' ? 'off' : 'warn')}>{p.estado}</span>
                    </span>
                    <span data-label="Monto" className="admin-table__num">
                      <strong>${p.monto.toLocaleString('es-AR')}</strong>
                    </span>
                    <span data-label="Acciones" className="admin-table__actions">
                      {p.estado === 'confirmado' && (
                        <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={() => anularPago(p.id)} disabled={busy}>
                          Anular
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showNewModal && <NewSocioModal onClose={() => setShowNewModal(false)} onCreate={crearSocio} />}
      {editSocio && <EditSocioModal socio={editSocio} onClose={() => setEditSocio(null)} onSave={editarSocio} />}
      {addCuotaFor && (
        <NuevaCuotaModal
          socio={addCuotaFor}
          onClose={() => setAddCuotaFor(null)}
          onCreate={agregarCuota}
          defaultMonto={addCuotaFor.cuota_monto != null ? addCuotaFor.cuota_monto : (Number(config.cuota_monto_base) || 15000)}
        />
      )}
      {detalleSocio && (
        <DetalleSocioModal
          socio={detalleSocio}
          pagos={pagos.filter((p) => p.socio_id === detalleSocio.socio_id)}
          busy={busy}
          onClose={() => setDetalleSocio(null)}
          onMarcarPagada={() => { marcarCuotaPagada(detalleSocio.socio_id); setDetalleSocio(null); }}
          onDesactivar={() => { desactivarSocio(detalleSocio.socio_id); setDetalleSocio(null); }}
          onReactivar={() => { reactivarSocio(detalleSocio.socio_id); setDetalleSocio(null); }}
          onTogglePausa={() => { togglePausaCuota(detalleSocio.socio_id); setDetalleSocio(null); }}
          onEliminar={() => { eliminarSocioDefinitivo(detalleSocio.socio_id); setDetalleSocio(null); }}
          onEdit={() => { setEditSocio(detalleSocio); setDetalleSocio(null); }}
          onAddCuota={() => { setAddCuotaFor(detalleSocio); setDetalleSocio(null); }}
          onResendInvite={() => reenviarInvitacion(detalleSocio)}
          onMarcarCuotaPagada={marcarCuotaPagadaIndividual}
          onPagoParcial={pagoParcial}
        />
      )}
    </section>
  );
}


// ============================================================
// AdminConfig — editar valores de Config visualmente
// ============================================================
function AdminConfig({ config, onSave, onGenerarCuotasMes, generandoCuotas, activosNoPausados }) {
  const [form, setForm] = useState(config);
  const dirty = JSON.stringify(form) !== JSON.stringify(config);
  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const submit = (e) => { e.preventDefault(); onSave(form); };
  const reset = () => setForm(config);

  const ahora = new Date();
  const mesNombre = ahora.toLocaleDateString('es-AR', { month: 'long' });
  const montoBase = Number(config.cuota_monto_base) || 15000;
  const confirmarGenerar = () => {
    const ok = confirm(
      `Generar cuotas de ${mesNombre} ${ahora.getFullYear()} para los ${activosNoPausados} socio(s) activos NO pausados a $${montoBase.toLocaleString('es-AR')} cada una (o su monto personalizado).\n\n` +
      `Solo crea cuotas para los que NO la tienen todavía — es seguro correrlo varias veces.\n\nLos socios con cuota pausada se saltean.`
    );
    if (ok) onGenerarCuotasMes && onGenerarCuotasMes();
  };

  const groups = [
    {
      title: 'Cuotas y recargos',
      desc: 'Definí el monto base de las cuotas y cuándo se aplica el recargo por mora.',
      fields: [
        { k: 'cuota_monto_base',              label: 'Monto base de la cuota',           hint: 'En pesos. Aplica a cuotas nuevas.', type: 'number' },
        { k: 'cuota_dia_vencimiento',         label: 'Día de vencimiento',                hint: '1-28', type: 'number' },
        { k: 'recargo_monto',                 label: 'Recargo por mora',                  hint: 'Pesos sumados a cuotas vencidas',  type: 'number' },
        { k: 'recargo_dias_post_vencimiento', label: 'Días para aplicar recargo',         hint: 'Default 60 (≈2 meses)', type: 'number' },
        { k: 'auto_generar_cuotas',           label: 'Generación automática',             hint: '"si" / "no" — apaga sin desinstalar', type: 'select', options: ['si', 'no'] }
      ]
    },
    {
      title: 'Datos bancarios',
      desc: 'Aparecen en la sección "Formas de pago" del portal del socio.',
      fields: [
        { k: 'cuit',     label: 'CUIT',          hint: 'Del club' },
        { k: 'cbu',      label: 'CBU',           hint: '22 dígitos' },
        { k: 'alias',    label: 'Alias bancario',hint: 'AGRONOMIA.CENTRAL.AC' },
        { k: 'mp_alias', label: 'Alias de Mercado Pago', hint: 'agronomiacentral.mp' },
        { k: 'mp_link',  label: 'Link directo de MP',     hint: 'Opcional. https://link.mercadopago.com.ar/...' }
      ]
    },
    {
      title: 'Contacto y comunicación',
      desc: 'Datos de la secretaría que ven los socios y se usan en los mails.',
      fields: [
        { k: 'whatsapp',            label: 'WhatsApp del club',         hint: 'Solo dígitos con código país: 5411…' },
        { k: 'telefono_secretaria', label: 'Teléfono de secretaría',     hint: 'Para tel: link' },
        { k: 'notification_email',  label: 'Email para notificaciones', hint: 'Recibe avisos de socios nuevos' },
        { k: 'site_url',            label: 'URL pública del sitio',     hint: 'Aparece en el mail de bienvenida' }
      ]
    },
    {
      title: 'Pago presencial',
      desc: 'Información para socios que pagan en efectivo.',
      fields: [
        { k: 'direccion_pago', label: 'Dirección',     hint: 'Bauness 958' },
        { k: 'horario_pago',   label: 'Horario',       hint: 'Lun a Vie 18 a 22 hs · Sábados 10 a 14 hs' },
        { k: 'dia_debito',     label: 'Día de débito automático', hint: 'Texto descriptivo' }
      ]
    }
  ];

  return (
    <form onSubmit={submit} className="admin-card admin-card--full admin-config">
      <div className="admin-card__head admin-card__head--row">
        <div>
          <h3>Configuración del club</h3>
          <span>Editá CBU, alias, monto de cuota, recargos y más. Los cambios impactan al instante en el portal del socio.</span>
        </div>
        <div className="admin-config__actions">
          <button type="button" className="admin-btn admin-btn--ghost" onClick={reset} disabled={!dirty}>Descartar</button>
          <button type="submit" className="admin-toolbar__btn" disabled={!dirty}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            <span>Guardar cambios</span>
          </button>
        </div>
      </div>

      {/* Acción mensual (antes vivía en su propia pestaña). La dejo acá para
          que no se aprete por accidente. */}
      <div className="admin-config__group">
        <div className="admin-config__group-title">
          <h4>Acciones del mes</h4>
          <p>Generación de cuotas mensuales. Solo crea cuotas para los socios activos sin pausa que todavía no la tengan para este mes.</p>
        </div>
        <div className="admin-config__fields">
          <div className="admin-config__field admin-config__field--full">
            <button type="button" className="admin-toolbar__btn" onClick={confirmarGenerar} disabled={generandoCuotas}>
              {generandoCuotas ? 'Generando...' : `+ Generar cuotas de ${mesNombre} ${ahora.getFullYear()}`}
            </button>
            <span className="admin-config__hint">Se aplican a {activosNoPausados} socio(s) activos no pausados. Cada uno paga su cuota personalizada (si tiene) o el monto base de arriba.</span>
          </div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.title} className="admin-config__group">
          <div className="admin-config__group-title">
            <h4>{g.title}</h4>
            <p>{g.desc}</p>
          </div>
          <div className="admin-config__fields">
            {g.fields.map((f) => (
              <div key={f.k} className="admin-config__field">
                <label>{f.label}</label>
                {f.type === 'select' ? (
                  <select name={f.k} value={form[f.k] || ''} onChange={onChange}>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    name={f.k}
                    type={f.type || 'text'}
                    value={form[f.k] || ''}
                    onChange={onChange}
                  />
                )}
                {f.hint && <span className="admin-config__hint">{f.hint}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </form>
  );
}

// ============================================================
// DetalleSocioModal — info completa de un socio + acciones rápidas
// ============================================================
function DetalleSocioModal({
  socio, pagos, busy, onClose,
  onMarcarPagada, onDesactivar, onReactivar, onTogglePausa, onEliminar,
  onEdit, onAddCuota, onResendInvite,
  onMarcarCuotaPagada, onPagoParcial
}) {
  const [cuotas, setCuotas] = useState([]);
  const [cuotasLoading, setCuotasLoading] = useState(true);
  const [cuotasError, setCuotasError] = useState('');
  const [parcialFor, setParcialFor] = useState(null); // cuota id en modo edit parcial
  const [parcialMonto, setParcialMonto] = useState('');

  const reloadCuotas = async () => {
    setCuotasLoading(true);
    if (DEMO_MODE) {
      setCuotas(buildDemoCuotas(socio));
      setCuotasLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('cuotas')
      .select('*')
      .eq('socio_id', socio.profile_id)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false });
    if (error) setCuotasError(error.message);
    else setCuotas(data || []);
    setCuotasLoading(false);
  };

  useEffect(() => { reloadCuotas(); }, [socio.profile_id]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const phone = String(socio.telefono || '').replace(/\D/g, '');
  const initials = String(socio.nombre || 'S')
    .split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

  const estadoLabel = socio.estado === 'desactivado' ? 'Desactivado'
    : (socio.adeuda > 0 ? 'Con deuda' : 'Al día');
  const estadoClass = socio.estado === 'desactivado' ? 'off'
    : (socio.adeuda > 0 ? 'warn' : 'ok');

  const MES_NOMBRE = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const fmtFecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-AR') : '—';

  const handleMarcarPagada = async (cuotaId) => {
    await onMarcarCuotaPagada(cuotaId);
    reloadCuotas();
  };
  const handleParcialSubmit = async (cuotaId) => {
    const monto = Number(parcialMonto);
    if (!monto || monto <= 0) return;
    await onPagoParcial(cuotaId, monto);
    setParcialFor(null);
    setParcialMonto('');
    reloadCuotas();
  };

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="detalleSocioTitle">
      <div className="modal__box modal__box--xl admin-detalle" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>

        <header className="admin-detalle__head">
          <div className="admin-detalle__avatar">{initials}</div>
          <div className="admin-detalle__head-text">
            <span className="admin-detalle__id">{socio.socio_id}</span>
            <h2 id="detalleSocioTitle">{socio.nombre}</h2>
            <span className={'admin-pill admin-pill--' + estadoClass}>{estadoLabel}</span>
          </div>
        </header>

        <div className="admin-detalle__body">
          <section className="admin-detalle__section">
            <div className="admin-card__head admin-card__head--row">
              <h3>Datos personales</h3>
              <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={onEdit}>
                ✎ Editar
              </button>
            </div>
            <dl className="admin-detalle__data">
              <div><dt>Email</dt><dd>{socio.email || '—'}</dd></div>
              <div><dt>DNI</dt><dd>{socio.dni || '—'}</dd></div>
              <div><dt>Teléfono</dt><dd>{socio.telefono || '—'}</dd></div>
              <div><dt>Categoría</dt><dd>{socio.categoria || '—'}</dd></div>
              <div><dt>Dorsal</dt><dd>{socio.dorsal ? '#' + socio.dorsal : '—'}</dd></div>
              <div><dt>Cuota del socio</dt><dd>{
                socio.cuota_pausada
                  ? <span className="admin-pill admin-pill--pausa">⏸ Pausada</span>
                  : (socio.cuota_monto != null ? '$' + socio.cuota_monto.toLocaleString('es-AR') : 'General')
              }</dd></div>
              <div><dt>Último pago</dt><dd>{socio.ultPago || '—'}</dd></div>
              <div><dt>Saldo</dt><dd>{socio.adeuda > 0 ? <strong className="admin-text-warn">${socio.adeuda.toLocaleString('es-AR')}</strong> : '$0 (al día)'}</dd></div>
            </dl>
          </section>

          <section className="admin-detalle__section">
            <div className="admin-card__head admin-card__head--row">
              <h3>Cuotas ({cuotas.length})</h3>
              <button type="button" className="admin-btn admin-btn--xs" onClick={onAddCuota}>
                + Agregar cuota manual
              </button>
            </div>
            {cuotasLoading ? (
              <p className="admin-empty">Cargando cuotas…</p>
            ) : cuotasError ? (
              <p className="admin-empty admin-text-warn">Error: {cuotasError}</p>
            ) : cuotas.length === 0 ? (
              <p className="admin-empty">Este socio no tiene cuotas todavía. Generalas desde la pestaña Cuotas o agregá una manual.</p>
            ) : (
              <ul className="admin-detalle__list">
                {cuotas.map((c) => {
                  const pillClass = c.estado === 'pagado' ? 'ok' : c.estado === 'parcial' ? 'pausa' : 'warn';
                  const pillLabel = c.estado === 'pagado' ? '✓ Pagado'
                    : c.estado === 'parcial' ? '½ Parcial'
                    : '! Pendiente';
                  return (
                    <li key={c.id}>
                      <span className="admin-detalle__list-label">
                        {MES_NOMBRE[c.mes]} {c.anio}
                        {Number(c.recargo) > 0 && (
                          <em style={{ display: 'block', fontSize: '0.85em', color: '#f87171' }}>
                            + ${Number(c.recargo).toLocaleString('es-AR')} recargo
                          </em>
                        )}
                      </span>
                      <span className={'admin-pill admin-pill--' + pillClass}>{pillLabel}</span>
                      <span className="admin-detalle__list-amount">
                        ${Number(c.monto_pagado).toLocaleString('es-AR')} / ${Number(c.total_a_cobrar).toLocaleString('es-AR')}
                      </span>
                      <span className="admin-detalle__list-date">{fmtFecha(c.fecha_pago)}</span>
                      <span className="admin-table__actions">
                        {c.estado !== 'pagado' && parcialFor !== c.id && (
                          <>
                            <button type="button" className="admin-btn admin-btn--xs admin-btn--ok" onClick={() => handleMarcarPagada(c.id)}>✓ Pagar</button>
                            <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={() => { setParcialFor(c.id); setParcialMonto(''); }}>½ Parcial</button>
                          </>
                        )}
                        {parcialFor === c.id && (
                          <>
                            <input
                              type="number"
                              autoFocus
                              placeholder="Monto"
                              value={parcialMonto}
                              onChange={(e) => setParcialMonto(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleParcialSubmit(c.id); }}
                              style={{ width: 90, padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
                            />
                            <button type="button" className="admin-btn admin-btn--xs admin-btn--ok" onClick={() => handleParcialSubmit(c.id)}>OK</button>
                            <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={() => setParcialFor(null)}>✕</button>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="admin-detalle__section">
            <h3>Pagos registrados ({pagos.length})</h3>
            {pagos.length === 0 ? (
              <p className="admin-empty">Este socio aún no tiene pagos registrados en el sistema.</p>
            ) : (
              <ul className="admin-detalle__list">
                {pagos.map((p) => (
                  <li key={p.id}>
                    <span className="admin-detalle__list-label">{p.fecha}</span>
                    <span className="admin-pill admin-pill--method">{p.metodo}</span>
                    <span className="admin-detalle__list-amount">${p.monto.toLocaleString('es-AR')}</span>
                    <span className="admin-detalle__list-date"><code>{p.ref}</code></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="admin-detalle__actions">
          {socio.adeuda > 0 && (
            <button type="button" className="admin-btn admin-btn--ok" onClick={onMarcarPagada} disabled={busy}>
              ✓ Marcar toda la deuda pagada
            </button>
          )}
          {phone && (
            <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className="admin-btn admin-btn--wa">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884z"/></svg>
              Contactar
            </a>
          )}
          <button type="button" className="admin-btn admin-btn--ghost" onClick={onResendInvite}>
            ✉ Reenviar invitación
          </button>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={onTogglePausa} title={socio.cuota_pausada ? 'Volver a generar cuotas mensuales para este socio' : 'No generar más cuotas mensuales hasta reanudar'}>
            {socio.cuota_pausada ? '▶ Reanudar cuota' : '⏸ Pausar cuota'}
          </button>
          {socio.estado === 'activo'
            ? <button type="button" className="admin-btn admin-btn--ghost" onClick={onDesactivar} disabled={busy}>Desactivar</button>
            : <button type="button" className="admin-btn admin-btn--ghost" onClick={onReactivar} disabled={busy}>Reactivar</button>}
          {onEliminar && (
            <button type="button" className="admin-btn admin-btn--danger" onClick={onEliminar} disabled={busy} title="Borra DEFINITIVAMENTE al socio y todos sus datos (Ley 25.326).">
              🗑 Eliminar definitivamente
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function NewSocioModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    nombre: '', email: '', dni: '', telefono: '',
    dorsal: '', categoria: '', numero_socio: ''
  });
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre || !form.email) { setErr('Nombre y email son obligatorios.'); return; }
    setErr(''); setSubmitting(true);
    try { await onCreate(form); }
    finally { setSubmitting(false); }
  };
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="newSocioTitle">
      <div className="modal__box modal__box--wide" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div className="modal__header">
          <img src="/media/logo.jpeg" alt="AC" className="modal__logo" />
          <h2 id="newSocioTitle">Cargar socio nuevo</h2>
          <p>Le va a llegar un mail con un link para que ponga su contraseña y entre al portal.</p>
        </div>
        <form onSubmit={submit} className="modal__form modal__form--grid">
          <div className="modal__field modal__field--full">
            <label>Nombre y apellido *</label>
            <input name="nombre" value={form.nombre} onChange={onChange} maxLength={80} autoFocus required />
          </div>
          <div className="modal__field modal__field--full">
            <label>Email *</label>
            <input name="email" type="email" value={form.email} onChange={onChange} maxLength={120} required />
          </div>
          <div className="modal__field">
            <label>DNI</label>
            <input name="dni" value={form.dni} onChange={onChange} maxLength={10} inputMode="numeric" />
          </div>
          <div className="modal__field">
            <label>Teléfono</label>
            <input name="telefono" value={form.telefono} onChange={onChange} maxLength={25} />
          </div>
          <div className="modal__field">
            <label>Dorsal</label>
            <input name="dorsal" value={form.dorsal} onChange={onChange} maxLength={3} inputMode="numeric" />
          </div>
          <div className="modal__field">
            <label>Categoría</label>
            <CategoriaSelect name="categoria" value={form.categoria} onChange={onChange} includeEmpty />
          </div>
          <div className="modal__field modal__field--full">
            <label>Número de socio (opcional)</label>
            <input name="numero_socio" value={form.numero_socio} onChange={onChange} maxLength={20} placeholder="Ej: AC-0042" />
          </div>
          {err && <div className="modal__error modal__field--full">{err}</div>}
          <button type="submit" className="modal__submit modal__field--full" disabled={submitting}>
            {submitting ? 'Creando...' : 'Crear socio y enviar invitación'}
          </button>
          <p className="modal__disclaimer modal__field--full">
            El socio recibe un mail con un link válido por 24 hs. Si no le llega, podés reenviar la invitación desde el detalle del socio.
          </p>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// EditSocioModal — edita los datos de un socio existente
// ============================================================
function EditSocioModal({ socio, onClose, onSave }) {
  const [form, setForm] = useState({
    nombre: socio.nombre || '',
    dni: socio.dni || '',
    telefono: socio.telefono || '',
    dorsal: socio.dorsal || '',
    categoria: socio.categoria || '',
    cuota_monto: socio.cuota_monto != null ? String(socio.cuota_monto) : '',
    numero_socio: socio.numero_socio || ''
  });
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre) { setErr('El nombre es obligatorio.'); return; }
    setErr(''); setSubmitting(true);
    try { await onSave(form); }
    finally { setSubmitting(false); }
  };
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="editSocioTitle">
      <div className="modal__box modal__box--wide" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div className="modal__header">
          <h2 id="editSocioTitle">Editar socio</h2>
          <p>{socio.email || 'Sin email'}</p>
        </div>
        <form onSubmit={submit} className="modal__form modal__form--grid">
          <div className="modal__field modal__field--full">
            <label>Nombre y apellido *</label>
            <input name="nombre" value={form.nombre} onChange={onChange} maxLength={80} autoFocus required />
          </div>
          <div className="modal__field">
            <label>DNI</label>
            <input name="dni" value={form.dni} onChange={onChange} maxLength={11} inputMode="numeric" placeholder="Sin puntos" />
          </div>
          <div className="modal__field">
            <label>Teléfono</label>
            <input name="telefono" value={form.telefono} onChange={onChange} maxLength={25} />
          </div>
          <div className="modal__field">
            <label>Dorsal</label>
            <input name="dorsal" value={form.dorsal} onChange={onChange} maxLength={3} inputMode="numeric" />
          </div>
          <div className="modal__field">
            <label>Categoría</label>
            <CategoriaSelect name="categoria" value={form.categoria} onChange={onChange} includeEmpty />
          </div>
          <div className="modal__field">
            <label>Monto de cuota del socio</label>
            <input name="cuota_monto" type="number" min="0" value={form.cuota_monto} onChange={onChange} placeholder="Vacío = usa el monto general" />
          </div>
          <div className="modal__field">
            <label>Número de socio</label>
            <input name="numero_socio" value={form.numero_socio} onChange={onChange} maxLength={20} placeholder="Ej: AC-0042" />
          </div>
          {err && <div className="modal__error modal__field--full">{err}</div>}
          <button type="submit" className="modal__submit modal__field--full" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <p className="modal__disclaimer modal__field--full">
            El "monto de cuota del socio" se usa cuando generás las cuotas del mes. Si lo dejás vacío, ese socio paga el monto general configurado. El email no se puede cambiar desde acá.
          </p>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// NuevaCuotaModal — agrega una cuota manual a un socio
// ============================================================
function NuevaCuotaModal({ socio, onClose, onCreate, defaultMonto = 15000 }) {
  const today = new Date();
  const [form, setForm] = useState({
    mes: today.getMonth() + 1,
    anio: today.getFullYear(),
    monto: String(defaultMonto),
    fecha_vencimiento: ''
  });
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const monto = Number(form.monto);
    if (!monto || monto < 0) { setErr('El monto tiene que ser mayor a 0.'); return; }
    setErr(''); setSubmitting(true);
    try {
      await onCreate({
        mes: Number(form.mes),
        anio: Number(form.anio),
        monto,
        fecha_vencimiento: form.fecha_vencimiento || null
      });
    } finally { setSubmitting(false); }
  };
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="nuevaCuotaTitle">
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div className="modal__header">
          <h2 id="nuevaCuotaTitle">Agregar cuota manual</h2>
          <p>{socio.nombre} — para multas, inscripciones o ajustes one-off.</p>
        </div>
        <form onSubmit={submit} className="modal__form modal__form--grid">
          <div className="modal__field">
            <label>Mes *</label>
            <select name="mes" value={form.mes} onChange={onChange}>
              {meses.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="modal__field">
            <label>Año *</label>
            <input name="anio" type="number" value={form.anio} onChange={onChange} min="2024" max="2100" />
          </div>
          <div className="modal__field modal__field--full">
            <label>Monto * (en pesos)</label>
            <input name="monto" type="number" value={form.monto} onChange={onChange} min="1" />
          </div>
          <div className="modal__field modal__field--full">
            <label>Fecha de vencimiento (opcional)</label>
            <input name="fecha_vencimiento" type="date" value={form.fecha_vencimiento} onChange={onChange} />
          </div>
          {err && <div className="modal__error modal__field--full">{err}</div>}
          <button type="submit" className="modal__submit modal__field--full" disabled={submitting}>
            {submitting ? 'Creando...' : 'Crear cuota'}
          </button>
          <p className="modal__disclaimer modal__field--full">
            Si el socio ya tiene cuota para ese mes/año, esta operación falla — el sistema no duplica.
          </p>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// HERO
// ============================================================
function Hero({ onLoginClick, onAdminClick, loggedUser }) {
  return (
    <section id="inicio" className="hero">
      <div className="hero__video-wrapper">
        <video
          className="hero__video"
          autoPlay
          muted
          loop
          playsInline
          poster="/media/equipo.jpeg"
          aria-hidden="true"
        >
          <source src="/media/video1.mp4" type="video/mp4" />
        </video>
        <div className="hero__overlay"></div>
      </div>

      <div className="hero__content container">
        <div className="hero__badge reveal">
          <span className="hero__dot"></span>
          <span>Club Social y Deportivo · Fundado en Parque Chas</span>
        </div>

        <h1 className="hero__title reveal">
          <span className="hero__title-line">AGRONOMÍA</span>
          <span className="hero__title-line hero__title-line--outlined">CENTRAL</span>
        </h1>

        <p className="hero__tagline reveal">
          El club del barrio. Fútbol, futsal y comunidad desde el corazón de Parque Chas.
        </p>

        <div className="hero__actions reveal">
          {loggedUser ? (
            <a href="#portal" className="hero__btn hero__btn--primary">
              <span>Ver mi estado de cuenta</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          ) : (
            <>
              <button type="button" className="hero__btn hero__btn--primary" onClick={onLoginClick}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>
                </svg>
                <span>Soy Jugador</span>
              </button>
              <button type="button" className="hero__btn hero__btn--admin" onClick={onAdminClick}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 1l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
                </svg>
                <span>CSM Admin</span>
              </button>
            </>
          )}
        </div>

        <div className="hero__stats reveal">
          <div className="hero__stat">
            <strong>LAAMBA</strong>
            <span>Liga B · 3ra División</span>
          </div>
          <div className="hero__stat">
            <strong>24 × 16</strong>
            <span>Cancha cubierta</span>
          </div>
          <div className="hero__stat">
            <strong>Parque Chas</strong>
            <span>Bauness 958, CABA</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// ABOUT
// ============================================================
function About() {
  return (
    <section id="nosotros" className="about">
      <div className="container">
        <div className="about__grid">
          <div className="about__text">
            <span className="section-eyebrow reveal">Sobre el club</span>
            <h2 className="section-title reveal">
              Pasión por el <span className="accent">fútbol</span>, orgullo del barrio.
            </h2>
            <div className="about__body reveal">
              <p>
                En <strong>Club S. y D. Agronomía Central</strong> formamos jugadores, personas y
                comunidad. Desde el corazón de Parque Chas, competimos en la <strong>LAAMBA
                (Liga Amateur Metropolitana de Baby Fútbol y Futsal)</strong> y ofrecemos un espacio
                donde cada socio puede practicar su deporte favorito todos los días.
              </p>
              <p>
                Fútbol, futsal, entrenamientos y la vida social que solo un club de barrio puede
                ofrecer. Nuestro distintivo azul y blanco representa un compromiso con la camiseta
                y con los vecinos que hacen posible este proyecto.
              </p>
            </div>

            <div className="about__pillars reveal">
              <div className="about__pillar">
                <div className="about__pillar-num">01</div>
                <div>
                  <h3>Formativas</h3>
                  <p>Divisiones inferiores con foco en el desarrollo del jugador.</p>
                </div>
              </div>
              <div className="about__pillar">
                <div className="about__pillar-num">02</div>
                <div>
                  <h3>Plantel Mayor</h3>
                  <p>Competencia oficial en la 3ra División, Liga B de LAAMBA.</p>
                </div>
              </div>
              <div className="about__pillar">
                <div className="about__pillar-num">03</div>
                <div>
                  <h3>Comunidad</h3>
                  <p>Un club abierto al barrio, con instalaciones de primer nivel.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="about__visual reveal">
            <div className="about__image-wrap">
              <img src="/media/sumate.jpeg" alt="Jugador de Agronomía Central" loading="lazy" />
              <div className="about__image-tag">
                <span>EST.</span>
                <strong>AC</strong>
              </div>
            </div>
            <div className="about__floating-card">
              <div className="about__floating-top">
                <span className="about__floating-label">División de Honor</span>
                <span className="about__floating-year">2026</span>
              </div>
              <div className="about__floating-main">Torneo<br/>Apertura</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// TEAM
// ============================================================
function Team() {
  return (
    <section id="plantel" className="team has-shield-bg">
      <span className="shield-bg" aria-hidden="true" />
      <div className="container">
        <div className="team__header">
          <span className="section-eyebrow section-eyebrow--light reveal">El plantel</span>
          <h2 className="section-title section-title--light reveal">
            Los que visten la <span className="accent">camiseta</span>.
          </h2>
          <p className="section-subtitle section-subtitle--light reveal">
            Un plantel formado por el trabajo, la entrega y el cariño por los colores del club.
            Cada jugador representa a todo un barrio cada vez que pisa la cancha.
          </p>
        </div>

        <div className="team__group-photo reveal">
          <img src="/media/equipo.jpeg" alt="Plantel de Agronomía Central" loading="lazy" />
          <div className="team__group-overlay">
            <div className="team__group-label">
              <span>Plantel</span>
              <strong>Apertura 2026</strong>
            </div>
          </div>
        </div>

        <div className="team__players">
          <article className="team__card reveal">
            <div className="team__card-image">
              <img src="/media/jugador1.jpeg" alt="Jugador del plantel" loading="lazy" />
              <span className="team__card-number">7</span>
              <img src="/media/logo.jpeg" alt="" className="team__card-shield" aria-hidden="true" />
            </div>
            <div className="team__card-info">
              <span className="team__card-role">Jugador</span>
              <h3><MiniShield />Plantel Superior</h3>
              <p>Compromiso, experiencia y liderazgo dentro de la cancha.</p>
            </div>
          </article>

          <article className="team__card reveal">
            <div className="team__card-image">
              <img src="/media/jugador2.jpeg" alt="Jugador del plantel" loading="lazy" />
              <span className="team__card-number">AC</span>
              <img src="/media/logo.jpeg" alt="" className="team__card-shield" aria-hidden="true" />
            </div>
            <div className="team__card-info">
              <span className="team__card-role">Jugador</span>
              <h3><MiniShield />División de Honor</h3>
              <p>La nueva camada que defiende los colores de la institución.</p>
            </div>
          </article>

          <article className="team__card team__card--cta reveal">
            <div className="team__card-cta">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v8M8 12h8"/>
              </svg>
              <h3>¿Y vos?</h3>
              <p>Pruebas abiertas — 3ra División (2008/07/06) con experiencia en futsal.</p>
              <a href="#sumate" className="team__card-link">Ver pruebas →</a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

// Mini-escudo del club. Aparece al lado del nombre del jugador y en filas del
// admin (Top deudores, Últimos pagos). Solo decorativo (aria-hidden) — el ícono
// como tal no transmite información, refuerza identidad.
function MiniShield({ size = 18 }) {
  return (
    <img
      src="/media/logo.jpeg"
      alt=""
      aria-hidden="true"
      className="mini-shield"
      width={size}
      height={size}
      loading="lazy"
    />
  );
}

// ============================================================
// COORDINATOR
// ============================================================
function Coordinator() {
  return (
    <section id="coordinador" className="coord">
      <div className="container">
        <div className="coord__grid">
          <div className="coord__visual reveal">
            <div className="coord__frame">
              <img src="/media/coordinador.jpeg" alt="Coordinador General del Club" loading="lazy" />
              <div className="coord__badge">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L15 8l7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
                </svg>
                <span>Staff Oficial</span>
              </div>
            </div>
            <div className="coord__decoration" aria-hidden="true">
              <span>AC</span><span>AC</span><span>AC</span>
            </div>
          </div>

          <div className="coord__content">
            <span className="section-eyebrow reveal">Coordinador</span>
            <h2 className="section-title reveal">
              Al frente del <span className="accent">proyecto</span>.
            </h2>
            <div className="coord__bio reveal">
              <p className="coord__lead">
                Al mando del plantel, nuestro <strong>Coordinador General</strong> es el encargado
                de planificar los entrenamientos, guiar la preparación táctica del equipo y
                sostener la identidad de Agronomía Central dentro y fuera de la cancha.
              </p>
              <p>
                Con experiencia en futsal y una mirada siempre puesta en el crecimiento del
                jugador, conduce al grupo con disciplina, convicción y un fuerte compromiso con
                los valores del club.
              </p>
            </div>
            <div className="coord__skills reveal">
              <div className="coord__skill"><strong>01</strong><span>Dirección técnica del plantel superior</span></div>
              <div className="coord__skill"><strong>02</strong><span>Planificación de entrenamientos</span></div>
              <div className="coord__skill"><strong>03</strong><span>Desarrollo de jugadores y divisiones</span></div>
              <div className="coord__skill"><strong>04</strong><span>Representación institucional</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// FACILITIES
// ============================================================
const FACILITIES = [
  { t: 'Cancha Cubierta', p: 'Baby Fútbol 5 vs 5 de 24 × 16 mts, con tribunas para Local y Visitante.' },
  { t: 'Vestuarios', p: '2 vestuarios masculinos (Local y Visitante) y 1 vestuario femenino.' },
  { t: 'Gimnasio', p: 'Equipado con los elementos necesarios para el entrenamiento de boxeo.' },
  { t: 'Buffet y Comedor', p: 'Salón comedor abierto todos los días de 9 a 24 hs.' },
  { t: 'Quincho Cerrado', p: 'Casi 50 m², para 60 personas. 3 parrillas, freezer, heladera, horno, 2 baños.' },
  { t: 'Salón de Eventos', p: '200 m² para 180 personas. A/C, barra, DJ, parrilla de luces, equipamiento completo.' },
  { t: 'Aula de Capacitación', p: 'En el primer piso, totalmente equipada, con capacidad para 20 asistentes.' },
  { t: 'Beneficios Socio', p: 'Descuentos exclusivos en alquiler de quincho y salón de eventos.' }
];

function FacilityIcon({ i }) {
  const icons = [
    <svg key="0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="6" width="20" height="14" rx="1"/><path d="M12 6v14M2 13h20"/><circle cx="12" cy="13" r="2.5"/></svg>,
    <svg key="1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 21V10a2 2 0 0 1 2-2h2V4h8v4h2a2 2 0 0 1 2 2v11"/><path d="M10 21v-6h4v6"/></svg>,
    <svg key="2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 9h12M6 9v11h12V9M6 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M9 13h6M9 17h6"/></svg>,
    <svg key="3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 2v3M16 2v3M3 8h18M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><circle cx="12" cy="14" r="2"/></svg>,
    <svg key="4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M2 14h20l-1.5 6h-17z"/><path d="M12 4v10"/></svg>,
    <svg key="5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7h18v13H3z"/><path d="M3 7l3-4h12l3 4M8 12h8M8 16h8"/></svg>,
    <svg key="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="14" rx="1"/><path d="M8 2v4M16 2v4M3 10h18M7 14h4"/></svg>,
    <svg key="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
  ];
  return icons[i];
}

function Facilities() {
  return (
    <section id="instalaciones" className="fac">
      <div className="container">
        <div className="fac__header">
          <span className="section-eyebrow reveal">Instalaciones</span>
          <h2 className="section-title reveal">
            Un club <span className="accent">completo</span>, dentro de la ciudad.
          </h2>
          <p className="section-subtitle reveal">
            Espacios confiables y bien dotados para que nuestros socios puedan practicar su
            deporte favorito cada día, con fácil acceso y en el corazón de Parque Chas.
          </p>
        </div>

        <div className="fac__grid">
          {FACILITIES.map((f, i) => (
            <article key={i} className="fac__card reveal">
              <div className="fac__icon" aria-hidden="true"><FacilityIcon i={i} /></div>
              <h3>{f.t}</h3>
              <p>{f.p}</p>
              <span className="fac__number">{String(i + 1).padStart(2, '0')}</span>
            </article>
          ))}
        </div>

        <div className="fac__cta reveal">
          <div className="fac__cta-text">
            <h3>¿Querés conocer el club?</h3>
            <p>
              Te invitamos a conocer más sobre nuestros servicios y los beneficios de ser socio.
              Comunicate con nosotros para que te contemos todo.
            </p>
          </div>
          <a href="tel:+541145242225" className="fac__cta-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span>4524-2225</span>
          </a>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// FIXTURE
// ============================================================
function Fixture() {
  return (
    <section id="fixture" className="fixture">
      <div className="container">
        <div className="fixture__header">
          <span className="section-eyebrow section-eyebrow--light reveal">Torneo Apertura 2026</span>
          <h2 className="section-title section-title--light reveal">
            Fixture <span className="accent">oficial</span> Liga B.
          </h2>
          <p className="section-subtitle section-subtitle--light reveal">
            Cronograma completo de fechas y rivales del plantel de Agronomía Central en el Torneo
            Apertura 2026, organizado por LAAMBA.
          </p>
        </div>

        <div className="fixture__content reveal">
          <div className="fixture__frame">
            <img src="/media/fixture.jpeg" alt="Fixture oficial 2026" loading="lazy" />
          </div>
          <div className="fixture__notes">
            <div className="fixture__note"><strong>15</strong><span>Fechas del torneo regular</span></div>
            <div className="fixture__note"><strong>Liga B</strong><span>Categoría 3ra División</span></div>
            <div className="fixture__note"><strong>LAAMBA</strong><span>Organización oficial</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// GALLERY
// ============================================================
function Gallery() {
  const [playingId, setPlayingId] = useState(null);
  const v1 = useRef(null);
  const v2 = useRef(null);

  const toggle = (ref, id) => {
    const vid = ref.current;
    if (!vid) return;
    if (playingId === id) {
      vid.pause();
      setPlayingId(null);
    } else {
      if (v1.current) v1.current.pause();
      if (v2.current) v2.current.pause();
      vid.play().catch(() => {});
      setPlayingId(id);
    }
  };

  const renderPlay = (isPlaying) => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      {isPlaying
        ? <><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>
        : <path d="M8 5v14l11-7z"/>
      }
    </svg>
  );

  return (
    <section className="gallery">
      <div className="container">
        <div className="gallery__header">
          <span className="section-eyebrow reveal">Momentos</span>
          <h2 className="section-title reveal">En <span className="accent">acción</span>.</h2>
          <p className="section-subtitle reveal">
            Entrenamientos, partidos y la vida del club en movimiento.
          </p>
        </div>

        <div className="gallery__grid">
          <div className="gallery__item gallery__item--video reveal">
            <video ref={v1} poster="/media/sumate.jpeg" playsInline preload="metadata" onEnded={() => setPlayingId(null)}>
              <source src="/media/video1.mp4" type="video/mp4" />
            </video>
            <button
              type="button"
              className={'gallery__play ' + (playingId === 1 ? 'gallery__play--playing' : '')}
              onClick={() => toggle(v1, 1)}
              aria-label={playingId === 1 ? 'Pausar video' : 'Reproducir video'}
            >
              {renderPlay(playingId === 1)}
            </button>
            <div className="gallery__caption"><span>Video</span><strong>En la cancha</strong></div>
          </div>

          <div className="gallery__item gallery__item--video reveal">
            <video ref={v2} poster="/media/jugador1.jpeg" playsInline preload="metadata" onEnded={() => setPlayingId(null)}>
              <source src="/media/video2.mp4" type="video/mp4" />
            </video>
            <button
              type="button"
              className={'gallery__play ' + (playingId === 2 ? 'gallery__play--playing' : '')}
              onClick={() => toggle(v2, 2)}
              aria-label={playingId === 2 ? 'Pausar video' : 'Reproducir video'}
            >
              {renderPlay(playingId === 2)}
            </button>
            <div className="gallery__caption"><span>Video</span><strong>Entrenamiento</strong></div>
          </div>

          <div className="gallery__item reveal">
            <img src="/media/equipo.jpeg" alt="Plantel" loading="lazy" />
            <div className="gallery__caption"><span>Equipo</span><strong>Plantel 2026</strong></div>
          </div>

          <div className="gallery__item reveal">
            <img src="/media/sumate.jpeg" alt="Jugador en acción" loading="lazy" />
            <div className="gallery__caption"><span>Partido</span><strong>División de Honor</strong></div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// JOIN US
// ============================================================
const EMPTY = { nombre: '', email: '', telefono: '' };

function JoinUs() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value.slice(0, 120) }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: null }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit('joinUs', 5000)) { setStatus('error'); return; }
    const errs = {};
    if (!isValidName(form.nombre)) errs.nombre = 'Ingresá un nombre válido (2-80 caracteres).';
    if (!isValidEmail(form.email)) errs.email = 'Ingresá un email válido.';
    if (!isValidPhone(form.telefono)) errs.telefono = 'Ingresá un teléfono válido.';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    // Form de "Sumate" — placeholder. La integración real (mail al club o tabla
    // de solicitudes en Supabase) se conecta acá tomando los valores de `form`
    // saneados con sanitizeText.
    setTimeout(() => {
      setStatus('success');
      setForm(EMPTY);
      setSubmitting(false);
    }, 700);
  };

  return (
    <section id="sumate" className="join">
      <div className="container">
        <div className="join__grid">
          <div className="join__info">
            <span className="section-eyebrow reveal">Pruebas abiertas</span>
            <h2 className="section-title reveal">
              Sumate al club del <span className="accent">barrio</span>.
            </h2>
            <p className="join__lead reveal">
              Buscamos jugadores con experiencia en futsal para la <strong>3ra División</strong>,
              categorías <strong>2008, 2007 y 2006</strong>. Dejanos tus datos y te contactamos
              para coordinar la prueba.
            </p>

            <div className="join__highlights reveal">
              {[
                'Plantel competitivo en LAAMBA',
                'Cancha cubierta propia en Parque Chas',
                'Cuerpo técnico con experiencia',
                'División de Honor — Apertura 2026'
              ].map((txt, i) => (
                <div key={i} className="join__highlight">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                  <span>{txt}</span>
                </div>
              ))}
            </div>
          </div>

          <form className="join__form reveal" onSubmit={onSubmit} noValidate>
            <h3 className="join__form-title">Formulario de inscripción</h3>

            <div className="join__field">
              <label htmlFor="nombre">Nombre y apellido *</label>
              <input id="nombre" name="nombre" type="text" value={form.nombre} onChange={onChange}
                maxLength={80} autoComplete="name" className={errors.nombre ? 'error' : ''} />
              {errors.nombre && <span className="join__error">{errors.nombre}</span>}
            </div>

            <div className="join__row">
              <div className="join__field">
                <label htmlFor="email">Email *</label>
                <input id="email" name="email" type="email" value={form.email} onChange={onChange}
                  maxLength={120} autoComplete="email" className={errors.email ? 'error' : ''} />
                {errors.email && <span className="join__error">{errors.email}</span>}
              </div>
              <div className="join__field">
                <label htmlFor="telefono">Teléfono *</label>
                <input id="telefono" name="telefono" type="tel" value={form.telefono} onChange={onChange}
                  maxLength={25} autoComplete="tel" className={errors.telefono ? 'error' : ''} />
                {errors.telefono && <span className="join__error">{errors.telefono}</span>}
              </div>
            </div>

            {status === 'success' && (
              <div className="join__alert join__alert--success">
                ✓ Recibimos tus datos. Te contactamos en las próximas 48hs.
              </div>
            )}
            {status === 'error' && (
              <div className="join__alert join__alert--error">
                Esperá unos segundos antes de volver a enviar.
              </div>
            )}

            <button type="submit" className="join__submit" disabled={submitting}>
              {submitting ? <span>Enviando...</span> : (
                <>
                  <span>Enviar inscripción</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>

            <p className="join__disclaimer">
              Al enviar este formulario aceptás que el club utilice tus datos únicamente para
              contactarte respecto a la prueba deportiva.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// CONTACT
// ============================================================
function Contact() {
  return (
    <section id="contacto" className="contact">
      <div className="container">
        <div className="contact__header">
          <span className="section-eyebrow section-eyebrow--light reveal">Contacto</span>
          <h2 className="section-title section-title--light reveal">
            Estamos en el <span className="accent">barrio</span>.
          </h2>
          <p className="section-subtitle section-subtitle--light reveal">
            Visitanos en Parque Chas o comunicate por teléfono. Estamos abiertos todos los días
            para recibirte y mostrarte las instalaciones.
          </p>
        </div>

        <div className="contact__grid">
          <div className="contact__info reveal">
            <div className="contact__block">
              <span className="contact__label">Dirección</span>
              <h3>Bauness 958</h3>
              <p>Barrio Parque Chas<br/>Ciudad Autónoma de Buenos Aires</p>
            </div>
            <div className="contact__block">
              <span className="contact__label">Teléfono</span>
              <a href="tel:+541145242225" className="contact__phone">4524-2225</a>
            </div>
            <div className="contact__block">
              <span className="contact__label">Buffet y comedor</span>
              <h3>9 a 24 hs</h3>
              <p>Abierto todos los días</p>
            </div>
            <div className="contact__socials">
              <a href="#" className="contact__social" aria-label="Instagram">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
                <span>Instagram</span>
              </a>
              <a href="#" className="contact__social" aria-label="Facebook">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                <span>Facebook</span>
              </a>
              <a href="https://wa.me/541145242225" className="contact__social" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/></svg>
                <span>WhatsApp</span>
              </a>
            </div>
          </div>

          <div className="contact__map reveal">
            <iframe
              title="Ubicación Bauness 958"
              src="https://www.openstreetmap.org/export/embed.html?bbox=-58.4850%2C-34.5830%2C-58.4700%2C-34.5750&layer=mapnik&marker=-34.579%2C-58.4775"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
            <div className="contact__map-pin">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 12 7.5 12.4a.7.7 0 0 0 1 0C13 22 20 15.4 20 10a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
              </svg>
              <div>
                <strong>Agronomía Central</strong>
                <span>Bauness 958 · Parque Chas</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// FOOTER
// ============================================================
function Footer() {
  const year = new Date().getFullYear();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <div className="footer__shield" aria-hidden="true">
              <Logo className="footer__logo-img" />
            </div>
            <div>
              <h3>Club S. y D. Agronomía Central</h3>
              <p>El club del barrio de Parque Chas, CABA.</p>
            </div>
          </div>

          <div className="footer__cols">
            <div className="footer__col">
              <h4>Contacto</h4>
              <ul>
                <li>Bauness 958</li>
                <li>Parque Chas, CABA</li>
                <li><a href="tel:+541145242225">4524-2225</a></li>
                <li>Buffet: 9 a 24 hs</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer__bottom">
          <p>© {year} Club S. y D. Agronomía Central. Todos los derechos reservados.</p>
          <p className="footer__league">
            Participa en <strong>LAAMBA</strong> · Liga B · División de Honor
            {' · '}
            <button type="button" className="footer__legal-link" onClick={() => setPrivacyOpen(true)}>
              Política de privacidad
            </button>
          </p>
        </div>
      </div>
      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
    </footer>
  );
}

// ============================================================
// Política de privacidad (Ley 25.326)
// ============================================================
function PrivacyModal({ onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const mailto = 'mailto:agronomiaarg.01@gmail.com?subject=' + encodeURIComponent('Pedido de datos personales — Ley 25.326');

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="privacyTitle">
      <div className="modal__box modal__box--wide privacy" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div className="modal__header">
          <h2 id="privacyTitle">Política de privacidad</h2>
          <p>Cómo tratamos tus datos. Cumplimos con la Ley 25.326 de Protección de Datos Personales (Argentina).</p>
        </div>
        <div className="privacy__body">
          <h3>1. Qué datos guardamos</h3>
          <p>De cada socio almacenamos: nombre y apellido, email, DNI, teléfono, categoría, número de socio, dorsal opcional, y el historial de cuotas y pagos.</p>

          <h3>2. Para qué los usamos</h3>
          <p>Únicamente para administrar la membresía del club: cobranza de cuotas, comunicación de partidos y actividades, y contacto en caso de necesidad. <strong>No los compartimos con terceros</strong> ni los usamos para publicidad.</p>

          <h3>3. Dónde se almacenan</h3>
          <p>Los datos viven en Supabase (Postgres en servidores de la región Sudamérica). Los pagos manuales se registran ahí. No procesamos tarjetas de crédito en este sitio.</p>

          <h3>4. Quién tiene acceso</h3>
          <p>Solo el personal administrativo del club autorizado (admins). Cada socio ve únicamente sus propios datos y cuotas.</p>

          <h3>5. Tus derechos</h3>
          <p>Tenés derecho a:</p>
          <ul>
            <li><strong>Acceso</strong>: pedir una copia de todos los datos que guardamos sobre vos.</li>
            <li><strong>Rectificación</strong>: corregir datos incorrectos.</li>
            <li><strong>Supresión</strong>: pedir que borremos definitivamente tu cuenta y todos tus datos asociados (cuotas, pagos, historial).</li>
            <li><strong>Oposición</strong>: pedir que dejemos de procesar tus datos para un fin específico.</li>
          </ul>

          <h3>6. Cómo ejercer estos derechos</h3>
          <p>Mandanos un mail a <a href={mailto}>agronomiaarg.01@gmail.com</a> con tu nombre, DNI y qué querés que hagamos. Te respondemos dentro de los 10 días hábiles (art. 14 Ley 25.326).</p>

          <h3>7. Retención</h3>
          <p>Los datos de socios activos se conservan mientras la membresía esté vigente. Los datos de socios desactivados se conservan hasta 24 meses por motivos contables, y después se eliminan.</p>

          <h3>8. Responsable</h3>
          <p>Club S. y D. Agronomía Central, Bauness 958, Parque Chas, CABA. Inscripto como responsable de bases de datos personales ante la AAIP (Agencia de Acceso a la Información Pública) — Ley 25.326.</p>

          <p className="privacy__updated">Última actualización: {new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// APP raíz
// ============================================================

export default function App() {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState(null);           // null | 'jugador' | 'admin'
  const [loginOpen, setLoginOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [setPasswordOpen, setSetPasswordOpen] = useState(false);

  // Si el usuario llegó por link de invite/recovery, esperamos a que Supabase
  // procese la URL (auto, por detectSessionInUrl=true) y abrimos el modal de
  // setear contraseña. NO hacemos applyLogin todavía — primero la contraseña.
  // Si no hay intent, restauramos la sesión existente como siempre.
  useEffect(() => {
    let active = true;

    // Modo demo: entrar directo al panel admin con datos generados.
    if (DEMO_MODE) { setMode('admin'); return () => { active = false; }; }

    if (initialAuthIntent === 'invite' || initialAuthIntent === 'recovery') {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
        if (!active) return;
        if (sess) {
          setSetPasswordOpen(true);
          sub.subscription.unsubscribe();
        }
      });
      return () => { active = false; sub.subscription.unsubscribe(); };
    }

    refreshSession().then((res) => {
      if (!active) return;
      if (res && res.ok) applyLogin(res);
    });
    return () => { active = false; };
  }, []);

  // Reveal on scroll
  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -50px 0px' }
    );
    const run = () => {
      document.querySelectorAll('.reveal:not(.visible)').forEach((el) => observer.observe(el));
    };
    run();
    const t = setTimeout(run, 100);
    const t2 = setTimeout(run, 300);
    return () => { observer.disconnect(); clearTimeout(t); clearTimeout(t2); };
  }, [session, mode]);

  // Marca body.is-demo cuando estamos en modo demo (la CSS empuja la navbar
  // debajo del banner para que no se superpongan).
  useEffect(() => {
    if (DEMO_MODE) document.body.classList.add('is-demo');
    return () => document.body.classList.remove('is-demo');
  }, []);

  const applyLogin = (res) => {
    if (res.role === 'admin') {
      setMode('admin');
      setSession(null);
      setTimeout(() => {
        const el = document.getElementById('admin');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } else {
      setMode('jugador');
      setSession({ user: res.user, cuotas: res.cuotas, config: res.config });
      setTimeout(() => {
        const el = document.getElementById('portal');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  };

  const handleLogin = (res) => {
    setLoginOpen(false);
    applyLogin(res);
  };

  const handleLogout = async () => {
    await logoutUser();
    setSession(null);
    setMode(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loggedUser = mode === 'jugador' && session
    ? session.user
    : mode === 'admin'
      ? { nombre: 'Admin del Club' }
      : null;

  return (
    <>
      {DEMO_MODE && (
        <div className="demo-banner" role="status">
          MODO DEMO — datos de ejemplo (150 socios), nada se guarda. Quitá <code>?demo=1</code> de la URL para volver.
        </div>
      )}
      <Navbar
        onLoginClick={() => setLoginOpen(true)}
        onAdminClick={() => setLoginOpen(true)}
        loggedUser={loggedUser}
        onLogout={handleLogout}
      />
      <main>
        <Hero
          onLoginClick={() => setLoginOpen(true)}
          onAdminClick={() => setLoginOpen(true)}
          loggedUser={loggedUser}
        />
        {mode === 'jugador' && session && (
          <PortalSocio
            user={session.user}
            cuotas={session.cuotas}
            config={session.config}
            token={null}
            onSessionUpdate={(updated) => {
              setSession({
                user: updated.user,
                cuotas: updated.cuotas || [],
                config: updated.config || session.config
              });
            }}
          />
        )}
        {mode === 'admin' && <PortalAdmin onLogout={handleLogout} />}
        {/*
          Landing reducida a una sola pantalla (Hero).
          Los componentes About / Team / Coordinator / Facilities / Fixture /
          Gallery / JoinUs / Contact siguen definidos abajo en este archivo —
          si en algún momento querés reactivar alguno, agregá <Componente />
          acá y volvé a sumar su entrada en `links` (línea ~50).
        */}
      </main>
      <Footer />

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={handleLogin}
        onSwitchToReset={() => { setLoginOpen(false); setResetOpen(true); }}
      />
      <ResetPasswordModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onSwitchToLogin={() => { setResetOpen(false); setLoginOpen(true); }}
      />
      <SetPasswordModal
        open={setPasswordOpen}
        intent={initialAuthIntent}
        onSuccess={async () => {
          setSetPasswordOpen(false);
          const res = await refreshSession();
          if (res && res.ok) applyLogin(res);
        }}
      />
    </>
  );
}
