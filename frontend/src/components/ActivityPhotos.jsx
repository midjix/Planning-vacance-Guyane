import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Download, Trash2, Camera, Play } from 'lucide-react';
import { formatDate } from '../utils/formatDate';
import { getToken } from '../utils/auth';
import { useUploads } from '../context/UploadManager';
import Lightbox from './Lightbox';

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'];
const isVideo = (name) => VIDEO_EXT.includes(name.slice(name.lastIndexOf('.')).toLowerCase());

// Vignette : streaming direct via URL (token média en query). Les vidéos sont en
// preload="metadata" -> seule la 1re image est chargée, pas le fichier entier.
const MediaThumb = ({ url, name, onOpen, onDelete }) => {
  const video = isVideo(name);
  return (
    <div
      className="group relative rounded-lg overflow-hidden border border-nature-light bg-nature-dark aspect-square cursor-pointer"
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
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <a href={`${url}&download=1`} download onClick={(e) => e.stopPropagation()} title="Télécharger" className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors pointer-events-auto">
          <Download className="w-4 h-4" />
        </a>
        <button onClick={(e) => { e.stopPropagation(); onDelete(name); }} title="Supprimer" className="p-2 bg-red-900/70 hover:bg-red-800 rounded-lg text-white transition-colors pointer-events-auto">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const ActivityPhotos = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = getToken();
  const { uploads, enqueue } = useUploads();

  const [activity, setActivity] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [mediaToken, setMediaToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);

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
      setLightboxIndex(null);
    } catch {
      setError('Erreur de suppression');
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
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        <label className="flex flex-col items-center justify-center gap-2 w-full py-8 mb-8 border-2 border-dashed border-nature-light rounded-xl cursor-pointer transition-all hover:border-green-500 hover:bg-green-500/5">
          <Upload className="w-8 h-8 text-green-400" />
          <span className="text-sm font-medium text-gray-300">Ajouter des photos ou vidéos</span>
          <span className="text-xs text-gray-500">Cliquez ou déposez vos fichiers ici — jusqu'à 5 Go par fichier (vidéos incluses). Le transfert continue pendant votre navigation dans le site ; évitez juste de recharger la page.</span>
          <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} />
        </label>

        {photos.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Aucun média pour cette activité pour le moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((media, i) => (
              <MediaThumb
                key={media.name}
                url={streamUrl(media.name)}
                name={media.name}
                onOpen={() => setLightboxIndex(i)}
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
        />
      )}
    </div>
  );
};

export default ActivityPhotos;
