import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { UserPlus, Shield, Trash2, Plus, ArrowLeftRight, Link2, QrCode, Copy, Check, Clock } from 'lucide-react';

const AdminUsers = ({ token, showMessage, handleLogout }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Génération d'invitation par lien / QR code
  const [inviteRole, setInviteRole] = useState('user');
  const [inviteHours, setInviteHours] = useState('24');
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteQr, setInviteQr] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    setCopied(false);
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: inviteRole, hours: parseInt(inviteHours, 10) }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) return handleLogout();
        throw new Error(data.error || 'Erreur de génération');
      }
      const url = `${window.location.origin}/invite/${data.token}`;
      const qr = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      setInviteLink(url);
      setInviteQr(qr);
      setInviteExpiresAt(data.expiresAt);
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showMessage('Impossible de copier le lien', 'error');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) return handleLogout();
        throw new Error('Erreur');
      }
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      showMessage('Erreur lors du chargement des utilisateurs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    setCreating(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la création');
      }

      const newUser = await res.json();
      setUsers([...users, newUser]);
      setNewUsername('');
      setNewPassword('');
      showMessage(`Utilisateur "${newUser.username}" créé avec succès`);
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleRole = async (id, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ role: newRole })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors du changement de rôle');
      }

      setUsers(users.map(u => u.id === id ? { ...u, role: newRole } : u));
      showMessage(`Rôle de l'utilisateur modifié`);
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleDeleteUser = async (id, username) => {
    if (!confirm(`Supprimer définitivement l'utilisateur "${username}" ?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la suppression');
      }

      setUsers(users.filter(u => u.id !== id));
      showMessage('Utilisateur supprimé');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Création */}
      <div className="bg-nature-dark border border-nature-light p-6 rounded-xl shadow-xl shadow-black/40 hover:shadow-2xl transition-all duration-300">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-green-500" />
          Nouvel Utilisateur
        </h3>
        <form onSubmit={handleCreateUser} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-1/3">
            <label className="block text-xs text-gray-400 mb-1">Nom d'utilisateur</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
              required
            />
          </div>
          <div className="w-full md:w-1/3">
            <label className="block text-xs text-gray-400 mb-1">Mot de passe provisoire</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newUsername || !newPassword}
            className="w-full md:w-auto px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Création...' : 'Créer'}
          </button>
        </form>
      </div>

      {/* Invitation par lien / QR code */}
      <div className="bg-nature-dark border border-nature-light p-6 rounded-xl shadow-xl shadow-black/40">
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
          <QrCode className="w-5 h-5 text-green-500" />
          Inviter par lien / QR code
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Génère un lien (et son QR code) permettant de créer un compte. Réutilisable jusqu'à expiration.
        </p>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-auto">
            <label className="block text-xs text-gray-400 mb-1">Rôle attribué</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-xs text-gray-400 mb-1">Validité</label>
            <select
              value={inviteHours}
              onChange={(e) => setInviteHours(e.target.value)}
              className="w-full px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
            >
              <option value="1">1 heure</option>
              <option value="6">6 heures</option>
              <option value="12">12 heures</option>
              <option value="24">24 heures</option>
            </select>
          </div>
          <button
            onClick={handleGenerateInvite}
            disabled={generatingInvite}
            className="w-full md:w-auto px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Link2 className="w-4 h-4" />
            {generatingInvite ? 'Génération...' : 'Générer'}
          </button>
        </div>

        {inviteLink && (
          <div className="mt-6 flex flex-col md:flex-row gap-6 items-center md:items-start bg-[#0a1a0a] border border-nature-light rounded-lg p-4">
            <img src={inviteQr} alt="QR code d'invitation" className="w-40 h-40 rounded-lg bg-white p-2 shrink-0" />
            <div className="flex-1 w-full min-w-0">
              <label className="block text-xs text-gray-400 mb-1">Lien d'invitation</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 px-3 py-2 bg-[#112211] border border-nature-light rounded-lg text-white text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-2 bg-nature border border-nature-light rounded-lg text-sm hover:bg-nature-light transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
              {inviteExpiresAt && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-yellow-400">
                  <Clock className="w-3.5 h-3.5" />
                  Expire le {new Date(inviteExpiresAt).toLocaleString('fr-FR')}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">Rôle attribué : {inviteRole === 'admin' ? 'Administrateur' : 'Utilisateur'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Liste */}
      <div className="bg-nature-dark border border-nature-light rounded-xl overflow-hidden shadow-xl shadow-black/40">
        <div className="px-6 py-4 border-b border-nature-light bg-[#0a1a0a]">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-500" />
            Utilisateurs Enregistrés ({users.length})
          </h3>
        </div>
        <div className="divide-y divide-nature-light">
          {users.map(user => (
            <div key={user.id} className="px-6 py-4 flex items-center justify-between hover:bg-nature/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-green-900/50 flex items-center justify-center text-green-400 font-bold uppercase shrink-0">
                  {user.username.charAt(0)}
                </div>
                <div>
                  <div className="font-bold">{user.username}</div>
                  <div className="text-xs text-gray-400">Rôle : {user.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</div>
                </div>
              </div>
              
              {user.id !== 1 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleRole(user.id, user.role)}
                    className="p-2 text-blue-400 hover:bg-blue-900/30 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
                    title={user.role === 'admin' ? 'Passer User' : 'Passer Admin'}
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    {user.role === 'admin' ? 'Retirer Admin' : 'Rendre Admin'}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id, user.username)}
                    className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              )}
              {user.id === 1 && (
                <span className="text-xs bg-green-900/30 text-green-500 px-2 py-1 rounded-full border border-green-500/50">Compte Principal</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;
