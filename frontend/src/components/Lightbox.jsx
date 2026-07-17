import React, { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'];
const isVideo = (name) => VIDEO_EXT.includes(name.slice(name.lastIndexOf('.')).toLowerCase());

// Visionneuse plein écran : image en grand, vidéo streamée (Range) avec lecteur.
const Lightbox = ({ items, index, streamUrl, onClose, onIndex, onDownload }) => {
  const item = items[index];

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

  return (
    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      {/* Barre d'actions */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 z-10">
        <span className="text-white/70 text-sm">{index + 1} / {items.length}</span>
        <div className="flex items-center gap-2">
          <a
            href={`${url}&download=1`}
            download
            onClick={(e) => { e.stopPropagation(); if (onDownload) onDownload(item.name); }}
            title="Télécharger"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <Download className="w-5 h-5" />
          </a>
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
            key={item.name}
            src={url}
            controls
            autoPlay
            playsInline
            className="max-w-[92vw] max-h-[85vh] rounded-lg bg-black"
          />
        ) : (
          <img key={item.name} src={url} alt="" className="max-w-[92vw] max-h-[85vh] object-contain rounded-lg" />
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
