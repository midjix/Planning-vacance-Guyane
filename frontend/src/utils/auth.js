// Gestion centralisée de l'authentification côté client.
//
// Deux stockages possibles selon le choix "rester connecté" :
//  - localStorage   : persistant (survit à la fermeture du navigateur) -> session 30 jours
//  - sessionStorage : éphémère (effacé à la fermeture du navigateur)    -> session courte
// On lit toujours les deux, on n'écrit que dans l'un et on purge l'autre.

const KEYS = ['adminToken', 'adminUsername', 'adminRole'];

const read = (k) => localStorage.getItem(k) || sessionStorage.getItem(k);

export const getToken = () => read('adminToken');
export const getUsername = () => read('adminUsername');
export const getRole = () => read('adminRole');
export const isLoggedIn = () => !!getToken();

// Enregistre l'auth dans le stockage voulu et purge l'autre pour éviter les doublons.
export const setAuth = ({ token, username, role }, persistent) => {
  const store = persistent ? localStorage : sessionStorage;
  const other = persistent ? sessionStorage : localStorage;
  KEYS.forEach((k) => other.removeItem(k));
  store.setItem('adminToken', token);
  store.setItem('adminUsername', username);
  store.setItem('adminRole', role);
};

// Efface toute trace d'auth (déconnexion).
export const clearAuth = () => {
  KEYS.forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
};

// Passe la session courante en persistante (localStorage) avec un nouveau token long.
export const upgradeToPersistent = (token) => {
  const username = getUsername();
  const role = getRole();
  clearAuth();
  localStorage.setItem('adminToken', token);
  localStorage.setItem('adminUsername', username);
  localStorage.setItem('adminRole', role);
};

// Met à jour certains champs dans le stockage actif (ex: pseudo/token après édition du profil).
export const patchAuth = (patch) => {
  const store = localStorage.getItem('adminToken') ? localStorage : sessionStorage;
  Object.entries(patch).forEach(([k, v]) => { if (v !== undefined) store.setItem(k, v); });
};
