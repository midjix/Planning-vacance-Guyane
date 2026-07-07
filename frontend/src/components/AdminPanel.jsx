import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Trash2, Plus, LogOut, ChevronDown, ChevronUp, Home, MapPin, Users, List, BarChart, User } from 'lucide-react';
import AdminUsers from './AdminUsers';
import AdminStats from './AdminStats';
import AdminProfile from './AdminProfile';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const parts = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).split(' ');
  if (parts.length > 1) {
    return `${parts[0]} ${parts[1].charAt(0).toUpperCase() + parts[1].slice(1)}`;
  }
  return dateStr;
};

const AdminPanel = () => {
  const [itinerary, setItinerary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('activities');
  const navigate = useNavigate();

  const token = localStorage.getItem('adminToken');
  const role = localStorage.getItem('adminRole');

  useEffect(() => {
    if (!token) {
      navigate('/admin');
      return;
      return;
    }
    // L'utilisateur normal n'a pas besoin de l'itinéraire, mais ça ne casse rien de le cacher.
    // Pour éviter une erreur 403 s'il est simple user, on ne fetch que si admin.
    if (role === 'admin') {
      fetchItinerary();
    } else {
      setLoading(false);
      setActiveTab('profile');
    }
  }, []);

  const fetchItinerary = async () => {
    try {
      const res = await fetch('/api/itinerary');
      const data = await res.json();
      const sortedData = data.sort((a, b) => new Date(a.date) - new Date(b.date));
      setItinerary(sortedData);
      setLoading(false);
    } catch (err) {
      showMessage('Erreur de chargement', 'error');
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    localStorage.removeItem('adminRole');
    navigate('/admin');
  };

  const updateField = (id, field, value) => {
    setItinerary(prev =>
      prev.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const updateAccommodation = (id, field, value) => {
    setItinerary(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const acc = item.accommodation || { name: '', coordinates: [0, 0], isActivityAccommodation: false };
        return { ...item, accommodation: { ...acc, [field]: value } };
      })
    );
  };

  const toggleActivityAccommodation = (id) => {
    setItinerary(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const isActivity = !(item.accommodation?.isActivityAccommodation);
        if (isActivity) {
          return {
            ...item,
            accommodation: {
              name: item.title,
              coordinates: [...item.coordinates],
              isActivityAccommodation: true
            }
          };
        } else {
          return {
            ...item,
            accommodation: {
              name: '',
              coordinates: [0, 0],
              isActivityAccommodation: false
            }
          };
        }
      })
    );
  };

  const removeAccommodation = (id) => {
    setItinerary(prev =>
      prev.map(item =>
        item.id === id ? { ...item, accommodation: null } : item
      )
    );
  };

  const addAccommodation = (id) => {
    setItinerary(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, accommodation: { name: '', coordinates: [0, 0], isActivityAccommodation: false } }
          : item
      )
    );
  };

  const saveItem = async (item) => {
    setSaving(item.id);
    try {
      const res = await fetch(`/api/admin/itinerary/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        if (res.status === 401) { handleLogout(); return; }
        throw new Error('Erreur serveur');
      }
      showMessage(`"${item.title}" sauvegardé !`);
    } catch (err) {
      showMessage('Erreur de sauvegarde', 'error');
    }
    setSaving(null);
  };

  const deleteItem = async (id) => {
    if (!confirm('Supprimer cette activité ?')) return;
    try {
      const res = await fetch(`/api/admin/itinerary/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) { handleLogout(); return; }
        throw new Error('Erreur serveur');
      }
      setItinerary(prev => prev.filter(item => item.id !== id));
      showMessage('Activité supprimée');
    } catch (err) {
      showMessage('Erreur de suppression', 'error');
    }
  };

  const addItem = async () => {
    try {
      const res = await fetch('/api/admin/itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: '',
          title: 'Nouvelle activité',
          description: '',
          location: '',
          providers: [],
          price: 0,
          status: 'À faire',
          coordinates: [4.9, -52.3],
          accommodation: null,
        }),
      });
      if (!res.ok) {
        if (res.status === 401) { handleLogout(); return; }
        throw new Error('Erreur serveur');
      }
      const newItem = await res.json();
      setItinerary(prev => [...prev, newItem]);
      setExpandedId(newItem.id);
      showMessage('Nouvelle activité ajoutée');
    } catch (err) {
      showMessage('Erreur de création', 'error');
    }
  };

  const handleProvidersChange = (id, value) => {
    const providers = value.split(',').map(p => p.trim()).filter(p => p);
    updateField(id, 'providers', providers);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#112211] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#112211] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-nature-dark/95 backdrop-blur-sm border-b border-nature-light">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-2xl font-bold text-white">🌴 {role === 'admin' ? 'Admin' : 'Mon Espace'} — Guyane 2026</h1>
            {role === 'admin' && (
              <p className="text-sm text-gray-400">{itinerary.length} activités • Budget total : {itinerary.reduce((s, i) => s + (i.price || 0), 0)} €</p>
            )}
          </div>
          <div className="flex gap-3">
            <a
              href="/"
              className="px-4 py-2 bg-nature border border-nature-light rounded-lg text-sm hover:bg-nature-light transition-colors"
            >
              Voir le site
            </a>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-900/30 border border-red-500/50 rounded-lg text-red-400 text-sm hover:bg-red-900/50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Message toast */}
      {message && (
        <div className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          message.type === 'error'
            ? 'bg-red-900/90 border border-red-500/50 text-red-300'
            : 'bg-green-900/90 border border-green-500/50 text-green-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-nature-light mb-6 overflow-x-auto whitespace-nowrap scrollbar-hide">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'profile' 
                ? 'border-green-500 text-green-400 bg-green-500/10' 
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <User className="w-4 h-4" />
            Mon Profil
          </button>
          
          {role === 'admin' && (
            <>
              <button
                onClick={() => setActiveTab('activities')}
                className={`flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition-colors ${
                  activeTab === 'activities' 
                    ? 'border-green-500 text-green-400 bg-green-500/10' 
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <List className="w-4 h-4" />
                Activités & Hébergements
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition-colors ${
                  activeTab === 'users' 
                    ? 'border-green-500 text-green-400 bg-green-500/10' 
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <Users className="w-4 h-4" />
                Utilisateurs
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition-colors ${
                  activeTab === 'stats' 
                    ? 'border-green-500 text-green-400 bg-green-500/10' 
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <BarChart className="w-4 h-4" />
                Statistiques
              </button>
            </>
          )}
        </div>

        {activeTab === 'profile' && (
          <AdminProfile token={token} showMessage={showMessage} />
        )}

        {role === 'admin' && activeTab === 'activities' && (
          <div className="space-y-4">
            {itinerary.map((item) => (
          <div
            key={item.id}
            className="bg-nature-dark border border-nature-light rounded-xl overflow-hidden shadow-xl shadow-black/40 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
          >
            {/* Row header - always visible */}
            <div
              className="flex flex-col md:flex-row items-start md:items-center justify-between px-6 py-4 cursor-pointer hover:bg-nature/50 transition-colors gap-3 md:gap-0"
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 w-full">
                <span className="text-gray-400 text-sm font-mono md:w-24 shrink-0">{formatDate(item.date)}</span>
                <h3 className="font-bold text-lg leading-tight">{item.title}</h3>
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full border w-fit ${
                  item.status === 'RÉSERVÉ' ? 'bg-green-900/50 text-green-400 border-green-500' :
                  item.status?.includes('Validé') ? 'bg-blue-900/50 text-blue-400 border-blue-500' :
                  'bg-yellow-900/50 text-yellow-400 border-yellow-500'
                }`}>
                  {item.status?.toUpperCase() || 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-3 mt-2 md:mt-0">
                {item.accommodation ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Home className="w-3 h-3" />
                    {item.accommodation.isActivityAccommodation ? 'Nuit sur place' : item.accommodation.name || 'À prévoir'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-orange-400">
                    <Home className="w-3 h-3" />
                    Pas d'hébergement
                  </span>
                )}
                {expandedId === item.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </div>
            </div>

            {/* Expanded edit form */}
            {expandedId === item.id && (
              <div className="px-6 pb-6 border-t border-nature-light pt-4 space-y-4">
                {/* Row 1: Date, Day, Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Date</label>
                    <input
                      type="date"
                      value={item.date}
                      onChange={(e) => updateField(item.id, 'date', e.target.value)}
                      className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Statut</label>
                    <select
                      value={item.status}
                      onChange={(e) => updateField(item.id, 'status', e.target.value)}
                      className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    >
                      <option value="À faire">À faire</option>
                      <option value="À réserver">À réserver</option>
                      <option value="À réserver / À faire">À réserver / À faire</option>
                      <option value="RÉSERVÉ">RÉSERVÉ</option>
                      <option value="Validé">Validé</option>
                      <option value="À faire / Validé">À faire / Validé</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Title, Location */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Titre</label>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => updateField(item.id, 'title', e.target.value)}
                      className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Lieu</label>
                    <input
                      type="text"
                      value={item.location}
                      onChange={(e) => updateField(item.id, 'location', e.target.value)}
                      className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Row 3: Description */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Description</label>
                  <textarea
                    value={item.description}
                    onChange={(e) => updateField(item.id, 'description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none resize-none"
                  />
                </div>

                {/* Row 4: Price, Providers, Coordinates */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Prix (€)</label>
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => updateField(item.id, 'price', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Prestataires (séparés par ,)</label>
                    <input
                      type="text"
                      value={(item.providers || []).join(', ')}
                      onChange={(e) => handleProvidersChange(item.id, e.target.value)}
                      className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={item.coordinates[0]}
                      onChange={(e) => updateField(item.id, 'coordinates', [parseFloat(e.target.value) || 0, item.coordinates[1]])}
                      className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={item.coordinates[1]}
                      onChange={(e) => updateField(item.id, 'coordinates', [item.coordinates[0], parseFloat(e.target.value) || 0])}
                      className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Accommodation Section */}
                <div className="mt-4 p-4 bg-[#0a1a0a] rounded-lg border border-nature-light">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="flex items-center gap-2 font-bold text-sm">
                      <Home className="w-4 h-4 text-green-400" />
                      Hébergement pour la nuit
                    </h4>
                    {item.accommodation === null ? (
                      <button
                        onClick={() => addAccommodation(item.id)}
                        className="px-3 py-1 text-xs bg-green-900/30 border border-green-500/50 text-green-400 rounded-lg hover:bg-green-900/50 transition-colors"
                      >
                        + Ajouter un hébergement
                      </button>
                    ) : (
                      <button
                        onClick={() => removeAccommodation(item.id)}
                        className="px-3 py-1 text-xs bg-red-900/30 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-900/50 transition-colors"
                      >
                        Retirer
                      </button>
                    )}
                  </div>

                  {item.accommodation === null ? (
                    <p className="text-orange-400 text-sm">🏠 Hébergement : À prévoir</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Checkbox: activity = accommodation */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.accommodation.isActivityAccommodation}
                          onChange={() => toggleActivityAccommodation(item.id)}
                          className="rounded border-nature-light text-green-500 focus:ring-green-500 w-4 h-4"
                        />
                        <span className="text-sm text-gray-300">L'activité fait office d'hébergement (ex: Carbet flottant)</span>
                      </label>

                      {!item.accommodation.isActivityAccommodation && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Nom du lieu</label>
                            <input
                              type="text"
                              value={item.accommodation.name}
                              onChange={(e) => updateAccommodation(item.id, 'name', e.target.value)}
                              placeholder="Ex: Matoury (Chez l'oncle)"
                              className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Latitude</label>
                            <input
                              type="number"
                              step="0.0001"
                              value={item.accommodation.coordinates[0]}
                              onChange={(e) => updateAccommodation(item.id, 'coordinates', [parseFloat(e.target.value) || 0, item.accommodation.coordinates[1]])}
                              className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Longitude</label>
                            <input
                              type="number"
                              step="0.0001"
                              value={item.accommodation.coordinates[1]}
                              onChange={(e) => updateAccommodation(item.id, 'coordinates', [item.accommodation.coordinates[0], parseFloat(e.target.value) || 0])}
                              className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {item.accommodation.isActivityAccommodation && (
                        <p className="text-green-400 text-sm">✅ Nuit sur place — les coordonnées de l'activité seront utilisées</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0 pt-2">
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-red-900/30 border border-red-500/50 text-red-400 rounded-lg text-sm hover:bg-red-900/50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer
                  </button>
                  <button
                    onClick={() => saveItem(item)}
                    disabled={saving === item.id}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-lg text-sm hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Save className="w-4 h-4" />
                    {saving === item.id ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add button */}
        <button
          onClick={addItem}
          className="w-full py-4 border-2 border-dashed border-nature-light rounded-xl text-gray-400 hover:text-white hover:border-green-500 hover:bg-green-500/5 transition-all flex items-center justify-center gap-2 hover:-translate-y-1"
        >
          <Plus className="w-5 h-5" />
          Ajouter une activité
        </button>
          </div>
        )}
        
        {activeTab === 'users' && (
          <AdminUsers token={token} showMessage={showMessage} handleLogout={handleLogout} />
        )}

        {activeTab === 'stats' && (
          <AdminStats token={token} showMessage={showMessage} handleLogout={handleLogout} />
        )}
      </main>
    </div>
  );
};

export default AdminPanel;
