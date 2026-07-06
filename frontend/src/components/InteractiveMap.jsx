import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Icône personnalisée pour les activités (vert)
const activityIcon = new L.DivIcon({
  html: `<div style="background: #22c55e; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Icône personnalisée pour les hébergements (orange)
const accommodationIcon = new L.DivIcon({
  html: `<div style="background: #f97316; width: 12px; height: 12px; border-radius: 3px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); transform: rotate(45deg);"></div>`,
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// Composant pour récupérer et afficher les routes OSRM
const RoutingLayer = ({ waypoints }) => {
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    if (waypoints.length < 2) return;

    const fetchRoutes = async () => {
      const newRoutes = [];
      for (let i = 0; i < waypoints.length - 1; i++) {
        const from = waypoints[i];
        const to = waypoints[i + 1];
        try {
          // OSRM attend [longitude, latitude]
          const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.routes && data.routes[0]) {
            // GeoJSON donne [lng, lat], il faut convertir en [lat, lng] pour Leaflet
            const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            const duration = Math.round(data.routes[0].duration / 60);
            newRoutes.push({ coords, duration, from, to });
          } else {
            // Si OSRM n'a pas de route, tracer une ligne droite
            newRoutes.push({ coords: [from, to], duration: null, from, to });
          }
        } catch (err) {
          // En cas d'erreur, tracer une ligne droite
          newRoutes.push({ coords: [from, to], duration: null, from, to });
        }
      }
      setRoutes(newRoutes);
    };

    fetchRoutes();
  }, [waypoints]);

  return (
    <>
      {routes.map((route, index) => (
        <Polyline
          key={index}
          pathOptions={{
            color: '#22c55e',
            weight: 3,
            opacity: 0.8,
            dashArray: route.duration === null ? '8, 8' : null,
          }}
          positions={route.coords}
        />
      ))}
    </>
  );
};

const InteractiveMap = ({ itinerary }) => {
  // Center of French Guiana roughly
  const center = [4.7, -52.8];

  // Construire la liste ordonnée des waypoints
  // Pour chaque jour : activité → hébergement (si différent de l'activité)
  const waypoints = [];
  const accommodationMarkers = [];

  itinerary.forEach((item, index) => {
    if (item.coordinates && item.coordinates.length === 2) {
      waypoints.push(item.coordinates);
    }

    // Ajouter l'hébergement comme waypoint (sauf si c'est sur place)
    if (item.accommodation) {
      if (!item.accommodation.isActivityAccommodation && item.accommodation.coordinates) {
        const accCoords = item.accommodation.coordinates;
        if (accCoords[0] !== 0 && accCoords[1] !== 0) {
          // Éviter les doublons consécutifs (même coordonnées)
          const lastWp = waypoints[waypoints.length - 1];
          if (!lastWp || lastWp[0] !== accCoords[0] || lastWp[1] !== accCoords[1]) {
            waypoints.push(accCoords);
          }
          accommodationMarkers.push({
            name: item.accommodation.name,
            coordinates: accCoords,
            day: item.day,
          });
        }
      }
    }
  });

  // Dédupliquer les marqueurs d'hébergement (même nom + même coordonnées)
  const uniqueAccommodations = accommodationMarkers.reduce((acc, marker) => {
    const key = `${marker.name}-${marker.coordinates[0]}-${marker.coordinates[1]}`;
    if (!acc.find(m => `${m.name}-${m.coordinates[0]}-${m.coordinates[1]}` === key)) {
      acc.push(marker);
    }
    return acc;
  }, []);

  return (
    <div className="h-96 w-full rounded-lg overflow-hidden shadow-lg border-2 border-nature-light">
      <MapContainer center={center} zoom={7} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Marqueurs des activités */}
        {itinerary.map((day) => (
          day.coordinates && day.coordinates.length === 2 && (
            <Marker key={`act-${day.id}`} position={day.coordinates} icon={activityIcon}>
              <Popup>
                <div className="font-sans">
                  <h4 className="font-bold text-green-700">{day.day}</h4>
                  <p className="font-semibold">{day.title}</p>
                  <p className="text-sm italic text-gray-600">{day.location}</p>
                  {day.accommodation?.isActivityAccommodation && (
                    <p className="text-xs text-orange-600 mt-1">🏠 Nuit sur place</p>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        ))}

        {/* Marqueurs des hébergements */}
        {uniqueAccommodations.map((acc, index) => (
          <Marker key={`acc-${index}`} position={acc.coordinates} icon={accommodationIcon}>
            <Popup>
              <div className="font-sans">
                <h4 className="font-bold text-orange-600">🏠 Hébergement</h4>
                <p className="font-semibold">{acc.name}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Routes OSRM */}
        <RoutingLayer waypoints={waypoints} />
      </MapContainer>
    </div>
  );
};

export default InteractiveMap;
