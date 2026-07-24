import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { Activity, RefreshCw, Trash2, AlertTriangle, CheckCircle2, Image, Video, Smartphone, Upload, Eye } from 'lucide-react';

const SIZE_BUCKETS = [
  { label: '< 5 Mo', max: 5e6 },
  { label: '5–25 Mo', max: 25e6 },
  { label: '25–100 Mo', max: 100e6 },
  { label: '100–500 Mo', max: 500e6 },
  { label: '> 500 Mo', max: Infinity },
];
const bucketOf = (size) => (SIZE_BUCKETS.find((b) => (size || 0) < b.max) || SIZE_BUCKETS[4]).label;

const fmtSize = (b) => {
  if (!b) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} Mo`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} Go`;
};
const pct = (ok, total) => (total > 0 ? Math.round((ok / total) * 100) : null);

// Libellés lisibles pour le journal détaillé
const TYPE_LABELS = {
  upload_ok: 'Upload réussi',
  upload_ko: 'Upload échoué',
  upload_unreadable: 'Fichier illisible',
  upload_retry: 'Reprise auto',
  upload_canceled: 'Upload annulé',
  reload_during_upload: 'Page rechargée pendant un transfert',
  gallery_view: 'Galerie affichée',
  thumb_ko: 'Miniature non chargée',
  preview_open: 'Aperçu ouvert',
  preview_ok: 'Aperçu affiché',
  preview_ko: 'Aperçu en échec',
  video_stall: 'Vidéo saccadée',
  video_quality_toggle: 'Bascule qualité vidéo',
  video_poster_missing: 'Miniature vidéo absente',
  js_error: 'Erreur JavaScript',
};
const isFailure = (t) => ['upload_ko', 'upload_unreadable', 'thumb_ko', 'preview_ko', 'js_error', 'reload_during_upload', 'video_poster_missing'].includes(t);

const Card = ({ icon: Icon, label, value, sub, tone = 'green' }) => (
  <div className="bg-nature-dark border border-nature-light rounded-xl p-4">
    <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
      <Icon className={`w-4 h-4 ${tone === 'red' ? 'text-red-400' : tone === 'yellow' ? 'text-yellow-400' : 'text-green-400'}`} />
      {label}
    </div>
    <div className="text-2xl font-bold">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

const AdminDiagnostics = ({ token, showMessage, handleLogout }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('failures');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/events?limit=1000', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        if (res.status === 401) return handleLogout();
        throw new Error('Erreur');
      }
      setEvents(await res.json());
    } catch (err) {
      showMessage('Erreur de chargement du diagnostic', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, showMessage, handleLogout]);

  useEffect(() => { load(); }, [load]);

  const backfill = async () => {
    if (!confirm('Générer les miniatures et versions allégées manquantes ?\n\nLe NAS va travailler quelques minutes selon le nombre de vidéos.')) return;
    try {
      const res = await fetch('/api/admin/media/backfill', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error();
      showMessage(data.queued > 0
        ? `${data.queued} vidéo(s) en cours de traitement — les miniatures apparaîtront au fur et à mesure`
        : 'Tout est déjà à jour');
    } catch (err) {
      showMessage('Erreur lors du rattrapage', 'error');
    }
  };

  const clearLog = async () => {
    if (!confirm('Vider tout le journal de diagnostic ?')) return;
    try {
      await fetch('/api/admin/events', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setEvents([]);
      showMessage('Journal vidé');
    } catch (err) {
      showMessage('Erreur', 'error');
    }
  };

  const s = useMemo(() => {
    const by = (t) => events.filter((e) => e.type === t);
    const uploadOk = by('upload_ok');
    const uploadKo = [...by('upload_ko'), ...by('upload_unreadable')];
    const previewOk = by('preview_ok');
    const previewKo = by('preview_ko');
    const thumbKo = by('thumb_ko');
    const galleryViews = by('gallery_view');
    const thumbsShown = galleryViews.reduce((n, e) => n + (e.total || 0), 0);

    // Uploads par tranche de taille
    const buckets = SIZE_BUCKETS.map((b) => ({ name: b.label, Réussis: 0, Échoués: 0 }));
    const addTo = (list, key) => list.forEach((e) => {
      const row = buckets.find((x) => x.name === bucketOf(e.size));
      if (row) row[key] += 1;
    });
    addTo(uploadOk, 'Réussis');
    addTo(uploadKo, 'Échoués');

    const kind = (list, k) => list.filter((e) => e.kind === k).length;

    // Erreurs les plus fréquentes
    const errMap = new Map();
    [...uploadKo, ...previewKo, ...thumbKo, ...by('js_error')].forEach((e) => {
      const key = `${TYPE_LABELS[e.type] || e.type} — ${e.detail || (e.status ? `code ${e.status}` : 'sans détail')}`;
      errMap.set(key, (errMap.get(key) || 0) + 1);
    });
    const topErrors = [...errMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    // Répartition des échecs par appareil (repérer les bugs propres au mobile)
    const devMap = new Map();
    events.filter((e) => isFailure(e.type)).forEach((e) => {
      const key = `${e.device || '?'} · ${e.browser || '?'} · ${e.os || '?'}`;
      devMap.set(key, (devMap.get(key) || 0) + 1);
    });
    const byDevice = [...devMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    const speeds = uploadOk.map((e) => e.speed).filter(Boolean);
    const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;

    return {
      uploadOk: uploadOk.length,
      uploadKo: uploadKo.length,
      uploadRate: pct(uploadOk.length, uploadOk.length + uploadKo.length),
      retries: by('upload_retry').length,
      unreadable: by('upload_unreadable').length,
      reloads: by('reload_during_upload').length,
      photoOk: kind(uploadOk, 'photo'), photoKo: kind(uploadKo, 'photo'),
      videoOk: kind(uploadOk, 'video'), videoKo: kind(uploadKo, 'video'),
      buckets,
      thumbsShown, thumbKo: thumbKo.length,
      thumbRate: pct(thumbsShown - thumbKo.length, thumbsShown),
      previewOk: previewOk.length, previewKo: previewKo.length,
      previewRate: pct(previewOk.length, previewOk.length + previewKo.length),
      previewPhoto: previewOk.filter((e) => e.kind === 'photo').length,
      previewVideo: previewOk.filter((e) => e.kind === 'video').length,
      stalls: by('video_stall').length,
      jsErrors: by('js_error').length,
      topErrors,
      byDevice,
      avgSpeed,
    };
  }, [events]);

  const visible = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'failures') return events.filter((e) => isFailure(e.type));
    return events.filter((e) => e.type === filter);
  }, [events, filter]);

  if (loading) return <div className="text-center py-10 text-gray-400">Chargement du diagnostic…</div>;

  return (
    <div className="space-y-6">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-500" />
          Santé du site
        </h3>
        <span className="text-xs text-gray-500">{events.length} événements enregistrés</span>
        <div className="ml-auto flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-nature border border-nature-light rounded-lg text-sm hover:bg-nature-light transition-colors">
            <RefreshCw className="w-4 h-4" /> Actualiser
          </button>
          <button onClick={backfill} title="Générer les miniatures vidéo et versions allégées manquantes" className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/30 border border-blue-500/50 text-blue-300 rounded-lg text-sm hover:bg-blue-900/50 transition-colors">
            <Video className="w-4 h-4" /> Miniatures vidéo
          </button>
          <button onClick={clearLog} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 border border-red-500/50 text-red-400 rounded-lg text-sm hover:bg-red-900/50 transition-colors">
            <Trash2 className="w-4 h-4" /> Vider
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-gray-500 border border-dashed border-nature-light rounded-xl">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Aucun événement pour l'instant.</p>
          <p className="text-xs mt-1">Les diagnostics remonteront dès que le site sera utilisé.</p>
        </div>
      ) : (
        <>
          {/* ---- MACRO : indicateurs clés ---- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card
              icon={Upload} label="Uploads réussis"
              value={s.uploadRate !== null ? `${s.uploadRate}%` : '—'}
              sub={`${s.uploadOk} réussis · ${s.uploadKo} échoués`}
              tone={s.uploadRate !== null && s.uploadRate < 90 ? 'red' : 'green'}
            />
            <Card
              icon={Image} label="Miniatures"
              value={s.thumbRate !== null ? `${s.thumbRate}%` : '—'}
              sub={`${s.thumbsShown} affichées · ${s.thumbKo} en échec`}
              tone={s.thumbKo > 0 ? 'yellow' : 'green'}
            />
            <Card
              icon={Eye} label="Aperçus"
              value={s.previewRate !== null ? `${s.previewRate}%` : '—'}
              sub={`${s.previewPhoto} photos · ${s.previewVideo} vidéos`}
              tone={s.previewKo > 0 ? 'yellow' : 'green'}
            />
            <Card
              icon={AlertTriangle} label="Problèmes"
              value={s.jsErrors + s.reloads + s.unreadable}
              sub={`${s.jsErrors} erreurs JS · ${s.reloads} rechargements · ${s.unreadable} fichiers illisibles`}
              tone={(s.jsErrors + s.reloads + s.unreadable) > 0 ? 'red' : 'green'}
            />
          </div>

          {/* ---- MACRO : uploads par taille ---- */}
          <div className="bg-nature-dark border border-nature-light rounded-xl p-4">
            <h4 className="font-bold text-sm mb-3">Uploads par taille de fichier</h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={s.buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0a1a0a', border: '1px solid #2c5c2c', borderRadius: 8, color: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Réussis" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Échoués" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              <div className="flex items-center gap-2 text-gray-400">
                <Image className="w-4 h-4 text-green-400" /> Photos : {s.photoOk} réussies / {s.photoKo} échouées
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Video className="w-4 h-4 text-green-400" /> Vidéos : {s.videoOk} réussies / {s.videoKo} échouées
              </div>
            </div>
            {s.avgSpeed && (
              <p className="text-xs text-gray-500 mt-2">Débit moyen constaté : {fmtSize(s.avgSpeed)}/s · {s.retries} reprises automatiques · {s.stalls} blocages de lecture vidéo</p>
            )}
          </div>

          {/* ---- MACRO : erreurs & appareils ---- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-nature-dark border border-nature-light rounded-xl p-4">
              <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> Problèmes les plus fréquents</h4>
              {s.topErrors.length === 0 ? (
                <p className="text-sm text-green-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Aucun problème détecté</p>
              ) : (
                <ul className="space-y-2">
                  {s.topErrors.map(([label, n]) => (
                    <li key={label} className="flex items-start justify-between gap-3 text-xs">
                      <span className="text-gray-300 break-words">{label}</span>
                      <span className="shrink-0 px-2 py-0.5 bg-red-900/40 text-red-300 rounded-full font-bold">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-nature-dark border border-nature-light rounded-xl p-4">
              <h4 className="font-bold text-sm mb-3 flex items-center gap-2"><Smartphone className="w-4 h-4 text-blue-400" /> Échecs par appareil</h4>
              {s.byDevice.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun échec enregistré</p>
              ) : (
                <ul className="space-y-2">
                  {s.byDevice.map(([label, n]) => (
                    <li key={label} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-gray-300">{label}</span>
                      <span className="shrink-0 px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full font-bold">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ---- MICRO : journal détaillé ---- */}
          <div className="bg-nature-dark border border-nature-light rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-nature-light bg-[#0a1a0a] flex flex-wrap items-center gap-2">
              <h4 className="font-bold text-sm">Journal détaillé</h4>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="ml-auto px-2 py-1 bg-[#112211] border border-nature-light rounded-lg text-white text-xs focus:outline-none"
              >
                <option value="failures">Problèmes uniquement</option>
                <option value="all">Tout</option>
                {Object.keys(TYPE_LABELS).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-nature-light/40">
              {visible.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500 text-center">Aucun événement pour ce filtre.</p>
              ) : visible.slice(0, 300).map((e, i) => (
                <div key={i} className="px-4 py-2.5 text-xs flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-gray-500 font-mono shrink-0">{new Date(e.at).toLocaleString('fr-FR')}</span>
                  <span className={`font-medium ${isFailure(e.type) ? 'text-red-400' : 'text-green-400'}`}>
                    {TYPE_LABELS[e.type] || e.type}
                  </span>
                  {e.kind && <span className="text-gray-400">{e.kind}</span>}
                  {e.size ? <span className="text-gray-400">{fmtSize(e.size)}</span> : null}
                  {e.status ? <span className="text-orange-300">code {e.status}</span> : null}
                  {e.detail && <span className="text-gray-300 break-words">{e.detail}</span>}
                  <span className="ml-auto text-gray-500 shrink-0">{e.user || 'anonyme'} · {e.device} {e.browser}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDiagnostics;
