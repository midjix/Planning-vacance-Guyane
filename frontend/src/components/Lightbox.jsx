import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { track } from '../utils/telemetry';

const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'];
const isVideo = (name) => VIDEO_EXT.includes(name.slice(name.lastIndexOf('.')).toLowerCase());

// Visionneuse plein écran : image en grand, vidéo streamée (Range) avec lecteur.
const Lightbox = ({ items, index, streamUrl, onClose, onIndex, onSave }) => {
  const item = items[index];
  const [hd, setHd] = useState(false); // par défaut : version allégée (lecture fluide)

  useEffect(() => { setHd(false); }, [index]); // repart en qualité fluide à chaque média

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose, onIndex]);

  if (!item) return null;
  const url = streamUrl(item.name);
  const video = isVideo(item.name);
  const videoSrc = hd ? `${url}&hd=1` : url;
  const lowReady = item.lowStatus === 'ready';

  return (
    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      {/* Barre d'actions */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 z-10">
        <span className="text-white/70 text-sm">{index + 1} / {items.length}</span>
        <div className="flex items-center gap-2">
          {video && (
            <button
              onClick={(e) => { e.stopPropagation(); track('video_quality_toggle', { kind: 'video', detail: !hd ? 'vers HD' : 'vers allégée' }); setHd((h) => !h); }}
              title={hd ? 'Repasser en qualité fluide' : 'Passer en HD (bonne connexion)'}
              className={`px-2.5 py-2 rounded-lg text-xs font-bold transition-colors ${hd ? 'bg-green-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {hd ? 'HD' : (lowReady ? 'SD' : 'HD')}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); if (onSave) onSave(item.name); }}
            title="Enregistrer / télécharger"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <Download className="w-5 h-5" />
          </button>
          <button onClick={onClose} title="Fermer" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Précédent */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}
          className="absolute left-2 md:left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Précédent"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}

      {/* Média */}
      <div className="max-w-[92vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {video ? (
          <video
            key={`${item.name}-${hd}`}
            src={videoSrc}
            controls
            autoPlay
            playsInline
            className="max-w-[92vw] max-h-[85vh] rounded-lg bg-black"
            onPlaying={() => track('preview_ok', { kind: 'video', size: item.size, detail: hd ? 'HD' : 'allégée' })}
            onError={() => track('preview_ko', { kind: 'video', size: item.size, detail: `lecture impossible (${hd ? 'HD' : 'allégée'})` })}
            onWaiting={() => track('video_stall', { kind: 'video', size: item.size, detail: hd ? 'HD' : 'allégée' })}
          />
        ) : (
          <img
            key={item.name}
            src={url}
            alt=""
            className="max-w-[92vw] max-h-[85vh] object-contain rounded-lg"
            onLoad={() => track('preview_ok', { kind: 'photo', size: item.size })}
            onError={() => track('preview_ko', { kind: 'photo', size: item.size, detail: 'image non chargée' })}
          />
        )}
      </div>

      {/* Suivant */}
      {index < items.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}
          className="absolute right-2 md:right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Suivant"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}
    </div>
  );
};

export default Lightbox;
