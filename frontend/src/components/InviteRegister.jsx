import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { UserPlus, Lock, User, ShieldCheck, XCircle } from 'lucide-react';
import { setAuth, getToken, upgradeToPersistent } from '../utils/auth';
import RememberPrompt from './RememberPrompt';

const InviteRegister = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [invite, setInvite] = useState(null); // { role, expiresAt }
  const [invalid, setInvalid] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showRemember, setShowRemember] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) setInvite({ role: data.role, expiresAt: data.expiresAt });
        else setInvalid(true);
      })
      .catch(() => setInvalid(true))
      .finally(() => setChecking(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/invite/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setAuth({ token: data.token, username: data.username, role: data.role }, false);
        setShowRemember(true);
      } else {
        setError(data.error || 'Erreur lors de l\'inscription');
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRememberChoice = async (persistent) => {
    if (persistent) {
      try {
        const res = await fetch('/api/auth/remember', {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (res.ok && data.token) upgradeToPersistent(data.token);
      } catch (err) {
        /* on garde la session courte */
      }
    }
    navigate('/admin/panel');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0a1a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-green-500" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-[#0a1a0a] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-[#112211] border border-red-900/50 p-8 rounded-2xl text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Invitation invalide ou expirée</h1>
          <p className="text-gray-400 text-sm mb-6">Ce lien n'est plus valide. Demandez une nouvelle invitation à l'organisateur du voyage.</p>
          <Link to="/" className="inline-block px-5 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold transition-colors">Retour au site</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1a0a] text-white flex items-center justify-center px-4 py-10">
      {showRemember && <RememberPrompt onChoice={handleRememberChoice} />}
      <div className="w-full max-w-md bg-[#112211] border border-green-900/50 p-8 rounded-2xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50"></div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center border border-green-500/20">
            <UserPlus className="w-5 h-5 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold">Rejoindre le voyage</h1>
        </div>
        <p className="text-gray-400 text-sm mb-4">Créez votre accès pour consulter et enrichir l'itinéraire.</p>

        {invite?.role === 'admin' && (
          <div className="mb-6 flex items-center gap-2 text-xs bg-blue-900/30 border border-blue-500/40 text-blue-300 px-3 py-2 rounded-lg">
            <ShieldCheck className="w-4 h-4" />
            Ce lien crée un compte administrateur.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Nom d'utilisateur</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-green-900/50 rounded-xl bg-[#0a1a0a] text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all"
                placeholder="votre pseudo"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Mot de passe</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-green-900/50 rounded-xl bg-[#0a1a0a] text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Confirmer le mot de passe</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-green-900/50 rounded-xl bg-[#0a1a0a] text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 focus:ring-offset-[#112211] disabled:opacity-50 transition-all"
          >
            {submitting ? 'Création…' : 'Créer mon compte →'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default InviteRegister;
