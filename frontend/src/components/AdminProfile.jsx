import React, { useState } from 'react';
import { User, Lock, Save } from 'lucide-react';
import { getUsername, patchAuth } from '../utils/auth';

const AdminProfile = ({ token, showMessage }) => {
  const [username, setUsername] = useState(getUsername() || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, password: password || undefined })
      });

      const data = await res.json();
      if (res.ok) {
        showMessage('Profil mis à jour avec succès', 'success');
        patchAuth({ adminUsername: data.username, adminToken: data.token });
        setPassword('');
      } else {
        showMessage(data.error || 'Erreur lors de la mise à jour', 'error');
      }
    } catch (err) {
      showMessage('Erreur de connexion', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-nature-dark border border-nature-light p-6 rounded-xl shadow-xl shadow-black/40">
      <div className="flex items-center gap-3 mb-6">
        <User className="w-5 h-5 text-green-500" />
        <h2 className="text-xl font-bold">Mon Profil</h2>
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Nom d'utilisateur</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-[#0a1a0a] border border-nature-light rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Nouveau mot de passe (optionnel)</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-4 w-4 text-gray-500" />
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0a1a0a] border border-nature-light rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-green-500"
              placeholder="Laisser vide pour ne pas changer"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
    </div>
  );
};

export default AdminProfile;
