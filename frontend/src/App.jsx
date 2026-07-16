import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Timeline from './components/Timeline';
import InteractiveMap from './components/InteractiveMap';
import { Compass, Map as MapIcon, Calendar } from 'lucide-react';
import { getToken, getUsername, getRole } from './utils/auth';

function App() {
  const [itinerary, setItinerary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mousePos, setMousePos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    // Tracking de la visite (silencieux)
    fetch('/api/track', { method: 'POST' }).catch(() => {});

    // Dans docker ou local, on pointe sur le backend (port 8081 en dev, ou nginx pass)
    // L'appel passe par nginx qui redirige vers le backend via le proxy
    fetch('/api/itinerary')
      .then(res => res.json())
      .then(data => {
        // Trier par date pour s'assurer que la timeline et la carte sont toujours chronologiques
        const sortedData = data.sort((a, b) => new Date(a.date) - new Date(b.date));
        setItinerary(sortedData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Erreur de récupération des données:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#112211] font-sans text-white">
      {/* Barre supérieure (Connexion / Salutation) */}
      <div className="absolute top-0 left-0 w-full z-50 px-6 py-4 flex justify-end items-center">
        {getToken() && getUsername() ? (
          <div className="bg-green-900/60 backdrop-blur-md border border-green-500/30 px-4 py-2 rounded-full flex items-center gap-2 md:gap-4 shadow-lg max-w-full">
            <span className="text-sm font-medium text-green-400 hidden sm:block truncate">
              👋 Bonjour <strong className="text-white">{getUsername()}</strong>
            </span>
            <Link to="/admin/panel" className="text-xs bg-green-500 hover:bg-green-400 text-[#112211] font-bold px-3 py-1.5 rounded-full transition-colors shrink-0">
              {getRole() === 'admin' ? 'Espace Admin' : 'Mon Espace'}
            </Link>
          </div>
        ) : (
          <Link to="/admin" className="text-sm bg-black/40 hover:bg-black/60 backdrop-blur-sm border border-white/10 text-white font-medium px-5 py-2 rounded-full transition-all hover:scale-105 flex items-center gap-2 shadow-lg">
            Connexion
          </Link>
        )}
      </div>

      {/* Header Immersif */}
      <header className="relative h-screen flex items-center justify-center bg-nature-dark overflow-hidden">
        {/* Couche de base (fond sombre) */}
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0a1a0a] to-[#112211]"></div>
        
        {/* Halo lumineux qui révèle le feuillage autour de la souris */}
        <div className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-300 opacity-60 mix-blend-screen"
             style={{
               backgroundImage: `url('/foliage.png')`,
               backgroundSize: '400px',
               maskImage: `radial-gradient(circle 350px at ${mousePos.x}px ${mousePos.y}px, rgba(0,0,0,1) 0%, transparent 80%)`,
               WebkitMaskImage: `radial-gradient(circle 350px at ${mousePos.x}px ${mousePos.y}px, rgba(0,0,0,1) 0%, transparent 80%)`,
             }}>
        </div>

        <div className="z-10 text-center px-4 relative">
          {/* Lueur d'arrière-plan du texte */}
          <div className="absolute inset-0 bg-green-500 blur-[80px] opacity-20 pointer-events-none rounded-full"></div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold mb-4 tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-green-200 to-green-600 animate-title-shine">
            GUYANE 2026
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Une aventure immersive au cœur de la forêt amazonienne. 16 - 23 Juillet 2026.
          </p>
          <div className="flex justify-center gap-4">
            <div className="flex items-center gap-2 bg-nature/80 px-4 py-2 rounded-full border border-nature-light backdrop-blur-sm">
              <Calendar className="w-5 h-5" />
              <span>8 Jours</span>
            </div>
            <div className="flex items-center gap-2 bg-nature/80 px-4 py-2 rounded-full border border-nature-light backdrop-blur-sm">
              <Compass className="w-5 h-5" />
              <span>Trek & Bivouac</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-16">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Colonne Timeline */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <MapIcon className="w-8 h-8 text-green-500" />
                <h2 className="text-3xl font-bold">Votre Programme</h2>
              </div>
              <Timeline itinerary={itinerary} />
            </div>

            {/* Colonne Carte */}
            <div className="lg:sticky lg:top-8 h-fit">
              <h2 className="text-3xl font-bold mb-6 text-white">Tracé de l'expédition</h2>
              <div className="shadow-2xl shadow-black/50 overflow-hidden rounded-xl">
                <InteractiveMap itinerary={itinerary} />
              </div>
              
              <div className="mt-8 bg-nature p-6 rounded-lg border border-nature-light shadow-2xl shadow-black/50 hover:shadow-black/70 hover:-translate-y-1 transition-all duration-300">
                <h3 className="text-xl font-bold mb-4">Informations Logistiques</h3>
                <ul className="space-y-3 text-gray-300">
                  <li><strong>Pied-à-terre :</strong> Matoury (Chez l'oncle)</li>
                  <li><strong>Budget Estimé (Activités) :</strong> {itinerary.reduce((sum, item) => sum + (item.price || 0), 0)} €</li>
                  <li><strong>Climat :</strong> Chaud et humide, prévoir équipement adéquat.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-black py-8 text-center text-gray-500">
        <p>Généré par votre Superviseur IA. Prêt pour l'aventure !</p>
        <Link to="/admin" className="text-gray-700 hover:text-gray-400 text-xs mt-2 inline-block transition-colors">Admin</Link>
      </footer>
    </div>
  );
}

export default App;
