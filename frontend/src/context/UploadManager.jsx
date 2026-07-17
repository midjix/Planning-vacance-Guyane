import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { getToken } from '../utils/auth';

// Gestionnaire d'upload global : vit à la racine de l'app pour que les transferts
// continuent pendant la navigation. Progression + temps restant par fichier.
//
// Les fichiers ≤ 50 Mo partent en une seule requête. Au-delà, ils sont découpés
// en morceaux de 20 Mo (chacun sous la limite de 100 Mo du tunnel Cloudflare),
// réassemblés côté serveur, avec reprise par morceau en cas d'erreur réseau.

const UploadContext = createContext(null);
export const useUploads = () => useContext(UploadContext);

const SINGLE_MAX = 50 * 1024 * 1024;   // seuil au-delà duquel on découpe
const CHUNK_SIZE = 20 * 1024 * 1024;   // taille d'un morceau
const CHUNK_RETRIES = 3;               // tentatives par morceau

let counter = 0;

// XHR encapsulé dans une Promise, avec progression d'upload et annulation.
function xhrRequest({ method, url, body, headers, onProgress, item }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    item.xhr = xhr;
    xhr.open(method, url);
    Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    if (onProgress && xhr.upload) xhr.upload.onprogress = onProgress;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr);
      } else {
        let msg = `Échec (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) { /* ignore */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Erreur réseau'));
    xhr.onabort = () => reject(Object.assign(new Error('Annulé'), { canceled: true }));
    xhr.send(body);
  });
}

export const UploadProvider = ({ children }) => {
  const [uploads, setUploads] = useState([]);
  const queueRef = useRef([]);
  const currentRef = useRef(null);
  const runningRef = useRef(false);

  const patch = useCallback((id, changes) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  }, []);

  const runItem = useCallback(async (item) => {
    const { id, activityId, file } = item;
    const authHeader = { Authorization: `Bearer ${getToken()}` };
    const started = Date.now();
    const report = (loaded) => {
      const elapsed = (Date.now() - started) / 1000;
      const speed = elapsed > 0 ? loaded / elapsed : 0;
      const eta = speed > 0 ? (file.size - loaded) / speed : null;
      patch(id, { loaded, speed, eta, status: 'uploading' });
    };
    patch(id, { status: 'uploading' });

    if (file.size <= SINGLE_MAX) {
      const form = new FormData();
      form.append('photos', file);
      await xhrRequest({ method: 'POST', url: `/api/activities/${activityId}/photos`, body: form, headers: authHeader, onProgress: (e) => report(e.loaded), item });
    } else {
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const startRes = await xhrRequest({
        method: 'POST',
        url: `/api/activities/${activityId}/uploads`,
        body: JSON.stringify({ filename: file.name, size: file.size, mimetype: file.type || 'application/octet-stream', totalChunks }),
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        item,
      });
      const { uploadId, received = [] } = JSON.parse(startRes.responseText);
      const done = new Set(received);
      for (let i = 0; i < totalChunks; i += 1) {
        if (item.canceled) throw Object.assign(new Error('Annulé'), { canceled: true });
        const base = i * CHUNK_SIZE;
        if (done.has(i)) { report(Math.min(base + CHUNK_SIZE, file.size)); continue; }
        const chunk = file.slice(base, Math.min(base + CHUNK_SIZE, file.size));
        let attempt = 0;
        // Reprise par morceau : on retente le même morceau en cas d'erreur réseau.
        for (;;) {
          try {
            await xhrRequest({
              method: 'PUT',
              url: `/api/activities/${activityId}/uploads/${uploadId}/chunks/${i}`,
              body: chunk,
              headers: { ...authHeader, 'Content-Type': 'application/octet-stream' },
              onProgress: (e) => report(base + e.loaded),
              item,
            });
            break;
          } catch (err) {
            if (err.canceled) throw err;
            attempt += 1;
            if (attempt > CHUNK_RETRIES) throw err;
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }
      await xhrRequest({ method: 'POST', url: `/api/activities/${activityId}/uploads/${uploadId}/complete`, body: '{}', headers: { ...authHeader, 'Content-Type': 'application/json' }, item });
    }
    patch(id, { loaded: file.size, status: 'done', eta: 0 });
  }, [patch]);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift();
      currentRef.current = item;
      if (item.canceled) { patch(item.id, { status: 'canceled' }); currentRef.current = null; continue; }
      try {
        await runItem(item);
      } catch (err) {
        if (err.canceled || item.canceled) patch(item.id, { status: 'canceled' });
        else patch(item.id, { status: 'error', error: err.message });
      }
      currentRef.current = null;
    }
    runningRef.current = false;
  }, [runItem, patch]);

  const enqueue = useCallback((activityId, files) => {
    const items = Array.from(files).map((file) => ({ id: ++counter, activityId, file, canceled: false, xhr: null }));
    setUploads((prev) => [
      ...prev,
      ...items.map((it) => ({ id: it.id, activityId, name: it.file.name, size: it.file.size, loaded: 0, speed: 0, eta: null, status: 'queued', error: null })),
    ]);
    queueRef.current.push(...items);
    pump();
  }, [pump]);

  const cancel = useCallback((id) => {
    const cur = currentRef.current;
    if (cur && cur.id === id) {
      cur.canceled = true;
      if (cur.xhr) cur.xhr.abort();
      return;
    }
    const q = queueRef.current.find((x) => x.id === id);
    if (q) { q.canceled = true; patch(id, { status: 'canceled' }); }
  }, [patch]);

  const dismiss = useCallback((id) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status === 'uploading' || u.status === 'queued'));
  }, []);

  // Avertit avant de recharger/fermer l'onglet tant qu'un transfert est actif
  // (un rechargement interrompt l'upload, l'objet fichier étant alors perdu).
  const hasActive = uploads.some((u) => u.status === 'uploading' || u.status === 'queued');
  useEffect(() => {
    if (!hasActive) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasActive]);

  return (
    <UploadContext.Provider value={{ uploads, enqueue, cancel, dismiss, clearFinished, hasActive }}>
      {children}
    </UploadContext.Provider>
  );
};
