import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const InteractiveMap = ({ itinerary }) => {
  // Center of French Guiana roughly
  const center = [4.7, -52.8];
  
  // Extract coordinates for Polyline
  const polylinePositions = itinerary
    .filter(item => item.coordinates && item.coordinates.length === 2)
    .map(item => item.coordinates);

  return (
    <div className="h-96 w-full rounded-lg overflow-hidden shadow-lg border-2 border-nature-light">
      <MapContainer center={center} zoom={7} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {itinerary.map((day) => (
          day.coordinates && day.coordinates.length === 2 && (
            <Marker key={day.id} position={day.coordinates}>
              <Popup>
                <div className="font-sans">
                  <h4 className="font-bold">{day.day}</h4>
                  <p>{day.title}</p>
                  <p className="text-sm italic">{day.location}</p>
                </div>
              </Popup>
            </Marker>
          )
        ))}
        
        {polylinePositions.length > 1 && (
          <Polyline pathOptions={{ color: '#2c5a2b', weight: 3 }} positions={polylinePositions} />
        )}
      </MapContainer>
    </div>
  );
};

export default InteractiveMap;
