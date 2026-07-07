import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, User, CheckCircle2 } from 'lucide-react';

const AdminLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminUsername', data.username);
        localStorage.setItem('adminRole', data.role);
        navigate('/admin/panel');
      } else {
        setError(data.error || 'Identifiants incorrects');
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0a1a0a] text-white font-sans">
      {/* Left Pane - Branding & Info */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#050d05] overflow-hidden flex-col justify-center px-12 xl:px-24">
        {/* Abstract background elements */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-green-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 mb-8">
          <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300 mb-4 tracking-tight">
            Voyage Guyane
          </h1>
          <h2 className="text-sm font-bold tracking-[0.2em] text-gray-400 uppercase mb-6">
            Espace d'Administration
          </h2>
          <p className="text-gray-300 max-w-md text-lg leading-relaxed">
            Gérez votre itinéraire, mettez à jour vos activités, et suivez vos hébergements en temps réel depuis cette console centralisée.
          </p>
        </div>

        <div className="relative z-10 mt-12 space-y-4">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span>Gestion de l'itinéraire et hébergements</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span>Suivi du budget global</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span>Gestion multi-utilisateurs et accès sécurisé</span>
          </div>
        </div>
      </div>

      {/* Right Pane - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[#0a1a0a]">
        <div className="w-full max-w-md bg-[#112211] border border-green-900/50 p-10 rounded-2xl shadow-2xl relative overflow-hidden">
          {/* Subtle top glow */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50"></div>
          
          <Link to="/" className="absolute top-4 right-4 text-xs font-bold text-gray-400 hover:text-white bg-[#0a1a0a] border border-green-900/50 hover:border-green-500 px-3 py-1.5 rounded-full transition-all">
            Retour au site
          </Link>

          <div className="flex items-center gap-3 mb-8 mt-2">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center border border-green-500/20">
              <Lock className="w-5 h-5 text-green-400" />
            </div>
            <h2 className="text-3xl font-bold">Connexion</h2>
          </div>
          
          <p className="text-gray-400 mb-8 text-sm">Accédez à votre espace sécurisé.</p>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Utilisateur</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-green-900/50 rounded-xl bg-[#0a1a0a] text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all"
                  placeholder="nom d'utilisateur"
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

            {error && (
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 rounded-xl shadow-sm text-sm font-bold text-white bg-green-600 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 focus:ring-offset-[#112211] disabled:opacity-50 transition-all transform hover:-translate-y-0.5"
            >
              {loading ? 'Connexion...' : 'Se connecter →'}
            </button>
            
            <div className="mt-8 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
              <Lock className="w-3 h-3" />
              Authentification par jeton sécurisé (JWT)
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
