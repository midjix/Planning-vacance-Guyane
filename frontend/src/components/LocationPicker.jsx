import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Search, Loader2 } from 'lucide-react';

// Marqueur autonome (DivIcon) : pas de dépendance à une image externe.
const pinIcon = new L.DivIcon({
  html: `<div style="width:22px;height:22px;background:#22c55e;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

// Capte les clics sur la carte pour déplacer le point.
const ClickHandler = ({ onPick }) => {
  useMapEvents({
    click(e) { onPick([e.latlng.lat, e.latlng.lng]); },
  });
  return null;
};

// Recentre la carte uniquement lors d'une recherche (pas sur clic/glisser).
const FlyTo = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView(target, 13);
  }, [target, map]);
  return null;
};

const LocationPicker = ({ coordinates, onChange }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [flyTarget, setFlyTarget] = useState(null);

  const [lat, lng] = coordinates;

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    setResults([]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) setError('Aucun lieu trouvé');
      else setResults(data);
    } catch (err) {
      setError('Recherche indisponible, place le point manuellement');
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (r) => {
    const coords = [parseFloat(r.lat), parseFloat(r.lon)];
    onChange(coords);
    setFlyTarget(coords);
    setResults([]);
    setQuery(r.display_name.split(',')[0]);
  };

  return (
    <div className="space-y-2">
      {/* Recherche par nom de lieu */}
      <form onSubmit={handleSearch} className="flex gap-2 relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un lieu (ex: Kourou)"
          className="flex-1 px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={searching}
          className="px-3 py-2 bg-nature border border-nature-light rounded-lg text-sm hover:bg-nature-light transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Chercher
        </button>

        {results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-[500] bg-nature-dark border border-nature-light rounded-lg shadow-xl max-h-52 overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectResult(r)}
                className="block w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-nature-light transition-colors border-b border-nature-light/40 last:border-0"
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </form>
      {error && <p className="text-xs text-orange-400">{error}</p>}

      {/* Carte cliquable */}
      <div className="h-56 rounded-lg overflow-hidden border border-nature-light">
        <MapContainer center={coordinates} zoom={9} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={coordinates}
            draggable
            icon={pinIcon}
            eventHandlers={{
              dragend: (e) => {
                const m = e.target.getLatLng();
                onChange([m.lat, m.lng]);
              },
            }}
          />
          <ClickHandler onPick={onChange} />
          <FlyTo target={flyTarget} />
        </MapContainer>
      </div>

      <p className="text-xs text-gray-400">
        Clique sur la carte ou glisse le marqueur.{' '}
        <span className="text-gray-500">Lat {Number(lat).toFixed(4)}, Lng {Number(lng).toFixed(4)}</span>
      </p>
    </div>
  );
};

export default LocationPicker;
