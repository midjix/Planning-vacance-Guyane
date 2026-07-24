// Télémétrie de diagnostic : remonte ce qui marche et ce qui casse chez les
// utilisateurs (uploads, miniatures, aperçus, erreurs JS), pour le tableau de
// bord admin. Les événements sont mis en tampon puis envoyés par lots.
import { getToken, getUsername } from './auth';

const ENDPOINT = '/api/events';
const FLUSH_DELAY = 4000;
const MAX_BUFFER = 20;

let buffer = [];
let timer = null;

// Contexte appareil : indispensable pour repérer les bugs propres au mobile.
const context = () => {
  const ua = navigator.userAgent || '';
  let browser = 'autre';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = 'autre';
  if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return {
    device: /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? 'mobile' : 'ordinateur',
    browser,
    os,
    path: window.location.pathname,
    user: getUsername() || undefined,
  };
};

export const flush = (viaBeacon = false) => {
  if (timer) { clearTimeout(timer); timer = null; }
  if (buffer.length === 0) return;
  const payload = JSON.stringify({ events: buffer });
  buffer = [];
  try {
    // Au déchargement de la page, seul sendBeacon part de façon fiable.
    if (viaBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
      return;
    }
    const token = getToken();
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch (err) { /* la télémétrie ne doit jamais casser l'app */ }
};

export const track = (type, data = {}) => {
  try {
    buffer.push({ type, ...context(), ...data });
    if (buffer.length >= MAX_BUFFER) flush();
    else if (!timer) timer = setTimeout(() => flush(), FLUSH_DELAY);
  } catch (err) { /* ignore */ }
};

// Capture les erreurs JS silencieuses (celles que les utilisateurs ne signalent jamais).
export const installGlobalErrorTracking = () => {
  window.addEventListener('error', (e) => {
    track('js_error', { detail: `${e.message || 'erreur'} @ ${(e.filename || '').split('/').pop()}:${e.lineno || 0}` });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    track('js_error', { detail: `promesse rejetée: ${(r && (r.message || r)) || 'inconnue'}` });
  });
  // Envoi de ce qui reste en tampon quand la page se ferme.
  window.addEventListener('pagehide', () => flush(true));
};
