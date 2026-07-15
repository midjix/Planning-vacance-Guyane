// Formate une date ISO ("YYYY-MM-DD") en libellé court français, ex: "16 Juillet".
//
// Une chaîne "YYYY-MM-DD" est interprétée par le navigateur comme minuit UTC.
// L'affichage se faisant ensuite dans le fuseau du visiteur, tout visiteur à
// l'ouest de Greenwich (ex: Guyane, UTC-3) voyait la date reculée d'un jour.
// On force donc un parsing en heure locale en ajoutant l'heure "T00:00:00".
export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const localStr = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T00:00:00` : dateStr;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return dateStr;
  const parts = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).split(' ');
  if (parts.length > 1) {
    return `${parts[0]} ${parts[1].charAt(0).toUpperCase() + parts[1].slice(1)}`;
  }
  return dateStr;
};
