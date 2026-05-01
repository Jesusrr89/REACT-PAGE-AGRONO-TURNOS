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
  confirmPasswordReset,
  refreshSession,
  createPayment,
  confirmPayment,
  sortCuotasDesc,
  buildWhatsappLink,
  buildCartWhatsappLink,
  describeError
} from './utils/api.js';
import { saveSession, loadSession, clearSession } from './utils/session.js';
import { supabase } from './utils/supabase.js';

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

  const links = [
    { href: '#inicio', label: 'Inicio' },
    { href: '#nosotros', label: 'Nosotros' },
    { href: '#plantel', label: 'Plantel' },
    { href: '#coordinador', label: 'Coordinador' },
    { href: '#instalaciones', label: 'Instalaciones' },
    { href: '#fixture', label: 'Fixture' },
    { href: '#sumate', label: 'Sumate' },
    { href: '#contacto', label: 'Contacto' }
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
// RESET PASSWORD MODAL — pedir código por mail y cambiar contraseña
// ============================================================
function ResetPasswordModal({ open, onClose, onSwitchToLogin }) {
  const [step, setStep] = useState('request'); // request | confirm | success
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  useEffect(() => {
    if (!open) {
      setStep('request'); setEmail(''); setCode(''); setPass(''); setPass2('');
      setError(''); setInfo(''); setSubmitting(false);
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
      setInfo(res.message || 'Te mandamos un código a tu mail (si está registrado). Revisá tu casilla y pegalo abajo.');
      setStep('confirm');
    } else {
      setError(describeError(res && res.error));
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) { setError('El código son 6 dígitos.'); return; }
    if (pass.length < 8) { setError('La contraseña tiene que tener al menos 8 caracteres.'); return; }
    if (pass !== pass2) { setError('Las contraseñas no coinciden.'); return; }

    setSubmitting(true);
    const res = await confirmPasswordReset(email, code.trim(), pass);
    setSubmitting(false);
    if (res && res.ok) {
      setStep('success');
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

        {step === 'success' ? (
          <div className="modal__success">
            <div className="modal__success-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
            </div>
            <h3>¡Contraseña actualizada!</h3>
            <p>Ya podés ingresar al portal con tu nueva contraseña.</p>
            <button type="button" className="modal__submit" onClick={onSwitchToLogin}>Ir a ingresar</button>
          </div>
        ) : (
          <>
            <div className="modal__header">
              <img src="/media/logo.jpeg" alt="AC" className="modal__logo" />
              <h2 id="resetTitle">Restablecer contraseña</h2>
              <p>
                {step === 'request'
                  ? 'Ingresá tu email y te mandamos un código para crear una contraseña nueva.'
                  : 'Pegá el código que te llegó al mail y elegí tu nueva contraseña.'}
              </p>
            </div>

            {step === 'request' ? (
              <form className="modal__form" onSubmit={handleRequest} noValidate>
                <div className="modal__field">
                  <label htmlFor="reset-email">Email</label>
                  <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    maxLength={120} autoComplete="email" autoFocus />
                </div>
                {error && <div className="modal__error">{error}</div>}
                <button type="submit" className="modal__submit" disabled={submitting}>
                  {submitting ? 'Enviando…' : 'Enviarme el código'}
                </button>
                <div className="modal__switch">
                  ¿Te acordaste?{' '}
                  <button type="button" onClick={onSwitchToLogin}>Volver a ingresar</button>
                </div>
              </form>
            ) : (
              <form className="modal__form" onSubmit={handleConfirm} noValidate>
                {info && <div className="modal__info">{info}</div>}
                <div className="modal__field">
                  <label htmlFor="reset-code">Código de 6 dígitos</label>
                  <input id="reset-code" type="text" inputMode="numeric" value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6} placeholder="123456" autoFocus autoComplete="one-time-code" />
                </div>
                <div className="modal__field">
                  <label htmlFor="reset-pass">Nueva contraseña</label>
                  <input id="reset-pass" type="password" value={pass} onChange={(e) => setPass(e.target.value)}
                    maxLength={100} autoComplete="new-password" />
                </div>
                <div className="modal__field">
                  <label htmlFor="reset-pass2">Repetir contraseña</label>
                  <input id="reset-pass2" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)}
                    maxLength={100} autoComplete="new-password" />
                </div>
                {error && <div className="modal__error">{error}</div>}
                <button type="submit" className="modal__submit" disabled={submitting}>
                  {submitting ? 'Actualizando…' : 'Cambiar contraseña'}
                </button>
                <div className="modal__switch">
                  <button type="button" onClick={() => { setStep('request'); setError(''); setInfo(''); setCode(''); setPass(''); setPass2(''); }}>
                    Pedir otro código
                  </button>
                </div>
              </form>
            )}
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

function PortalPendiente({ user, config }) {
  const wa = buildWhatsappLink(config, user, null);
  const tel = config.telefono_secretaria || '+541145242225';
  return (
    <section id="portal" className="portal portal--pending">
      <div className="container">
        <div className="portal-pending reveal">
          <div className="portal-pending__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 7v5l3 2"/>
            </svg>
          </div>
          <span className="section-eyebrow section-eyebrow--light">Tu solicitud está en revisión</span>
          <h2 className="section-title section-title--light">
            Hola, <span className="accent">{(user.nombre || '').split(' ')[0]}</span>.
          </h2>
          <p className="portal-pending__lead">
            Recibimos tu solicitud de alta como socio. La secretaría va a verificar tus datos
            y te va a contactar al teléfono que dejaste para confirmar tu cuenta.
          </p>
          <div className="portal-pending__data">
            <div><span>Email registrado</span><strong>{user.email}</strong></div>
            {user.telefono && <div><span>Teléfono de contacto</span><strong>{user.telefono}</strong></div>}
            {user.categoria && <div><span>Categoría solicitada</span><strong>{user.categoria}</strong></div>}
          </div>
          <p className="portal-pending__hint">
            Una vez aprobada, vas a poder ver tu estado de cuenta, pagar tus cuotas con Mercado Pago y todas las funciones del portal.
            Normalmente toma 24-48hs hábiles.
          </p>
          <div className="portal-pending__actions">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="portal-pending__btn portal-pending__btn--wa">
                <WhatsappIcon size={20} />
                <span>Acelerar por WhatsApp</span>
              </a>
            )}
            <a href={'tel:' + String(tel).replace(/[^\d+]/g, '')} className="portal-pending__btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span>Llamar al club</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function PortalSocio({ user, cuotas, config, token, onSessionUpdate }) {
  // Cuenta en revisión: portal limitado, sin estado de cuenta ni carrito
  if (user.estado_cuenta === 'pendiente') {
    return <PortalPendiente user={user} config={config} />;
  }

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
// Cobranza histórica simulada (últimos 6 meses)
const ADMIN_CHART_DATA = [
  { mes: 'Nov 25', recaudado: 720000, adeudado: 480000 },
  { mes: 'Dic 25', recaudado: 880000, adeudado: 320000 },
  { mes: 'Ene 26', recaudado: 920000, adeudado: 280000 },
  { mes: 'Feb 26', recaudado: 850000, adeudado: 350000 },
  { mes: 'Mar 26', recaudado: 950000, adeudado: 250000 },
  { mes: 'Abr 26', recaudado: 960000, adeudado: 345000 }
];

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
  const [pausaSocio, setPausaSocio] = useState(null);
  const [detalleSocio, setDetalleSocio] = useState(null);
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  // KPIs derivados
  const totalSocios = socios.length;
  const sociosActivos = socios.filter((s) => s.estado === 'activo').length;
  const sociosAlDia = socios.filter((s) => s.estado === 'activo' && s.adeuda === 0).length;
  const sociosConDeuda = socios.filter((s) => s.estado === 'activo' && s.adeuda > 0).length;
  const totalAdeudado = socios.reduce((s, x) => s + (x.adeuda || 0), 0);
  const cobradoMes = pagos
    .filter((p) => p.estado === 'confirmado' && p.fecha.indexOf('2026-04') === 0)
    .reduce((s, p) => s + p.monto, 0);
  const pctAlDia = sociosActivos > 0 ? Math.round((sociosAlDia / sociosActivos) * 100) : 0;

  const aprobarSolicitud = (sid) => {
    const sol = solicitudes.find((s) => s.socio_id === sid);
    if (!sol) return;
    setSocios((p) => [...p, {
      socio_id: sol.socio_id, nombre: sol.nombre, dorsal: '',
      categoria: sol.categoria, estado: 'activo', adeuda: 0,
      ultPago: '—', telefono: sol.telefono, email: sol.email
    }]);
    setSolicitudes((p) => p.filter((s) => s.socio_id !== sid));
    showToast('✓ Solicitud aprobada — ' + sol.nombre);
  };
  const rechazarSolicitud = (sid) => {
    const sol = solicitudes.find((s) => s.socio_id === sid);
    setSolicitudes((p) => p.filter((s) => s.socio_id !== sid));
    if (sol) showToast('Solicitud rechazada — ' + sol.nombre);
  };
  const desactivarSocio = (sid) => {
    setSocios((p) => p.map((s) => s.socio_id === sid ? { ...s, estado: 'desactivado' } : s));
    showToast('Socio desactivado');
  };
  const reactivarSocio = (sid) => {
    setSocios((p) => p.map((s) => s.socio_id === sid ? { ...s, estado: 'activo' } : s));
    showToast('Socio reactivado');
  };
  const marcarCuotaPagada = (sid) => {
    const socio = socios.find((s) => s.socio_id === sid);
    if (!socio || socio.adeuda === 0) return;
    setSocios((p) => p.map((s) => s.socio_id === sid
      ? { ...s, adeuda: 0, ultPago: new Date().toLocaleDateString('es-AR') }
      : s));
    setPagos((p) => [{
      fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
      socio_id: sid, socio: socio.nombre, monto: socio.adeuda,
      metodo: 'manual', estado: 'confirmado', ref: 'admin-' + Date.now()
    }, ...p]);
    showToast('Pago de $' + socio.adeuda.toLocaleString('es-AR') + ' registrado');
  };
  const crearSocio = (data) => {
    const nextId = 'AC-' + ('0000' + (socios.length + solicitudes.length + 1)).slice(-4);
    setSocios((p) => [...p, {
      socio_id: nextId, nombre: data.nombre, dorsal: data.dorsal || '',
      categoria: data.categoria, estado: 'activo', adeuda: 0, ultPago: '—',
      telefono: data.telefono, email: data.email
    }]);
    setShowNewModal(false);
    showToast('✓ Socio creado: ' + nextId);
  };

  const aplicarPausa = (sid, datos) => {
    setPausas((p) => ({ ...p, [sid]: datos }));
    setPausaSocio(null);
    showToast('Cuota pausada de ' + datos.desde + ' a ' + datos.hasta);
  };
  const quitarPausa = (sid) => {
    setPausas((p) => {
      const next = { ...p };
      delete next[sid];
      return next;
    });
    showToast('Pausa removida — el socio vuelve a generar cuota');
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
      ultimo_pago: s.ultPago, en_pausa: pausas[s.socio_id] ? 'si' : 'no'
    }));
    downloadCSV('cuotas.csv',
      ['socio_id', 'nombre', 'categoria', 'adeuda', 'estado', 'ultimo_pago', 'en_pausa'],
      rows);
    showToast('✓ cuotas.csv descargado');
  };

  const guardarConfig = (nueva) => {
    setConfig(nueva);
    showToast('✓ Configuración guardada (en demo solo en memoria)');
  };

  const importarSocios = (rows) => {
    // rows: [{ nombre, email, dni, telefono, categoria }]
    const start = socios.length + solicitudes.length;
    const nuevos = rows.map((r, i) => ({
      socio_id: 'AC-' + ('0000' + (start + i + 1)).slice(-4),
      nombre: r.nombre || '',
      dorsal: r.dorsal || '',
      categoria: r.categoria || '3ra División',
      estado: 'activo',
      adeuda: 0,
      ultPago: '—',
      telefono: r.telefono || '',
      email: r.email || ''
    })).filter((s) => s.nombre && s.email);
    setSocios((p) => [...p, ...nuevos]);
    showToast('✓ Importados ' + nuevos.length + ' socio(s)');
    setTab('socios');
  };

  // Reset de paginación al cambiar filtros / búsqueda
  useEffect(() => { setPage(1); }, [search, filterEstado, filterCat, tab]);

  const categorias = Array.from(new Set(socios.map((s) => s.categoria)));
  const sociosFiltrados = socios.filter((s) => {
    const q = search.toLowerCase().trim();
    if (q && !(s.nombre.toLowerCase().includes(q) || s.socio_id.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))) return false;
    if (filterEstado === 'activos' && s.estado !== 'activo') return false;
    if (filterEstado === 'desactivados' && s.estado !== 'desactivado') return false;
    if (filterEstado === 'al_dia' && !(s.estado === 'activo' && s.adeuda === 0)) return false;
    if (filterEstado === 'con_deuda' && !(s.estado === 'activo' && s.adeuda > 0)) return false;
    if (filterCat !== 'todas' && s.categoria !== filterCat) return false;
    return true;
  });

  const topDeudores = [...socios].filter((s) => s.adeuda > 0).sort((a, b) => b.adeuda - a.adeuda).slice(0, 5);

  return (
    <section id="admin" className="admin">
      <div className="admin__demo-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <span><strong>Modo Demo —</strong> los datos son de ejemplo. En producción se conecta con la base real del club.</span>
      </div>

      <div className="container">
        {toast && <div className="admin__toast">{toast}</div>}

        <div className="admin__header reveal">
          <span className="section-eyebrow section-eyebrow--light">Panel administrativo</span>
          <h2 className="section-title section-title--light">
            Control del <span className="accent">Club</span>
          </h2>
          <p className="section-subtitle section-subtitle--light">
            Gestión completa de socios, cuotas, solicitudes y pagos. Acá ves todo lo que pasa en el club.
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
              <span>Cobrado en Abril</span>
              <strong>${cobradoMes.toLocaleString('es-AR')}</strong>
              <em>{pagos.filter((p) => p.estado === 'confirmado').length} pagos confirmados</em>
            </div>
          </div>

          <div className="admin-stat admin-stat--alert">
            <div className="admin-stat__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div className="admin-stat__body">
              <span>Solicitudes pendientes</span>
              <strong>{solicitudes.length}</strong>
              <em>nuevas altas para revisar</em>
            </div>
          </div>
        </div>

        {/* === TABS === */}
        <div className="admin-tabs reveal" role="tablist">
          {[
            { k: 'resumen',      label: 'Resumen' },
            { k: 'socios',       label: 'Socios (' + socios.length + ')' },
            { k: 'cuotas',       label: 'Cuotas' },
            { k: 'importar',     label: 'Importar' },
            { k: 'solicitudes',  label: 'Solicitudes (' + solicitudes.length + ')' },
            { k: 'pagos',        label: 'Pagos (' + pagos.length + ')' },
            { k: 'config',       label: 'Configuración' }
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
                          <strong>{s.nombre}</strong>
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
                  {pagos.slice(0, 6).map((p, i) => (
                    <li key={i} className="admin-list__row">
                      <div>
                        <strong>{p.socio}</strong>
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
                  <span>Abril 2026 — {pctAlDia}% del plantel al día</span>
                </div>
                <div className="admin-progress">
                  <div className="admin-progress__bar">
                    <div className="admin-progress__fill" style={{ width: pctAlDia + '%' }} />
                  </div>
                  <div className="admin-progress__legend">
                    <div><strong>{sociosAlDia}</strong><span>al día</span></div>
                    <div><strong>{sociosConDeuda}</strong><span>con deuda</span></div>
                    <div><strong>${cobradoMes.toLocaleString('es-AR')}</strong><span>recaudado</span></div>
                    <div><strong>${totalAdeudado.toLocaleString('es-AR')}</strong><span>por cobrar</span></div>
                  </div>
                </div>
              </div>

              <div className="admin-card admin-card--full">
                <div className="admin-card__head">
                  <h3>Cobranza últimos 6 meses</h3>
                  <span>Recaudado vs adeudado por mes</span>
                </div>
                <AdminChart data={ADMIN_CHART_DATA} />
              </div>
            </div>
          )}

          {tab === 'socios' && (
            <div className="admin-card admin-card--full">
              <div className="admin-toolbar">
                <input
                  type="search"
                  placeholder="Buscar por nombre, ID o email…"
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

              <div className="admin-table">
                <div className="admin-table__head">
                  <span>ID</span>
                  <span>Socio</span>
                  <span>Categoría</span>
                  <span>Estado</span>
                  <span className="admin-table__num">Adeudado</span>
                  <span>Último pago</span>
                  <span>Acciones</span>
                </div>
                {sociosFiltrados.length === 0 ? (
                  <p className="admin-empty">Sin resultados con los filtros actuales.</p>
                ) : sociosFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((s) => {
                  const phone = String(s.telefono || '').replace(/\D/g, '');
                  const enPausa = !!pausas[s.socio_id];
                  return (
                  <div key={s.socio_id} className="admin-table__row admin-table__row--clickable" onClick={() => setDetalleSocio(s)} role="button" tabIndex={0}>
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
                    <span data-label="Categoría">{s.categoria}</span>
                    <span data-label="Estado">
                      <span className={'admin-pill admin-pill--' + (s.estado === 'activo' ? (enPausa ? 'pausa' : (s.adeuda > 0 ? 'warn' : 'ok')) : 'off')}>
                        {s.estado === 'desactivado' ? 'Desactivado' : (enPausa ? '⏸ En pausa' : (s.adeuda > 0 ? 'Con deuda' : 'Al día'))}
                      </span>
                    </span>
                    <span data-label="Adeudado" className="admin-table__num">
                      {s.adeuda > 0 ? <strong className="admin-text-warn">${s.adeuda.toLocaleString('es-AR')}</strong> : <em>—</em>}
                    </span>
                    <span data-label="Último pago">{s.ultPago}</span>
                    <span data-label="Acciones" className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                      {s.adeuda > 0 && (
                        <button type="button" className="admin-btn admin-btn--xs admin-btn--ok" onClick={() => marcarCuotaPagada(s.socio_id)} title="Marcar deuda como pagada">✓ Pagar</button>
                      )}
                      {s.estado === 'activo' && (enPausa
                        ? <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={() => quitarPausa(s.socio_id)} title="Quitar la pausa">↻ Reactivar cuota</button>
                        : <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={() => setPausaSocio(s)} title="Pausar generación de cuota por ausencia">⏸ Pausar</button>
                      )}
                      {s.estado === 'activo'
                        ? <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={() => desactivarSocio(s.socio_id)}>Desactivar</button>
                        : <button type="button" className="admin-btn admin-btn--xs admin-btn--ghost" onClick={() => reactivarSocio(s.socio_id)}>Reactivar</button>
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

          {tab === 'cuotas' && (
            <AdminCuotas
              socios={socios}
              pausas={pausas}
              onMarcarPagada={marcarCuotaPagada}
              onPausar={(s) => setPausaSocio(s)}
              onQuitarPausa={quitarPausa}
            />
          )}

          {tab === 'importar' && (
            <AdminImportar onImportar={importarSocios} />
          )}

          {tab === 'config' && (
            <AdminConfig config={config} onSave={guardarConfig} />
          )}

          {tab === 'solicitudes' && (
            <div className="admin-card admin-card--full">
              <div className="admin-card__head">
                <h3>Solicitudes pendientes de aprobación</h3>
                <span>Revisá cada una antes de aceptar</span>
              </div>
              {solicitudes.length === 0 ? (
                <p className="admin-empty">Todo aprobado. Cero solicitudes pendientes.</p>
              ) : (
                <div className="admin-solicitudes">
                  {solicitudes.map((s) => (
                    <article key={s.socio_id} className="admin-sol">
                      <div className="admin-sol__head">
                        <h4>{s.nombre}</h4>
                        <span className="admin-sol__id">{s.socio_id}</span>
                      </div>
                      <dl className="admin-sol__data">
                        <div><dt>DNI</dt><dd>{s.dni}</dd></div>
                        <div><dt>Email</dt><dd>{s.email}</dd></div>
                        <div><dt>Teléfono</dt><dd>{s.telefono}</dd></div>
                        <div><dt>Categoría</dt><dd>{s.categoria}</dd></div>
                        <div><dt>Solicitada</dt><dd>{s.fecha_alta}</dd></div>
                      </dl>
                      <div className="admin-sol__actions">
                        <button type="button" className="admin-btn admin-btn--ok" onClick={() => aprobarSolicitud(s.socio_id)}>
                          ✓ Aprobar
                        </button>
                        <button type="button" className="admin-btn admin-btn--ghost" onClick={() => rechazarSolicitud(s.socio_id)}>
                          Rechazar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
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
              <div className="admin-table admin-table--pagos">
                <div className="admin-table__head">
                  <span>Fecha</span>
                  <span>Socio</span>
                  <span>Método</span>
                  <span>Referencia</span>
                  <span>Estado</span>
                  <span className="admin-table__num">Monto</span>
                </div>
                {pagos.map((p, i) => (
                  <div key={i} className="admin-table__row">
                    <span data-label="Fecha">{p.fecha}</span>
                    <span data-label="Socio"><strong>{p.socio}</strong><em>{p.socio_id}</em></span>
                    <span data-label="Método">
                      <span className="admin-pill admin-pill--method">{p.metodo}</span>
                    </span>
                    <span data-label="Ref"><code>{p.ref}</code></span>
                    <span data-label="Estado">
                      <span className={'admin-pill admin-pill--' + (p.estado === 'confirmado' ? 'ok' : 'warn')}>{p.estado}</span>
                    </span>
                    <span data-label="Monto" className="admin-table__num">
                      <strong>${p.monto.toLocaleString('es-AR')}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewModal && <NewSocioModal onClose={() => setShowNewModal(false)} onCreate={crearSocio} />}
      {pausaSocio && <PausaCuotaModal socio={pausaSocio} onClose={() => setPausaSocio(null)} onConfirm={(d) => aplicarPausa(pausaSocio.socio_id, d)} />}
      {detalleSocio && (
        <DetalleSocioModal
          socio={detalleSocio}
          pausa={pausas[detalleSocio.socio_id]}
          pagos={pagos.filter((p) => p.socio_id === detalleSocio.socio_id)}
          onClose={() => setDetalleSocio(null)}
          onMarcarPagada={() => { marcarCuotaPagada(detalleSocio.socio_id); setDetalleSocio(null); }}
          onPausar={() => { setPausaSocio(detalleSocio); setDetalleSocio(null); }}
          onQuitarPausa={() => { quitarPausa(detalleSocio.socio_id); setDetalleSocio(null); }}
          onDesactivar={() => { desactivarSocio(detalleSocio.socio_id); setDetalleSocio(null); }}
          onReactivar={() => { reactivarSocio(detalleSocio.socio_id); setDetalleSocio(null); }}
        />
      )}
    </section>
  );
}

// ============================================================
// AdminCuotas — vista detallada de cuotas con acciones rápidas
// ============================================================
function AdminCuotas({ socios, pausas, onMarcarPagada, onPausar, onQuitarPausa }) {
  const [filter, setFilter] = useState('con_deuda'); // todos | con_deuda | al_dia | en_pausa
  const conDeuda = socios.filter((s) => s.adeuda > 0 && s.estado === 'activo');
  const alDia    = socios.filter((s) => s.adeuda === 0 && s.estado === 'activo' && !pausas[s.socio_id]);
  const enPausa  = socios.filter((s) => pausas[s.socio_id]);

  const lista = filter === 'con_deuda' ? conDeuda
    : filter === 'al_dia' ? alDia
    : filter === 'en_pausa' ? enPausa
    : socios.filter((s) => s.estado === 'activo');

  const totalDeuda = conDeuda.reduce((s, x) => s + x.adeuda, 0);

  return (
    <div className="admin-card admin-card--full">
      <div className="admin-card__head admin-card__head--row">
        <div>
          <h3>Gestión de cuotas</h3>
          <span>Marcá pagos manuales, pausá cuotas por ausencia, controlá quién está al día.</span>
        </div>
      </div>

      <div className="admin-cuotas__summary">
        <div><strong>{conDeuda.length}</strong><span>con deuda</span></div>
        <div><strong>{alDia.length}</strong><span>al día</span></div>
        <div><strong>{enPausa.length}</strong><span>en pausa</span></div>
        <div><strong>${totalDeuda.toLocaleString('es-AR')}</strong><span>por cobrar</span></div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-tabs admin-tabs--inline">
          {[
            { k: 'con_deuda', label: 'Con deuda' },
            { k: 'al_dia',    label: 'Al día' },
            { k: 'en_pausa',  label: 'En pausa' },
            { k: 'todos',     label: 'Todos los activos' }
          ].map((f) => (
            <button key={f.k} type="button"
              className={'admin-tabs__btn' + (filter === f.k ? ' is-active' : '')}
              onClick={() => setFilter(f.k)}>{f.label}</button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="admin-empty">No hay socios en esta vista.</p>
      ) : (
        <ul className="admin-cuotas__list">
          {lista.map((s) => {
            const phone = String(s.telefono || '').replace(/\D/g, '');
            const pausa = pausas[s.socio_id];
            return (
              <li key={s.socio_id} className={'admin-cuotas__item' + (pausa ? ' is-pausa' : (s.adeuda > 0 ? ' is-deuda' : ' is-ok'))}>
                <div className="admin-cuotas__info">
                  <strong>{s.nombre}</strong>
                  <span>{s.socio_id} · {s.categoria}</span>
                  {pausa && (
                    <em className="admin-cuotas__pausa">⏸ Pausada del {pausa.desde} al {pausa.hasta} — {pausa.motivo}</em>
                  )}
                </div>
                <div className="admin-cuotas__monto">
                  {s.adeuda > 0
                    ? <><strong className="admin-text-warn">${s.adeuda.toLocaleString('es-AR')}</strong><span>adeudado</span></>
                    : <><strong style={{ color: '#4ade80' }}>$0</strong><span>al día</span></>}
                </div>
                <div className="admin-cuotas__actions">
                  {s.adeuda > 0 && (
                    <button type="button" className="admin-btn admin-btn--ok" onClick={() => onMarcarPagada(s.socio_id)}>✓ Marcar pagada</button>
                  )}
                  {phone && (
                    <a href={`https://wa.me/${phone}?text=${encodeURIComponent('Hola ' + s.nombre + ', te escribo del Club Agronomía Central. ' + (s.adeuda > 0 ? 'Tenés una cuota pendiente de $' + s.adeuda.toLocaleString('es-AR') + '. ¿Coordinamos el pago?' : 'Te recuerdo el pago de la cuota mensual.'))}`}
                      target="_blank" rel="noopener noreferrer"
                      className="admin-btn admin-btn--wa">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884z"/></svg>
                      Recordar
                    </a>
                  )}
                  {pausa
                    ? <button type="button" className="admin-btn admin-btn--ghost" onClick={() => onQuitarPausa(s.socio_id)}>↻ Quitar pausa</button>
                    : <button type="button" className="admin-btn admin-btn--ghost" onClick={() => onPausar(s)}>⏸ Pausar</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// AdminImportar — CSV / TSV / paste desde Excel
// ============================================================
function AdminImportar({ onImportar }) {
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const parse = (text) => {
    setError('');
    if (!text || !text.trim()) { setPreview([]); return; }
    // Detectar separador: tab > coma > punto y coma
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) { setError('Necesitás al menos una fila de headers + una fila de datos.'); setPreview([]); return; }
    const sep = lines[0].includes('\t') ? '\t'
              : lines[0].split(',').length >= lines[0].split(';').length ? ',' : ';';
    const splitLine = (l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
    const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    // Mapeo flexible: aceptamos sinónimos comunes
    const map = (h) => {
      if (['nombre', 'apellido_y_nombre', 'nombre_completo', 'name'].includes(h)) return 'nombre';
      if (['email', 'mail', 'correo'].includes(h)) return 'email';
      if (['dni', 'documento'].includes(h)) return 'dni';
      if (['telefono', 'teléfono', 'celular', 'phone', 'tel'].includes(h)) return 'telefono';
      if (['categoria', 'categoría', 'division', 'división'].includes(h)) return 'categoria';
      if (['dorsal', 'numero', 'número'].includes(h)) return 'dorsal';
      return null;
    };
    const fields = headers.map(map);
    const rows = lines.slice(1).map((l) => {
      const cols = splitLine(l);
      const obj = {};
      fields.forEach((f, i) => { if (f) obj[f] = cols[i] || ''; });
      return obj;
    }).filter((r) => r.nombre || r.email);
    setPreview(rows);
  };

  const onFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target.result || '');
      setRaw(text);
      parse(text);
    };
    reader.readAsText(f, 'utf-8');
  };

  const onPaste = (text) => {
    setRaw(text);
    parse(text);
  };

  return (
    <div className="admin-card admin-card--full">
      <div className="admin-card__head">
        <h3>Importar socios desde Excel / CSV</h3>
        <span>Subí un archivo o pegá las celdas directamente desde Excel/Sheets.</span>
      </div>

      <div className="admin-import">
        <div className="admin-import__step">
          <div className="admin-import__step-num">1</div>
          <div className="admin-import__step-body">
            <h4>Cargá los datos</h4>
            <p>Aceptamos <strong>CSV</strong>, <strong>TSV</strong> o pegado directo desde Excel/Google Sheets. La primera fila debe tener los headers.</p>
            <p className="admin-import__hint">
              Headers reconocidos: <code>nombre</code>, <code>email</code>, <code>dni</code>, <code>telefono</code>, <code>categoria</code>, <code>dorsal</code>.
              No importa si están en mayúsculas, con/sin tilde o con sinónimos (<code>celular</code>, <code>division</code>, etc).
            </p>

            <div className="admin-import__inputs">
              <button type="button" className="admin-toolbar__btn" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                <span>Subir archivo (.csv / .tsv / .txt)</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={onFile} style={{ display: 'none' }} />
              <span className="admin-import__or">o</span>
              <textarea
                value={raw}
                onChange={(e) => onPaste(e.target.value)}
                placeholder={"Pegá acá las celdas copiadas desde Excel\n\nEjemplo:\nnombre\temail\tdni\ttelefono\tcategoria\nJuan Pérez\tjuan@gmail.com\t30123456\t1145678901\t3ra División"}
                rows={6}
                className="admin-import__textarea"
              />
            </div>
          </div>
        </div>

        {error && <div className="modal__error">{error}</div>}

        {preview.length > 0 && (
          <div className="admin-import__step">
            <div className="admin-import__step-num">2</div>
            <div className="admin-import__step-body">
              <h4>Vista previa ({preview.length} socio{preview.length === 1 ? '' : 's'})</h4>
              <p>Revisá que todo se interpretó bien antes de importar.</p>
              <div className="admin-import__preview">
                <div className="admin-import__preview-head">
                  <span>Nombre</span>
                  <span>Email</span>
                  <span>DNI</span>
                  <span>Teléfono</span>
                  <span>Categoría</span>
                </div>
                {preview.slice(0, 25).map((r, i) => (
                  <div key={i} className="admin-import__preview-row">
                    <span>{r.nombre || <em>—</em>}</span>
                    <span>{r.email || <em>—</em>}</span>
                    <span>{r.dni || <em>—</em>}</span>
                    <span>{r.telefono || <em>—</em>}</span>
                    <span>{r.categoria || <em>—</em>}</span>
                  </div>
                ))}
                {preview.length > 25 && <div className="admin-import__preview-more">… y {preview.length - 25} más</div>}
              </div>
              <button type="button" className="admin-toolbar__btn admin-import__commit" onClick={() => onImportar(preview)}>
                ✓ Importar {preview.length} socio{preview.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// AdminChart — barras de cobranza (CSS puro, sin librería)
// ============================================================
function AdminChart({ data }) {
  const max = Math.max(...data.map((d) => d.recaudado + d.adeudado));
  const fmt = (n) => '$' + Math.round(n / 1000) + 'k';
  return (
    <div className="admin-chart">
      <div className="admin-chart__grid">
        {data.map((m) => (
          <div key={m.mes} className="admin-chart__col">
            <div className="admin-chart__bars" title={`${m.mes}: $${m.recaudado.toLocaleString('es-AR')} cobrado, $${m.adeudado.toLocaleString('es-AR')} pendiente`}>
              <div className="admin-chart__bar admin-chart__bar--ok" style={{ height: (m.recaudado / max * 100) + '%' }}>
                <span>{fmt(m.recaudado)}</span>
              </div>
              <div className="admin-chart__bar admin-chart__bar--warn" style={{ height: (m.adeudado / max * 100) + '%' }}>
                <span>{fmt(m.adeudado)}</span>
              </div>
            </div>
            <span className="admin-chart__label">{m.mes}</span>
          </div>
        ))}
      </div>
      <div className="admin-chart__legend">
        <div><span className="admin-chart__dot admin-chart__dot--ok"></span>Recaudado</div>
        <div><span className="admin-chart__dot admin-chart__dot--warn"></span>Adeudado</div>
      </div>
    </div>
  );
}

// ============================================================
// AdminConfig — editar valores de Config visualmente
// ============================================================
function AdminConfig({ config, onSave }) {
  const [form, setForm] = useState(config);
  const dirty = JSON.stringify(form) !== JSON.stringify(config);
  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const submit = (e) => { e.preventDefault(); onSave(form); };
  const reset = () => setForm(config);

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
function DetalleSocioModal({ socio, pausa, pagos, onClose, onMarcarPagada, onPausar, onQuitarPausa, onDesactivar, onReactivar }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // Generar un mini historial de cuotas verosímil para el demo,
  // basado en si el socio tiene deuda o no.
  const meses = ['Enero','Febrero','Marzo','Abril'];
  const cuotasMock = meses.map((mes, i) => {
    const monto = 15000;
    const esEsteMesYDebe = i === meses.length - 1 && socio.adeuda > 0;
    return esEsteMesYDebe
      ? { mes, monto, monto_pagado: 0,     estado: 'pendiente', fecha_pago: '' }
      : { mes, monto, monto_pagado: monto, estado: 'pagado',    fecha_pago: ('0' + (i + 5)).slice(-2) + '/0' + (i + 1) + '/2026' };
  });

  const phone = String(socio.telefono || '').replace(/\D/g, '');
  const initials = String(socio.nombre || 'S')
    .split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

  const estadoLabel = socio.estado === 'desactivado' ? 'Desactivado'
    : pausa ? 'En pausa' : (socio.adeuda > 0 ? 'Con deuda' : 'Al día');
  const estadoClass = socio.estado === 'desactivado' ? 'off'
    : pausa ? 'pausa' : (socio.adeuda > 0 ? 'warn' : 'ok');

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal__box modal__box--xl admin-detalle" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>

        <header className="admin-detalle__head">
          <div className="admin-detalle__avatar">{initials}</div>
          <div className="admin-detalle__head-text">
            <span className="admin-detalle__id">{socio.socio_id}</span>
            <h2>{socio.nombre}</h2>
            <span className={'admin-pill admin-pill--' + estadoClass}>{estadoLabel}</span>
          </div>
        </header>

        <div className="admin-detalle__body">
          <section className="admin-detalle__section">
            <h3>Datos personales</h3>
            <dl className="admin-detalle__data">
              <div><dt>Email</dt><dd>{socio.email || '—'}</dd></div>
              <div><dt>Teléfono</dt><dd>{socio.telefono || '—'}</dd></div>
              <div><dt>Categoría</dt><dd>{socio.categoria || '—'}</dd></div>
              <div><dt>Dorsal</dt><dd>{socio.dorsal ? '#' + socio.dorsal : '—'}</dd></div>
              <div><dt>Último pago</dt><dd>{socio.ultPago || '—'}</dd></div>
              <div><dt>Saldo</dt><dd>{socio.adeuda > 0 ? <strong className="admin-text-warn">${socio.adeuda.toLocaleString('es-AR')}</strong> : '$0 (al día)'}</dd></div>
            </dl>
          </section>

          {pausa && (
            <section className="admin-detalle__section admin-detalle__pausa">
              <h3>⏸ Cuota pausada</h3>
              <p>Desde <strong>{pausa.desde}</strong> hasta <strong>{pausa.hasta}</strong> — {pausa.motivo}.</p>
              <p>Durante este período el sistema no le genera cuotas mensuales.</p>
            </section>
          )}

          <section className="admin-detalle__section">
            <h3>Historial de cuotas (últimos 4 meses)</h3>
            <ul className="admin-detalle__list">
              {cuotasMock.map((c, i) => (
                <li key={i}>
                  <span className="admin-detalle__list-label">{c.mes} 2026</span>
                  <span className={'admin-pill admin-pill--' + (c.estado === 'pagado' ? 'ok' : 'warn')}>
                    {c.estado === 'pagado' ? '✓ Pagado' : '! Pendiente'}
                  </span>
                  <span className="admin-detalle__list-amount">${c.monto.toLocaleString('es-AR')}</span>
                  <span className="admin-detalle__list-date">{c.fecha_pago || '—'}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-detalle__section">
            <h3>Pagos registrados ({pagos.length})</h3>
            {pagos.length === 0 ? (
              <p className="admin-empty">Este socio aún no tiene pagos registrados en el sistema.</p>
            ) : (
              <ul className="admin-detalle__list">
                {pagos.map((p, i) => (
                  <li key={i}>
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
            <button type="button" className="admin-btn admin-btn--ok" onClick={onMarcarPagada}>
              ✓ Marcar deuda pagada
            </button>
          )}
          {phone && (
            <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className="admin-btn admin-btn--wa">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884z"/></svg>
              Contactar
            </a>
          )}
          {socio.estado === 'activo' && (pausa
            ? <button type="button" className="admin-btn admin-btn--ghost" onClick={onQuitarPausa}>↻ Quitar pausa</button>
            : <button type="button" className="admin-btn admin-btn--ghost" onClick={onPausar}>⏸ Pausar cuota</button>)
          }
          {socio.estado === 'activo'
            ? <button type="button" className="admin-btn admin-btn--ghost" onClick={onDesactivar}>Desactivar</button>
            : <button type="button" className="admin-btn admin-btn--ghost" onClick={onReactivar}>Reactivar</button>}
        </footer>
      </div>
    </div>
  );
}

// ============================================================
// PausaCuotaModal — excluir un socio de generación de cuota por un período
// ============================================================
function PausaCuotaModal({ socio, onClose, onConfirm }) {
  const today = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('Ausencia');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (!desde || !hasta) return;
    onConfirm({ desde, hasta, motivo: motivo || 'Ausencia' });
  };

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div className="modal__header">
          <h2>Pausar cuota</h2>
          <p>{socio.nombre} — {socio.socio_id}<br/>Durante el período pausado, el sistema no le genera cuotas mensuales.</p>
        </div>
        <form onSubmit={submit} className="modal__form modal__form--grid">
          <div className="modal__field">
            <label>Desde *</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
          </div>
          <div className="modal__field">
            <label>Hasta *</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} min={desde} required />
          </div>
          <div className="modal__field modal__field--full">
            <label>Motivo</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option>Ausencia</option>
              <option>Lesión / médico</option>
              <option>Beca temporal</option>
              <option>Suspensión deportiva</option>
              <option>Otro</option>
            </select>
          </div>
          <button type="submit" className="modal__submit modal__field--full">Aplicar pausa</button>
          <p className="modal__disclaimer modal__field--full">
            Las cuotas que ya están generadas y vencidas <strong>no se borran</strong> — la pausa solo afecta la generación futura.
          </p>
        </form>
      </div>
    </div>
  );
}

function NewSocioModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ nombre: '', email: '', dni: '', telefono: '', dorsal: '', categoria: '3ra División' });
  const [err, setErr] = useState('');
  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    if (!form.nombre || !form.email || !form.dni) { setErr('Nombre, email y DNI son obligatorios.'); return; }
    onCreate(form);
  };
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal__box modal__box--wide" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div className="modal__header">
          <img src="/media/logo.jpeg" alt="AC" className="modal__logo" />
          <h2>Cargar socio nuevo</h2>
          <p>Alta manual desde el panel admin. La contraseña se la pasás vos al socio.</p>
        </div>
        <form onSubmit={submit} className="modal__form modal__form--grid">
          <div className="modal__field modal__field--full">
            <label>Nombre y apellido *</label>
            <input name="nombre" value={form.nombre} onChange={onChange} maxLength={80} autoFocus />
          </div>
          <div className="modal__field">
            <label>DNI *</label>
            <input name="dni" value={form.dni} onChange={onChange} maxLength={10} inputMode="numeric" />
          </div>
          <div className="modal__field">
            <label>Teléfono</label>
            <input name="telefono" value={form.telefono} onChange={onChange} maxLength={25} />
          </div>
          <div className="modal__field modal__field--full">
            <label>Email *</label>
            <input name="email" type="email" value={form.email} onChange={onChange} maxLength={120} />
          </div>
          <div className="modal__field">
            <label>Dorsal</label>
            <input name="dorsal" value={form.dorsal} onChange={onChange} maxLength={3} inputMode="numeric" />
          </div>
          <div className="modal__field">
            <label>Categoría</label>
            <select name="categoria" value={form.categoria} onChange={onChange}>
              <option>3ra División</option>
              <option>División de Honor</option>
              <option>Inferiores</option>
              <option>Socio simpatizante</option>
            </select>
          </div>
          {err && <div className="modal__error modal__field--full">{err}</div>}
          <button type="submit" className="modal__submit modal__field--full">Crear socio</button>
          <p className="modal__disclaimer modal__field--full">
            En la integración real, esto guarda la fila en la hoja Socios con estado=activo y manda mail al socio con sus credenciales.
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
          {!loggedUser && <a href="#sumate" className="hero__btn hero__btn--ghost">Sumate al plantel</a>}
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

      <a href="#nosotros" className="hero__scroll" aria-label="Desplazar hacia abajo">
        <span></span>
      </a>
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
    <section id="plantel" className="team">
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
            </div>
            <div className="team__card-info">
              <span className="team__card-role">Jugador</span>
              <h3>Plantel Superior</h3>
              <p>Compromiso, experiencia y liderazgo dentro de la cancha.</p>
            </div>
          </article>

          <article className="team__card reveal">
            <div className="team__card-image">
              <img src="/media/jugador2.jpeg" alt="Jugador del plantel" loading="lazy" />
              <span className="team__card-number">AC</span>
            </div>
            <div className="team__card-info">
              <span className="team__card-role">Jugador</span>
              <h3>División de Honor</h3>
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
const EMPTY = { nombre: '', email: '', telefono: '', categoria: '', experiencia: '', mensaje: '' };

function JoinUs() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    const max = name === 'mensaje' ? 500 : 120;
    setForm((p) => ({ ...p, [name]: value.slice(0, max) }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: null }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit('joinUs', 5000)) { setStatus('error'); return; }
    const errs = {};
    if (!isValidName(form.nombre)) errs.nombre = 'Ingresá un nombre válido (2-80 caracteres).';
    if (!isValidEmail(form.email)) errs.email = 'Ingresá un email válido.';
    if (!isValidPhone(form.telefono)) errs.telefono = 'Ingresá un teléfono válido.';
    if (!form.categoria) errs.categoria = 'Seleccioná una categoría.';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    const safe = {
      nombre: sanitizeText(form.nombre),
      email: sanitizeText(form.email),
      telefono: sanitizeText(form.telefono),
      categoria: sanitizeText(form.categoria),
      experiencia: sanitizeText(form.experiencia),
      mensaje: sanitizeText(form.mensaje)
    };

    setTimeout(() => {
      console.log('[AC] Datos seguros:', safe);
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

            <div className="join__row">
              <div className="join__field">
                <label htmlFor="categoria">Categoría *</label>
                <select id="categoria" name="categoria" value={form.categoria} onChange={onChange}
                  className={errors.categoria ? 'error' : ''}>
                  <option value="">Seleccionar...</option>
                  <option value="2008">2008</option>
                  <option value="2007">2007</option>
                  <option value="2006">2006</option>
                  <option value="otra">Otra</option>
                </select>
                {errors.categoria && <span className="join__error">{errors.categoria}</span>}
              </div>
              <div className="join__field">
                <label htmlFor="experiencia">Experiencia en futsal</label>
                <select id="experiencia" name="experiencia" value={form.experiencia} onChange={onChange}>
                  <option value="">Seleccionar...</option>
                  <option value="si-federado">Sí, jugué federado</option>
                  <option value="si-amateur">Sí, nivel amateur</option>
                  <option value="poca">Poca experiencia</option>
                  <option value="no">Recién empiezo</option>
                </select>
              </div>
            </div>

            <div className="join__field">
              <label htmlFor="mensaje">Mensaje (opcional)</label>
              <textarea id="mensaje" name="mensaje" rows="4" value={form.mensaje} onChange={onChange}
                maxLength={500} placeholder="Contanos brevemente tu trayectoria..." />
              <span className="join__counter">{form.mensaje.length}/500</span>
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
              <h4>Navegación</h4>
              <ul>
                <li><a href="#inicio">Inicio</a></li>
                <li><a href="#nosotros">Nosotros</a></li>
                <li><a href="#plantel">Plantel</a></li>
                <li><a href="#coordinador">Coordinador</a></li>
              </ul>
            </div>
            <div className="footer__col">
              <h4>El club</h4>
              <ul>
                <li><a href="#instalaciones">Instalaciones</a></li>
                <li><a href="#fixture">Fixture</a></li>
                <li><a href="#sumate">Sumate</a></li>
                <li><a href="#contacto">Contacto</a></li>
              </ul>
            </div>
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
          <p className="footer__league">Participa en <strong>LAAMBA</strong> · Liga B · División de Honor</p>
        </div>
      </div>
    </footer>
  );
}

// ============================================================
// APP raíz
// ============================================================
// ============================================================
// DATOS DE DEMO — sesión de ejemplo para mostrar el portal sin login real.
// Se muestran al apretar "Ingresar". Cuando vuelva el flujo de login real,
// remover esto y restaurar el modal.
// ============================================================
const DEMO_SESSION = {
  token: 'demo-token',
  user: {
    socio_id: 'AC-0001',
    email: 'demo@agronomiacentral.com.ar',
    nombre: 'Jugador Agronomo',
    dorsal: '10',
    categoria: '3ra División · División de Honor',
    telefono: '1145242225',
    fecha_alta: '2025-08-10',
    estado: 'deuda',
    estado_cuenta: 'activo'
  },
  cuotas: [
    { cuota_id: 'AC-0001-202604', mes: 'Abril',   anio: 2026, monto: 15000, monto_pagado: 0,     recargo: 0,    saldo: 15000, total_cobrar: 15000, estado: 'pendiente', fecha_vencimiento: '2026-04-10', fecha_pago: '' },
    { cuota_id: 'AC-0001-202603', mes: 'Marzo',   anio: 2026, monto: 15000, monto_pagado: 8000,  recargo: 0,    saldo: 7000,  total_cobrar: 15000, estado: 'parcial',   fecha_vencimiento: '2026-03-10', fecha_pago: '' },
    { cuota_id: 'AC-0001-202602', mes: 'Febrero', anio: 2026, monto: 15000, monto_pagado: 0,     recargo: 3000, saldo: 18000, total_cobrar: 18000, estado: 'pendiente', fecha_vencimiento: '2026-02-10', fecha_pago: '' },
    { cuota_id: 'AC-0001-202601', mes: 'Enero',   anio: 2026, monto: 15000, monto_pagado: 15000, recargo: 0,    saldo: 0,     total_cobrar: 15000, estado: 'pagado',    fecha_vencimiento: '2026-01-10', fecha_pago: '08/01/2026' }
  ],
  config: {
    titular: 'Club S. y D. Agronomía Central',
    cuit: '30-12345678-9',
    cbu: '0110012345678901234567',
    alias: 'AGRONOMIA.CENTRAL.AC',
    mp_alias: 'agronomiacentral.mp',
    mp_link: '',
    mp_enabled: false,
    whatsapp: '541145242225',
    telefono_secretaria: '+541145242225',
    direccion_pago: 'Bauness 958',
    horario_pago: 'Lun a Vie 18 a 22 hs · Sábados 10 a 14 hs',
    dia_debito: 'Los 5 de cada mes'
  }
};

// ============================================================
// DATOS DEMO DEL PANEL ADMIN — sólo para presentación al cliente.
// Mezcla socios al día, con deuda, parciales, recién registrados y
// solicitudes pendientes para que la vista se vea poblada.
// ============================================================
const ADMIN_DEMO = {
  socios: [
    { socio_id: 'AC-0001', nombre: 'Juan Pérez',          dorsal: '7',  categoria: '3ra División',     estado: 'activo',     adeuda: 0,     ultPago: '05/04/2026', telefono: '+541123456701', email: 'juan.perez@gmail.com' },
    { socio_id: 'AC-0002', nombre: 'Martín González',     dorsal: '10', categoria: '3ra División',     estado: 'activo',     adeuda: 30000, ultPago: '15/02/2026', telefono: '+541123456702', email: 'martin.g@gmail.com' },
    { socio_id: 'AC-0003', nombre: 'Pablo Martínez',      dorsal: '4',  categoria: 'División de Honor',estado: 'activo',     adeuda: 0,     ultPago: '03/04/2026', telefono: '+541123456703', email: 'pablo.m@hotmail.com' },
    { socio_id: 'AC-0004', nombre: 'Sergio Rodríguez',    dorsal: '9',  categoria: '3ra División',     estado: 'activo',     adeuda: 18000, ultPago: '02/02/2026', telefono: '+541123456704', email: 'sergio.r@gmail.com' },
    { socio_id: 'AC-0005', nombre: 'Lucas Fernández',     dorsal: '11', categoria: 'División de Honor',estado: 'activo',     adeuda: 7000,  ultPago: '20/03/2026', telefono: '+541123456705', email: 'lucas.f@gmail.com' },
    { socio_id: 'AC-0006', nombre: 'Diego Romero',        dorsal: '5',  categoria: '3ra División',     estado: 'activo',     adeuda: 0,     ultPago: '05/04/2026', telefono: '+541123456706', email: 'diego.r@yahoo.com' },
    { socio_id: 'AC-0007', nombre: 'Federico Acosta',     dorsal: '3',  categoria: '3ra División',     estado: 'activo',     adeuda: 45000, ultPago: '10/01/2026', telefono: '+541123456707', email: 'fede.acosta@gmail.com' },
    { socio_id: 'AC-0008', nombre: 'Nicolás Sánchez',     dorsal: '1',  categoria: 'División de Honor',estado: 'activo',     adeuda: 0,     ultPago: '04/04/2026', telefono: '+541123456708', email: 'nico.s@gmail.com' },
    { socio_id: 'AC-0009', nombre: 'Ezequiel Torres',     dorsal: '8',  categoria: '3ra División',     estado: 'activo',     adeuda: 0,     ultPago: '06/04/2026', telefono: '+541123456709', email: 'eze.torres@gmail.com' },
    { socio_id: 'AC-0010', nombre: 'Maximiliano López',   dorsal: '6',  categoria: '3ra División',     estado: 'activo',     adeuda: 15000, ultPago: '08/03/2026', telefono: '+541123456710', email: 'max.lopez@gmail.com' },
    { socio_id: 'AC-0011', nombre: 'Hernán Castro',       dorsal: '2',  categoria: 'Inferiores',       estado: 'activo',     adeuda: 0,     ultPago: '04/04/2026', telefono: '+541123456711', email: 'hernan.c@gmail.com' },
    { socio_id: 'AC-0012', nombre: 'Gabriel Núñez',       dorsal: '14', categoria: 'División de Honor',estado: 'activo',     adeuda: 22000, ultPago: '15/02/2026', telefono: '+541123456712', email: 'gabriel.n@gmail.com' },
    { socio_id: 'AC-0013', nombre: 'Julián Vega',         dorsal: '13', categoria: '3ra División',     estado: 'activo',     adeuda: 0,     ultPago: '01/04/2026', telefono: '+541123456713', email: 'julian.v@gmail.com' },
    { socio_id: 'AC-0014', nombre: 'Ramiro Suárez',       dorsal: '17', categoria: 'Inferiores',       estado: 'activo',     adeuda: 12000, ultPago: '15/03/2026', telefono: '+541123456714', email: 'ramiro.s@gmail.com' },
    { socio_id: 'AC-0015', nombre: 'Iván Molina',         dorsal: '20', categoria: '3ra División',     estado: 'activo',     adeuda: 0,     ultPago: '05/04/2026', telefono: '+541123456715', email: 'ivan.m@gmail.com' },
    { socio_id: 'AC-0016', nombre: 'Tomás Aguirre',       dorsal: '15', categoria: 'División de Honor',estado: 'activo',     adeuda: 18000, ultPago: '20/02/2026', telefono: '+541123456716', email: 'tomas.a@gmail.com' },
    { socio_id: 'AC-0017', nombre: 'Cristian Bravo',      dorsal: '16', categoria: '3ra División',     estado: 'activo',     adeuda: 60000, ultPago: '15/12/2025', telefono: '+541123456717', email: 'cris.b@gmail.com' },
    { socio_id: 'AC-0018', nombre: 'Matías Herrera',      dorsal: '19', categoria: 'Inferiores',       estado: 'activo',     adeuda: 0,     ultPago: '03/04/2026', telefono: '+541123456718', email: 'matias.h@gmail.com' },
    { socio_id: 'AC-0019', nombre: 'Esteban Morales',     dorsal: '21', categoria: 'División de Honor',estado: 'desactivado',adeuda: 0,     ultPago: '10/11/2025', telefono: '+541123456719', email: 'esteban.m@gmail.com' },
    { socio_id: 'AC-0020', nombre: 'Damián Ríos',         dorsal: '12', categoria: '3ra División',     estado: 'activo',     adeuda: 30000, ultPago: '08/02/2026', telefono: '+541123456720', email: 'damian.r@gmail.com' }
  ],
  solicitudes: [
    { socio_id: 'AC-0021', nombre: 'Pedro Silva',     dni: '32456789', email: 'pedro.silva@gmail.com',  telefono: '+541123456721', categoria: '3ra División',     fecha_alta: '2026-04-25' },
    { socio_id: 'AC-0022', nombre: 'Andrés Quintero', dni: '34567891', email: 'andres.q@hotmail.com',   telefono: '+541123456722', categoria: 'División de Honor',fecha_alta: '2026-04-26' },
    { socio_id: 'AC-0023', nombre: 'Luciano Paz',     dni: '35678901', email: 'luciano.paz@yahoo.com',  telefono: '+541123456723', categoria: 'Inferiores',       fecha_alta: '2026-04-26' },
    { socio_id: 'AC-0024', nombre: 'Mauro Galíndez',  dni: '36789012', email: 'mauro.g@gmail.com',      telefono: '+541123456724', categoria: '3ra División',     fecha_alta: '2026-04-27' },
    { socio_id: 'AC-0025', nombre: 'Bruno Cabrera',   dni: '37890123', email: 'bruno.cabrera@gmail.com',telefono: '+541123456725', categoria: 'Socio simpatizante', fecha_alta: '2026-04-27' }
  ],
  pagosRecientes: [
    { fecha: '2026-04-27 14:32', socio_id: 'AC-0009', socio: 'Ezequiel Torres',  monto: 15000, metodo: 'mp',           estado: 'confirmado',  ref: 'pref_8842931' },
    { fecha: '2026-04-27 11:08', socio_id: 'AC-0001', socio: 'Juan Pérez',       monto: 15000, metodo: 'mp',           estado: 'confirmado',  ref: 'pref_8842712' },
    { fecha: '2026-04-26 19:45', socio_id: 'AC-0006', socio: 'Diego Romero',     monto: 15000, metodo: 'transferencia',estado: 'confirmado',  ref: 'comp-3521' },
    { fecha: '2026-04-26 18:20', socio_id: 'AC-0015', socio: 'Iván Molina',      monto: 15000, metodo: 'mp',           estado: 'confirmado',  ref: 'pref_8841056' },
    { fecha: '2026-04-26 16:10', socio_id: 'AC-0011', socio: 'Hernán Castro',    monto: 15000, metodo: 'efectivo',     estado: 'confirmado',  ref: '-' },
    { fecha: '2026-04-26 12:54', socio_id: 'AC-0008', socio: 'Nicolás Sánchez',  monto: 15000, metodo: 'mp',           estado: 'confirmado',  ref: 'pref_8839871' },
    { fecha: '2026-04-26 10:32', socio_id: 'AC-0013', socio: 'Julián Vega',      monto: 15000, metodo: 'transferencia',estado: 'confirmado',  ref: 'comp-3518' },
    { fecha: '2026-04-25 22:18', socio_id: 'AC-0018', socio: 'Matías Herrera',   monto: 15000, metodo: 'mp',           estado: 'confirmado',  ref: 'pref_8838204' },
    { fecha: '2026-04-25 20:05', socio_id: 'AC-0003', socio: 'Pablo Martínez',   monto: 15000, metodo: 'mp',           estado: 'confirmado',  ref: 'pref_8837998' },
    { fecha: '2026-04-25 11:40', socio_id: 'AC-0005', socio: 'Lucas Fernández',  monto: 8000,  metodo: 'transferencia',estado: 'confirmado',  ref: 'comp-3505 (parcial)' },
    { fecha: '2026-04-24 18:14', socio_id: 'AC-0014', socio: 'Ramiro Suárez',    monto: 15000, metodo: 'mp',           estado: 'confirmado',  ref: 'pref_8835120' },
    { fecha: '2026-04-24 09:50', socio_id: 'AC-0023', socio: 'Pedro Silva',      monto: 15000, metodo: 'mp',           estado: 'iniciado',    ref: 'pref_8834911' }
  ]
};

export default function App() {
  const [session, setSession] = useState(null); // { token, user, cuotas, config }
  // mode declarado arriba para que el useEffect del IntersectionObserver lo
  // pueda usar en sus deps sin caer en temporal dead zone.
  const [mode, setMode] = useState(null); // null | 'jugador' | 'admin'

  // Restaurar sesión persistida al montar (si hay token vigente, refrescamos
  // los datos contra el server por si hubo cambios en cuotas o config).
  useEffect(() => {
    const stored = loadSession();
    if (!stored) return;
    setSession(stored);
    refreshSession(stored.token).then((res) => {
      if (res && res.ok) {
        const fresh = { token: res.token || stored.token, user: res.user, cuotas: res.cuotas, config: res.config };
        setSession(fresh);
        saveSession(fresh);
      } else {
        // token inválido o expirado server-side
        clearSession();
        setSession(null);
      }
    });
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
    // Reobservar cuando cambia el modo o la sesión (aparece el portal/admin con
    // sus propios elementos .reveal). Sin esto, las secciones nuevas quedan
    // ocultas porque arrancan con opacity:0 hasta que el observer las marque.
    const t = setTimeout(run, 100);
    const t2 = setTimeout(run, 300); // safety net adicional
    return () => { observer.disconnect(); clearTimeout(t); clearTimeout(t2); };
  }, [session, mode]);

  // En modo demo, "Soy Jugador" entra al portal del socio con datos de ejemplo,
  // y "CSM Admin" entra al panel administrativo. Cuando volvamos a habilitar
  // login real, restaurar el LoginModal y handleLogin que llama a loginUser().
  const enterJugador = () => {
    setMode('jugador');
    setSession(DEMO_SESSION);
    saveSession(DEMO_SESSION);
    setTimeout(() => {
      const el = document.getElementById('portal');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const enterAdmin = () => {
    setMode('admin');
    setSession(null); // el admin no necesita sesión de socio
    setTimeout(() => {
      const el = document.getElementById('admin');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setMode(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // El navbar muestra "Salir" cuando hay alguien logueado (jugador o admin)
  const loggedUser = mode === 'jugador' && session
    ? session.user
    : mode === 'admin'
      ? { nombre: 'Admin del Club' }
      : null;

  return (
    <>
      <Navbar
        onLoginClick={enterJugador}
        onAdminClick={enterAdmin}
        loggedUser={loggedUser}
        onLogout={handleLogout}
      />
      <main>
        <Hero
          onLoginClick={enterJugador}
          onAdminClick={enterAdmin}
          loggedUser={loggedUser}
        />
        {mode === 'jugador' && session && (
          <PortalSocio
            user={session.user}
            cuotas={session.cuotas}
            config={session.config}
            token={session.token}
            onSessionUpdate={(updated) => {
              const fresh = {
                token: updated.token || session.token,
                user: updated.user,
                cuotas: updated.cuotas || [],
                config: updated.config || session.config
              };
              setSession(fresh);
              saveSession(fresh);
            }}
          />
        )}
        {mode === 'admin' && <PortalAdmin onLogout={handleLogout} />}
        <About />
        <Team />
        <Coordinator />
        <Facilities />
        <Fixture />
        <Gallery />
        <JoinUs />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
