import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, AreaChart, Area } from 'recharts';
import { Activity, Clock, Calendar as CalendarIcon, TrendingUp } from 'lucide-react';

const AdminStats = ({ token, showMessage, handleLogout }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    dailyData: [],
    monthlyData: [],
    hourlyData: []
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) return handleLogout();
        throw new Error('Erreur de récupération des statistiques');
      }
      
      const timestamps = await res.json();
      processData(timestamps);
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const processData = (timestamps) => {
    const dates = timestamps.map(ts => new Date(ts));
    
    // 1. Vues sur les 14 derniers jours
    const last14Days = {};
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      last14Days[dateStr] = 0;
    }
    
    dates.forEach(d => {
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      if (last14Days[dateStr] !== undefined) {
        last14Days[dateStr]++;
      }
    });
    
    const dailyData = Object.keys(last14Days).map(key => ({
      name: key,
      Vues: last14Days[key]
    }));

    // 2. Vues par mois (Année en cours)
    const currentYear = today.getFullYear();
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const monthlyCounts = new Array(12).fill(0);
    
    dates.forEach(d => {
      if (d.getFullYear() === currentYear) {
        monthlyCounts[d.getMonth()]++;
      }
    });
    
    const monthlyData = months.map((m, i) => ({
      name: m,
      Vues: monthlyCounts[i]
    }));

    // 3. Répartition horaire
    const hourlyCounts = new Array(24).fill(0);
    dates.forEach(d => {
      hourlyCounts[d.getHours()]++;
    });
    
    const hourlyData = hourlyCounts.map((count, i) => ({
      name: `${i}h`,
      Vues: count
    }));

    setStats({
      total: timestamps.length,
      dailyData,
      monthlyData,
      hourlyData
    });
  };

  if (loading) {
    return <div className="text-center py-10 text-gray-400 animate-pulse">Calcul des statistiques...</div>;
  }

  // Composant graphique personnalisé
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#112211] border border-green-500/30 p-3 rounded-lg shadow-xl">
          <p className="text-gray-300 mb-1">{label}</p>
          <p className="text-green-400 font-bold">
            {payload[0].value} {payload[0].value > 1 ? 'visites' : 'visite'}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-nature-dark border border-nature-light p-6 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-green-500/10 rounded-lg text-green-500">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-gray-400">Total des visites</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </div>
        </div>
        
        <div className="bg-nature-dark border border-nature-light p-6 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-500">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-gray-400">Visites aujourd'hui</div>
            <div className="text-2xl font-bold text-white">
              {stats.dailyData.length > 0 ? stats.dailyData[stats.dailyData.length - 1].Vues : 0}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graphique 14 jours */}
        <div className="bg-nature-dark border border-nature-light p-6 rounded-xl">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-green-500" />
            Visites sur les 14 derniers jours
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVues" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                  <filter id="shadowArea" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.5"/>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3a2a" vertical={false} />
                <XAxis dataKey="name" stroke="#4b5563" fontSize={12} tickMargin={10} />
                <YAxis stroke="#4b5563" fontSize={12} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#22c55e', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="Vues" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorVues)" filter="url(#shadowArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graphique Horaire */}
        <div className="bg-nature-dark border border-nature-light p-6 rounded-xl">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-green-500" />
            Répartition par heure de la journée
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="barHourly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <filter id="shadowBar" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.5"/>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3a2a" vertical={false} />
                <XAxis dataKey="name" stroke="#4b5563" fontSize={12} tickMargin={10} />
                <YAxis stroke="#4b5563" fontSize={12} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#22c55e', opacity: 0.1 }} />
                <Bar dataKey="Vues" fill="url(#barHourly)" radius={[4, 4, 0, 0]} filter="url(#shadowBar)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graphique Mensuel */}
        <div className="bg-nature-dark border border-nature-light p-6 rounded-xl lg:col-span-2">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-green-500" />
            Visites mensuelles ({new Date().getFullYear()})
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="barMonthly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fde047" />
                    <stop offset="100%" stopColor="#ca8a04" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3a2a" vertical={false} />
                <XAxis dataKey="name" stroke="#4b5563" fontSize={12} tickMargin={10} />
                <YAxis stroke="#4b5563" fontSize={12} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#fde047', opacity: 0.1 }} />
                <Bar dataKey="Vues" fill="url(#barMonthly)" radius={[4, 4, 0, 0]} filter="url(#shadowBar)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminStats;
