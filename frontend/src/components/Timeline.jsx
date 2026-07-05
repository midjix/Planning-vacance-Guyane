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
              <h3 className="text-xl font-bold text-white">{day.day} : {day.title}</h3>
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
