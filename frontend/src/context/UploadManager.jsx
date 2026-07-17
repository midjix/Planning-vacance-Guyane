import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { getToken } from '../utils/auth';

// Gestionnaire d'upload global : vit à la racine de l'app pour que les transferts
// continuent pendant la navigation entre les pages. Chaque fichier est envoyé
// individuellement en XHR pour disposer d'une progression + estimation du temps
// restant, une par fichier.

const UploadContext = createContext(null);
export const useUploads = () => useContext(UploadContext);

let counter = 0;

export const UploadProvider = ({ children }) => {
  const [uploads, setUploads] = useState([]);
  const queueRef = useRef([]);       // items en attente { id, activityId, file }
  const currentRef = useRef(null);   // item en cours (avec .xhr)

  const patch = useCallback((id, changes) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  }, []);

  const processNext = useCallback(() => {
    if (currentRef.current) return;              // déjà un transfert en cours
    const item = queueRef.current.shift();
    if (!item) return;
    currentRef.current = item;

    const { id, activityId, file } = item;
    const xhr = new XMLHttpRequest();
    item.xhr = xhr;
    const start = Date.now();

    xhr.upload.onprogress = (e) => {
      const elapsed = (Date.now() - start) / 1000;
      const speed = elapsed > 0 ? e.loaded / elapsed : 0;               // octets/s
      const eta = speed > 0 ? (file.size - e.loaded) / speed : null;    // secondes
      patch(id, { loaded: e.loaded, speed, eta, status: 'uploading' });
    };

    const finish = (changes) => {
      currentRef.current = null;
      patch(id, changes);
      setTimeout(processNext, 0);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finish({ loaded: file.size, status: 'done', eta: 0 });
      } else {
        let error = `Échec (${xhr.status})`;
        try { error = JSON.parse(xhr.responseText).error || error; } catch (e) { /* ignore */ }
        finish({ status: 'error', error });
      }
    };
    xhr.onerror = () => finish({ status: 'error', error: 'Erreur réseau' });
    xhr.onabort = () => finish({ status: 'canceled' });

    const form = new FormData();
    form.append('photos', file);
    xhr.open('POST', `/api/activities/${activityId}/photos`);
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
    patch(id, { status: 'uploading' });
    xhr.send(form);
  }, [patch]);

  const enqueue = useCallback((activityId, files) => {
    const items = Array.from(files).map((file) => ({ id: ++counter, activityId, file }));
    setUploads((prev) => [
      ...prev,
      ...items.map((it) => ({
        id: it.id,
        activityId,
        name: it.file.name,
        size: it.file.size,
        loaded: 0,
        speed: 0,
        eta: null,
        status: 'queued',
        error: null,
      })),
    ]);
    queueRef.current.push(...items);
    processNext();
  }, [processNext]);

  const cancel = useCallback((id) => {
    if (currentRef.current && currentRef.current.id === id) {
      currentRef.current.xhr.abort();
      return;
    }
    queueRef.current = queueRef.current.filter((x) => x.id !== id);
    patch(id, { status: 'canceled' });
  }, [patch]);

  const dismiss = useCallback((id) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status === 'uploading' || u.status === 'queued'));
  }, []);

  return (
    <UploadContext.Provider value={{ uploads, enqueue, cancel, dismiss, clearFinished }}>
      {children}
    </UploadContext.Provider>
  );
};
