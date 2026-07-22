import React from 'react';

// Petit repère de version (hash du commit + date de build), injecté au build.
// Permet de voir d'un coup d'œil sur quelle version déployée on se trouve.
const VersionTag = () => {
  const version = import.meta.env.VITE_APP_VERSION || 'dev';
  const date = import.meta.env.VITE_BUILD_DATE || '';
  return (
    <div
      className="fixed bottom-1 left-2 z-[90] text-[10px] leading-none text-white/25 select-none pointer-events-none font-mono"
      title={date ? `Version ${version} — ${date}` : `Version ${version}`}
    >
      v{version}{date ? ` · ${date}` : ''}
    </div>
  );
};

export default VersionTag;
