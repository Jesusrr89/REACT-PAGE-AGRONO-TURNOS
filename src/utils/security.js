/**
 * Sanitiza texto usando el parser del navegador.
 * Convierte cualquier HTML en entidades seguras (escape), previniendo XSS.
 */
export function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  const el = document.createElement('div');
  el.textContent = input;
  return el.innerHTML.trim();
}

export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const t = email.trim();
  if (t.length > 254) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(t);
}

export function isValidPhone(phone) {
  if (typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-().]/g, '');
  return /^\+?[0-9]{8,15}$/.test(cleaned);
}

export function isValidName(name) {
  if (typeof name !== 'string') return false;
  const t = name.trim();
  if (t.length < 2 || t.length > 80) return false;
  return /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(t);
}

// Rate limiter en memoria (evita spam de envíos en la misma sesión)
const submissionLog = new Map();

export function canSubmit(key, cooldownMs = 5000) {
  const now = Date.now();
  const last = submissionLog.get(key) || 0;
  if (now - last < cooldownMs) return false;
  submissionLog.set(key, now);
  return true;
}
