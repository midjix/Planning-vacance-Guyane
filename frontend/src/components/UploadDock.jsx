import React, { useState } from 'react';
import { useUploads } from '../context/UploadManager';
import { X, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2, UploadCloud, RotateCcw } from 'lucide-react';

const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
};

const fmtEta = (s) => {
  if (s == null || !isFinite(s)) return '';
  s = Math.round(s);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m} min ${sec}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
};

const UploadDock = () => {
  const { uploads, cancel, retry, dismiss, clearFinished } = useUploads();
  const [collapsed, setCollapsed] = useState(false);

  if (uploads.length === 0) return null;

  const active = uploads.filter((u) => u.status === 'uploading' || u.status === 'queued').length;
  const failed = uploads.filter((u) => u.status === 'error');

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-80 max-w-[calc(100vw-2rem)] bg-nature-dark border border-nature-light rounded-xl shadow-2xl overflow-hidden text-white">
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a1a0a] border-b border-nature-light">
        <div className="flex items-center gap-2 font-bold text-sm">
          <UploadCloud className="w-4 h-4 text-green-400" />
          {active > 0 ? `Transferts (${active})` : 'Transferts terminés'}
        </div>
        <div className="flex items-center gap-1">
          {failed.length > 0 && (
            <button onClick={() => failed.forEach((u) => retry(u.id))} title="Réessayer les échecs" className="flex items-center gap-1 text-[11px] text-green-400 hover:text-green-300 px-1.5 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Réessayer ({failed.length})
            </button>
          )}
          {active === 0 && (
            <button onClick={clearFinished} title="Effacer" className="p-1 text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setCollapsed((c) => !c)} className="p-1 text-gray-400 hover:text-white transition-colors">
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {active > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-900/30 border-b border-yellow-500/30 text-yellow-300 text-[11px]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Ne rechargez pas et ne fermez pas la page pendant le transfert. Vous pouvez naviguer dans le site.</span>
        </div>
      )}

      {!collapsed && (
        <div className="max-h-72 overflow-y-auto divide-y divide-nature-light/40">
          {uploads.map((u) => {
            const pct = u.size > 0 ? Math.round((u.loaded / u.size) * 100) : 0;
            return (
              <div key={u.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium truncate flex items-center gap-1.5">
                    {u.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                    {u.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    {(u.status === 'uploading' || u.status === 'queued') && <Loader2 className="w-3.5 h-3.5 text-green-400 animate-spin shrink-0" />}
                    <span className="truncate">{u.name}</span>
                  </span>
                  {(u.status === 'uploading' || u.status === 'queued') ? (
                    <button onClick={() => cancel(u.id)} title="Annuler" className="text-gray-500 hover:text-red-400 transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button onClick={() => dismiss(u.id)} title="Retirer" className="text-gray-500 hover:text-white transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {u.status === 'error' ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-red-400 truncate">{u.error}</p>
                    <button onClick={() => retry(u.id)} className="flex items-center gap-1 text-[11px] text-green-400 hover:text-green-300 shrink-0 transition-colors">
                      <RotateCcw className="w-3 h-3" /> Réessayer
                    </button>
                  </div>
                ) : u.status === 'canceled' ? (
                  <p className="text-xs text-gray-500">Annulé</p>
                ) : (
                  <>
                    <div className="h-1.5 bg-[#0a1a0a] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-200 ${u.status === 'done' ? 'bg-green-500' : 'bg-green-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
                      <span>{pct}% · {fmtSize(u.loaded)} / {fmtSize(u.size)}</span>
                      {u.status === 'uploading' && u.eta != null && (
                        <span>{fmtEta(u.eta)} · {fmtSize(u.speed)}/s</span>
                      )}
                      {u.status === 'queued' && <span>En attente…</span>}
                      {u.status === 'done' && <span className="text-green-400">Terminé</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UploadDock;
