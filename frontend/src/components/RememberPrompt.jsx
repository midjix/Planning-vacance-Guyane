import React from 'react';
import { Smartphone } from 'lucide-react';

// Fenêtre proposée juste après la connexion : rester connecté sur cet appareil ?
const RememberPrompt = ({ onChoice }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
    <div className="w-full max-w-sm bg-[#112211] border border-green-900/50 rounded-2xl p-6 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center border border-green-500/20 shrink-0">
          <Smartphone className="w-5 h-5 text-green-400" />
        </div>
        <h3 className="text-lg font-bold text-white">Rester connecté ?</h3>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Souhaitez-vous rester connecté sur cet appareil pendant 30 jours ? À éviter sur un appareil partagé ou public.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => onChoice(false)}
          className="flex-1 py-2 rounded-lg border border-nature-light text-gray-300 hover:bg-white/5 transition-colors text-sm font-medium"
        >
          Non, cette fois seulement
        </button>
        <button
          onClick={() => onChoice(true)}
          className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors text-sm font-bold"
        >
          Oui, rester connecté
        </button>
      </div>
    </div>
  </div>
);

export default RememberPrompt;
