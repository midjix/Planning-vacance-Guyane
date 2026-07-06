import React from 'react';

const Timeline = ({ itinerary }) => {
  return (
    <div className="p-6 bg-nature-dark rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold text-white mb-6">Itinéraire du Trek</h2>
      <div className="timeline-container">
        {itinerary.map((day, index) => (
          <div key={day.id} className="mb-8 relative">
            <div className="absolute -left-[2.1rem] top-1 w-4 h-4 bg-nature-light rounded-full border-2 border-nature-dark"></div>
            <div className="bg-nature p-4 rounded-lg shadow-md border border-nature-light hover:bg-nature-light transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-white">{day.day} : {day.title}</h3>
                {day.status && (
                  <span className={`px-2 py-1 text-xs font-bold rounded-full border ${
                    day.status === 'RÉSERVÉ' ? 'bg-green-900/50 text-green-400 border-green-500' :
                    day.status.includes('Validé') ? 'bg-blue-900/50 text-blue-400 border-blue-500' :
                    'bg-yellow-900/50 text-yellow-400 border-yellow-500'
                  }`}>
                    {day.status.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-nature-earth font-semibold mb-2">{day.location}</p>
              <p className="text-gray-200 mb-2">{day.description}</p>
              {day.providers.length > 0 && (
                <p className="text-sm text-gray-300">Prestataires : {day.providers.join(', ')}</p>
              )}
              {day.price > 0 && (
                <p className="text-sm font-bold text-yellow-400 mt-2">Prix : {day.price}€</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
