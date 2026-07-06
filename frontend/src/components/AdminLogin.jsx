import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';

const AdminLogin = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erreur de connexion');
        setLoading(false);
        return;
      }

      localStorage.setItem('adminToken', data.token);
      navigate('/admin/panel');
    } catch (err) {
      setError('Impossible de contacter le serveur');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#112211] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-nature rounded-full mb-4 border-2 border-nature-light">
            <Lock className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">Administration</h1>
          <p className="text-gray-400 mt-2">Guyane 2026 — Panneau de gestion</p>
        </div>

        {/* Login Card */}
        <div className="bg-nature-dark border border-nature-light rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Entrez le mot de passe..."
                  className="w-full px-4 py-3 bg-[#112211] border border-nature-light rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-lg hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connexion...
                </span>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <a href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Retour au site
          </a>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
