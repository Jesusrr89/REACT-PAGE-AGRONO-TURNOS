/**
 * Sesión del socio en el browser.
 *
 * Persistimos en sessionStorage (no localStorage) para que la sesión muera al
 * cerrar la pestaña. El token tiene TTL de 30 min server-side, pero también
 * lo validamos client-side para no mostrar UI con datos viejos.
 */

const STORAGE_KEY = 'ac_session_v1';
const CLIENT_TTL_MS = 30 * 60 * 1000;

export function saveSession(payload) {
  try {
    const data = {
      token: payload.token,
      user: payload.user,
      cuotas: payload.cuotas || [],
      config: payload.config || {},
      savedAt: Date.now()
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* storage lleno o deshabilitado: ignorar */ }
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.token || !data.user) return null;
    if (Date.now() - (data.savedAt || 0) > CLIENT_TTL_MS) {
      clearSession();
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

export function clearSession() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
}
