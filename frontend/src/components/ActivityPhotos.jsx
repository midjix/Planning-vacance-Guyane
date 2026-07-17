import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Download, Trash2, Camera, Play, CheckCircle2, Circle, DownloadCloud, X, Loader2 } from 'lucide-react';
import { formatDate } from '../utils/formatDate';
import { getToken, getUsername } from '../utils/auth';
import { useUploads } from '../context/UploadManager';
import Lightbox from './Lightbox';

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'];
const isVideo = (name) => VIDEO_EXT.includes(name.slice(name.lastIndexOf('.')).toLowerCase());

// Suivi des médias déjà téléchargés, propre à l'appareil (localStorage).
const dlKey = (id) => `downloaded:activity:${id}`;
const loadDownloaded = (id) => {
  try { return new Set(JSON.parse(localStorage.getItem(dlKey(id)) || '[]')); } catch { return new Set(); }
};
const saveDownloaded = (id, set) => {
  try { localStorage.setItem(dlKey(id), JSON.stringify([...set])); } catch { /* ignore */ }
};

const MediaThumb = ({ url, name, by, mine, selected, onToggleSelect, onOpen, onDownload, onDelete }) => {
  const video = isVideo(name);
  return (
    <div
      className={`group relative rounded-lg overflow-hidden border bg-nature-dark aspect-square cursor-pointer transition-all ${selected ? 'border-green-500 ring-2 ring-green-500' : 'border-nature-light'}`}
      onClick={onOpen}
    >
      {video ? (
        <>
          <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-cover bg-black" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="w-5 h-5 text-white translate-x-0.5" />
            </div>
          </div>
        </>
      ) : (
        <img src={url} alt="Média de l'activité" className="w-full h-full object-cover" />
      )}

      {/* Case de sélection */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        title={selected ? 'Désélectionner' : 'Sélectionner'}
        className="absolute top-2 left-2 z-10"
      >
        {selected
          ? <CheckCircle2 className="w-6 h-6 text-green-400 fill-black/40" />
          : <Circle className="w-6 h-6 text-white/80 drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />}
      </button>

      {/* Auteur (si posté par quelqu'un d'autre) */}
      {by && !mine && (
        <span className="absolute top-2 right-2 z-10 text-[10px] font-medium bg-black/60 text-blue-300 px-1.5 py-0.5 rounded-full">
          par {by}
        </span>
      )}

      {/* Actions */}
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <a href={`${url}&download=1`} download onClick={(e) => { e.stopPropagation(); onDownload(); }} title="Télécharger" className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors pointer-events-auto">
          <Download className="w-4 h-4" />
        </a>
        <button onClick={(e) => { e.stopPropagation(); onDelete(name); }} title="Supprimer" className="p-2 bg-red-900/70 hover:bg-red-800 rounded-lg text-white transition-colors pointer-events-auto">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Petite puce de filtre (toggle)
const FilterChip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active
      ? 'bg-green-600 border-green-500 text-white'
      : 'bg-nature-dark border-nature-light text-gray-300 hover:bg-nature-light'}`}
  >
    {children}
  </button>
);

const ActivityPhotos = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = getToken();
  const currentUser = getUsername();
  const { uploads, enqueue } = useUploads();

  const [activity, setActivity] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [mediaToken, setMediaToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const [downloaded, setDownloaded] = useState(() => loadDownloaded(id));
  const [selected, setSelected] = useState(() => new Set());
  const [filterOthers, setFilterOthers] = useState(false);
  const [filterNotDownloaded, setFilterNotDownloaded] = useState(false);
  const [zipping, setZipping] = useState(false);

  const streamUrl = useCallback(
    (name) => `/api/activities/${id}/photos/${encodeURIComponent(name)}?token=${mediaToken}`,
    [id, mediaToken],
  );

  const loadPhotos = useCallback(async () => {
    try {
      const res = await fetch(`/api/activities/${id}/photos`, { headers: authHeaders(token) });
      if (res.status === 401) { navigate('/admin'); return; }
      const data = await res.json();
      setPhotos(Array.isArray(data) ? data : []);
    } catch {
      setError('Erreur de chargement des médias');
    }
  }, [id, token, navigate]);

  useEffect(() => {
    if (!token) { navigate('/admin'); return; }
    fetch('/api/itinerary')
      .then((res) => res.json())
      .then((data) => setActivity(data.find((a) => a.id === parseInt(id, 10)) || null))
      .catch(() => {});
    const getMediaToken = fetch('/api/media-token', { method: 'POST', headers: authHeaders(token) })
      .then((res) => res.json())
      .then((data) => setMediaToken(data.token))
      .catch(() => setError('Impossible de préparer la lecture des médias'));
    Promise.all([loadPhotos(), getMediaToken]).finally(() => setLoading(false));
  }, [id, token, navigate, loadPhotos]);

  // Rafraîchit la galerie quand un transfert de cette activité se termine.
  const doneCount = uploads.filter((u) => String(u.activityId) === String(id) && u.status === 'done').length;
  const prevDone = useRef(0);
  useEffect(() => {
    if (doneCount > prevDone.current) loadPhotos();
    prevDone.current = doneCount;
  }, [doneCount, loadPhotos]);

  const markDownloaded = useCallback((names) => {
    setDownloaded((prev) => {
      const next = new Set(prev);
      names.forEach((n) => next.add(n));
      saveDownloaded(id, next);
      return next;
    });
  }, [id]);

  const handleFiles = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) enqueue(id, files);
    e.target.value = '';
  };

  const handleDelete = async (name) => {
    if (!confirm('Supprimer ce média ?')) return;
    try {
      const res = await fetch(`/api/activities/${id}/photos/${name}`, { method: 'DELETE', headers: authHeaders(token) });
      if (!res.ok) throw new Error();
      setPhotos((prev) => prev.filter((p) => p.name !== name));
      setSelected((prev) => { const n = new Set(prev); n.delete(name); return n; });
      setLightboxIndex(null);
    } catch {
      setError('Erreur de suppression');
    }
  };

  const toggleSelect = (name) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // Filtrage
  const visible = photos.filter((p) => {
    if (filterOthers && (!p.by || p.by === currentUser)) return false;
    if (filterNotDownloaded && downloaded.has(p.name)) return false;
    return true;
  });

  const selectAllVisible = () => setSelected(new Set(visible.map((p) => p.name)));
  const clearSelection = () => setSelected(new Set());

  const handleBulkDownload = async () => {
    const names = [...selected];
    if (names.length === 0) return;
    setZipping(true);
    try {
      const res = await fetch(`/api/activities/${id}/photos/zip`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${activity ? activity.title.replace(/[^\w-]+/g, '_') : 'medias'}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      markDownloaded(names);
      clearSelection();
    } catch {
      setError('Erreur lors du téléchargement groupé');
    } finally {
      setZipping(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#112211] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#112211] text-white">
      <header className="sticky top-0 z-40 bg-nature-dark/95 backdrop-blur-sm border-b border-nature-light">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 px-3 py-2 bg-nature border border-nature-light rounded-lg text-sm hover:bg-nature-light transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold truncate flex items-center gap-2">
              <Camera className="w-5 h-5 text-green-400 shrink-0" />
              {activity ? activity.title : `Activité ${id}`}
            </h1>
            {activity && <p className="text-sm text-gray-400">{formatDate(activity.date)}{activity.location ? ` • ${activity.location}` : ''}</p>}
          </div>
        </div>
        {/* Barre de sélection */}
        {selected.size > 0 && (
          <div className="border-t border-nature-light bg-[#0a1a0a]">
            <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
              <button
                onClick={handleBulkDownload}
                disabled={zipping}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold disabled:opacity-50 transition-colors"
              >
                {zipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
                {zipping ? 'Préparation…' : 'Télécharger (zip)'}
              </button>
              <button onClick={selectAllVisible} className="px-3 py-1.5 bg-nature border border-nature-light rounded-lg text-sm hover:bg-nature-light transition-colors">
                Tout sélectionner
              </button>
              <button onClick={clearSelection} className="flex items-center gap-1 px-3 py-1.5 text-gray-400 hover:text-white text-sm transition-colors">
                <X className="w-4 h-4" /> Annuler
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        <label className="flex flex-col items-center justify-center gap-2 w-full py-8 mb-6 border-2 border-dashed border-nature-light rounded-xl cursor-pointer transition-all hover:border-green-500 hover:bg-green-500/5">
          <Upload className="w-8 h-8 text-green-400" />
          <span className="text-sm font-medium text-gray-300">Ajouter des photos ou vidéos</span>
          <span className="text-xs text-gray-500">Cliquez ou déposez vos fichiers ici — jusqu'à 5 Go par fichier (vidéos incluses). Le transfert continue pendant votre navigation dans le site ; évitez juste de recharger la page.</span>
          <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} />
        </label>

        {/* Filtres */}
        {photos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="text-xs text-gray-500 mr-1">Filtrer :</span>
            <FilterChip active={filterOthers} onClick={() => setFilterOthers((v) => !v)}>Postées par les autres</FilterChip>
            <FilterChip active={filterNotDownloaded} onClick={() => setFilterNotDownloaded((v) => !v)}>Pas encore téléchargées</FilterChip>
            <span className="text-xs text-gray-500 ml-auto">{visible.length} / {photos.length} média{photos.length > 1 ? 's' : ''}</span>
          </div>
        )}

        {photos.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Aucun média pour cette activité pour le moment.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p>Aucun média ne correspond au filtre.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {visible.map((media) => (
              <MediaThumb
                key={media.name}
                url={streamUrl(media.name)}
                name={media.name}
                by={media.by}
                mine={media.by === currentUser}
                selected={selected.has(media.name)}
                onToggleSelect={() => toggleSelect(media.name)}
                onOpen={() => setLightboxIndex(photos.findIndex((p) => p.name === media.name))}
                onDownload={() => markDownloaded([media.name])}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {lightboxIndex !== null && (
        <Lightbox
          items={photos}
          index={lightboxIndex}
          streamUrl={streamUrl}
          onClose={() => setLightboxIndex(null)}
          onIndex={setLightboxIndex}
          onDownload={(name) => markDownloaded([name])}
        />
      )}
    </div>
  );
};

export default ActivityPhotos;
