import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Navigation, Camera } from 'lucide-react';
import { formatDate } from '../utils/formatDate';
import { getToken } from '../utils/auth';

// Bouton "Y aller" ouvrant un petit menu de choix Waze / Google Maps,
// basé sur les coordonnées GPS de l'activité (plus fiable que le nom du lieu).
const NavButton = ({ coordinates }) => {
  const [open, setOpen] = useState(false);
  const [lat, lng] = coordinates;
  const waze = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 bg-blue-900/40 text-blue-400 hover:bg-blue-800/60 hover:text-blue-300 rounded-md transition-colors border border-blue-500/40 flex items-center gap-1.5 text-xs shadow-sm"
        title="Lancer la navigation"
      >
        <Navigation className="w-3.5 h-3.5" />
        <span className="font-medium">Y aller</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 bg-nature-dark border border-nature-light rounded-lg shadow-xl overflow-hidden min-w-[150px]">
          <a href={waze} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-sm text-white hover:bg-nature-light transition-colors">Waze</a>
          <a href={gmaps} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-sm text-white hover:bg-nature-light transition-colors">Google Maps</a>
        </div>
      )}
    </div>
  );
};

const Timeline = ({ itinerary }) => {
  const navigate = useNavigate();
  const isLoggedIn = !!getToken();
  const hasCoords = (day) => Array.isArray(day.coordinates) && day.coordinates.length === 2;

  return (
    <div className="p-6 bg-nature-dark rounded-lg shadow-xl shadow-black/40 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-nature-light/50">
      <h2 className="text-3xl font-bold text-white mb-6">Itinéraire du Trek</h2>
      <div className="timeline-container">
        {itinerary.map((day) => (
          <div key={day.id} className="mb-8 relative">
            <div className="absolute -left-[2.1rem] top-1 w-4 h-4 bg-nature-light rounded-full border-2 border-nature-dark"></div>
            <div
              className={`bg-nature p-4 rounded-lg shadow-lg shadow-black/30 border border-nature-light hover:bg-nature-light transition-all hover:scale-[1.02] ${isLoggedIn ? 'cursor-pointer' : ''}`}
              onClick={() => { if (isLoggedIn) navigate(`/activity/${day.id}`); }}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-white">{formatDate(day.date)} : {day.title}</h3>
                {day.status && (
                  <span className={`px-2 py-1 text-xs font-bold rounded-full border shrink-0 ml-2 ${
                    day.status === 'RÉSERVÉ' ? 'bg-green-900/50 text-green-400 border-green-500' :
                    day.status.includes('Validé') ? 'bg-blue-900/50 text-blue-400 border-blue-500' :
                    'bg-yellow-900/50 text-yellow-400 border-yellow-500'
                  }`}>
                    {day.status.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-2 mb-2">
                <p className="text-nature-earth font-semibold">{day.location}</p>
                {hasCoords(day) && <NavButton coordinates={day.coordinates} />}
              </div>
              <p className="text-gray-200 mb-2">{day.description}</p>
              {day.providers && day.providers.length > 0 && (
                <p className="text-sm text-gray-300">Prestataires : {day.providers.join(', ')}</p>
              )}
              {day.price > 0 && (
                <p className="text-sm font-bold text-yellow-400 mt-2">Prix : {day.price}€</p>
              )}

              {/* Hébergement */}
              <div className="mt-3 pt-3 border-t border-nature-light/30">
                {day.accommodation === null || day.accommodation === undefined ? (
                  <div className="flex items-center gap-2 text-orange-400 text-sm">
                    <Home className="w-4 h-4" />
                    <span className="font-medium">Hébergement : À prévoir</span>
                  </div>
                ) : day.accommodation.isActivityAccommodation ? (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <Home className="w-4 h-4" />
                    <span className="font-medium">Nuit sur place</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-blue-400 text-sm">
                    <Home className="w-4 h-4" />
                    <span className="font-medium">Nuit à {day.accommodation.name || '(non renseigné)'}</span>
                  </div>
                )}
              </div>

              {/* Indice cliquable vers la galerie photos (visible uniquement si connecté) */}
              {isLoggedIn && (
                <div className="mt-3 pt-3 border-t border-nature-light/30 flex items-center gap-2 text-sm text-green-400 font-medium">
                  <Camera className="w-4 h-4" />
                  <span>Voir / ajouter des photos →</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
