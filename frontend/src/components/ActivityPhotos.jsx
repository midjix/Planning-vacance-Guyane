import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Download, Trash2, ImageOff, Loader2, Camera } from 'lucide-react';
import { formatDate } from '../utils/formatDate';

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

// Vignette qui charge l'image via fetch authentifié : les photos ne sont pas
// servies publiquement, il faut donc les récupérer en blob avec le token.
const PhotoThumb = ({ id, photo, token, onDelete }) => {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl;
    fetch(`/api/activities/${id}/photos/${photo.name}`, { headers: authHeaders(token) })
      .then((res) => { if (!res.ok) throw new Error(); return res.blob(); })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setError(true));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, photo.name, token]);

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/activities/${id}/photos/${photo.name}?download=1`, { headers: authHeaders(token) });
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = photo.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      /* silencieux */
    }
  };

  return (
    <div className="group relative rounded-lg overflow-hidden border border-nature-light bg-nature-dark aspect-square">
      {error ? (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <ImageOff className="w-8 h-8" />
        </div>
      ) : url ? (
        <img src={url} alt="Photo de l'activité" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handleDownload} title="Télécharger" className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors">
          <Download className="w-4 h-4" />
        </button>
        <button onClick={() => onDelete(photo.name)} title="Supprimer" className="p-2 bg-red-900/70 hover:bg-red-800 rounded-lg text-white transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const ActivityPhotos = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('adminToken');

  const [activity, setActivity] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const loadPhotos = useCallback(async () => {
    try {
      const res = await fetch(`/api/activities/${id}/photos`, { headers: authHeaders(token) });
      if (res.status === 401) { navigate('/admin'); return; }
      const data = await res.json();
      setPhotos(Array.isArray(data) ? data : []);
    } catch {
      setError('Erreur de chargement des photos');
    }
  }, [id, token, navigate]);

  useEffect(() => {
    if (!token) { navigate('/admin'); return; }
    fetch('/api/itinerary')
      .then((res) => res.json())
      .then((data) => setActivity(data.find((a) => a.id === parseInt(id, 10)) || null))
      .catch(() => {});
    loadPhotos().finally(() => setLoading(false));
  }, [id, token, navigate, loadPhotos]);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('photos', f));
      const res = await fetch(`/api/activities/${id}/photos`, { method: 'POST', headers: authHeaders(token), body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Échec de l\'upload');
      }
      await loadPhotos();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (name) => {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      const res = await fetch(`/api/activities/${id}/photos/${name}`, { method: 'DELETE', headers: authHeaders(token) });
      if (!res.ok) throw new Error();
      setPhotos((prev) => prev.filter((p) => p.name !== name));
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

        <label className={`flex flex-col items-center justify-center gap-2 w-full py-8 mb-8 border-2 border-dashed border-nature-light rounded-xl cursor-pointer transition-all hover:border-green-500 hover:bg-green-500/5 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
          {uploading ? <Loader2 className="w-8 h-8 text-green-400 animate-spin" /> : <Upload className="w-8 h-8 text-green-400" />}
          <span className="text-sm font-medium text-gray-300">{uploading ? 'Envoi en cours…' : 'Ajouter des photos'}</span>
          <span className="text-xs text-gray-500">Cliquez ou déposez vos images ici (JPG, PNG, WEBP, HEIC — 15 Mo max)</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>

        {photos.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Aucune photo pour cette activité pour le moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo) => (
              <PhotoThumb key={photo.name} id={id} photo={photo} token={token} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ActivityPhotos;
