const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const archiver = require('archiver');
const Jimp = require('jimp');
const { Transform } = require('stream');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8081;

// Clé secrète pour signer les JWT. Elle est PERSISTÉE dans le volume de données
// (data/.jwt_secret) et devient la référence : une fois créée, elle ne change
// plus, même si la variable d'environnement varie d'un déploiement à l'autre.
// Sinon les utilisateurs "restés connectés" seraient déconnectés à chaque
// redéploiement (leurs tokens deviendraient invalides).
const JWT_SECRET = (() => {
  const secretFile = path.join(__dirname, 'data', '.jwt_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf-8').trim();
      if (existing) return existing;
    }
    // Première initialisation : on part de la valeur d'env si fournie (pour
    // conserver les sessions existantes), sinon on génère une clé aléatoire forte.
    const seed = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, seed, 'utf-8');
    if (!process.env.JWT_SECRET) {
      console.warn('JWT_SECRET non fourni : une clé stable a été générée et persistée dans data/.jwt_secret.');
    }
    return seed;
  } catch (err) {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET; // dernier recours : au moins démarrer
    console.error('Impossible d\'initialiser le secret JWT :', err.message);
    process.exit(1);
  }
})();

// Clé de chiffrement des médias au repos (AES-256, 32 octets en hexadécimal).
// Optionnelle : si absente, les fichiers sont stockés en clair (avec un avertissement).
const MEDIA_KEY = (() => {
  const hex = process.env.MEDIA_ENCRYPTION_KEY;
  if (!hex) {
    console.warn('MEDIA_ENCRYPTION_KEY non défini : les médias sont stockés EN CLAIR. Définis une clé (openssl rand -hex 32) pour activer le chiffrement.');
    return null;
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    console.error('Erreur: MEDIA_ENCRYPTION_KEY doit faire 32 octets (64 caractères hexadécimaux).');
    process.exit(1);
  }
  return buf;
})();

// Chemin vers les fichiers de données
const ITINERARY_FILE = path.join(__dirname, 'data', 'itinerary.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const ANALYTICS_FILE = path.join(__dirname, 'data', 'analytics.json');
const EVENTS_FILE = path.join(__dirname, 'data', 'events.json');
// Répertoire des photos liées aux activités (persisté dans le volume backend-data)
const PHOTOS_DIR = path.join(__dirname, 'data', 'photos');

// Fonctions utilitaires pour lire/écrire les fichiers JSON
function readItinerary() {
  const raw = fs.readFileSync(ITINERARY_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeItinerary(data) {
  fs.writeFileSync(ITINERARY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    // Créer un utilisateur admin par défaut
    if (!process.env.ADMIN_DEFAULT_PASSWORD) {
      console.warn('ADMIN_DEFAULT_PASSWORD non défini, utilisation d\'un mot de passe par défaut. Change-le après la première connexion.');
    }
    const defaultUsers = [{
      id: 1,
      username: 'admin',
      passwordHash: bcrypt.hashSync(process.env.ADMIN_DEFAULT_PASSWORD || 'Weko@Guy973', 10),
      role: 'admin'
    }];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2), 'utf-8');
    return defaultUsers;
  }
  const raw = fs.readFileSync(USERS_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function readAnalytics() {
  if (!fs.existsSync(ANALYTICS_FILE)) {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify([], null, 2), 'utf-8');
    return [];
  }
  const raw = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeAnalytics(data) {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ---- Journal de diagnostic (télémétrie envoyée par le navigateur) ----
const MAX_EVENTS = 5000; // journal glissant

function readEvents() {
  try {
    if (fs.existsSync(EVENTS_FILE)) return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));
  } catch (err) { /* journal corrompu -> on repart de zéro */ }
  return [];
}

function writeEvents(list) {
  try { fs.writeFileSync(EVENTS_FILE, JSON.stringify(list), 'utf-8'); } catch (err) { /* best effort */ }
}

// Ne conserve que des champs connus, tronqués : le journal ne doit jamais grossir sans limite.
const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v) => (Number.isFinite(v) ? v : undefined);
function sanitizeEvent(e) {
  if (!e || typeof e !== 'object' || !e.type) return null;
  return {
    at: Date.now(),
    type: str(e.type, 40),
    user: str(e.user, 60),
    kind: str(e.kind, 20),          // photo | video
    mode: str(e.mode, 20),          // single | chunked
    size: num(e.size),
    durationMs: num(e.durationMs),
    speed: num(e.speed),            // octets/s
    status: num(e.status),          // code HTTP éventuel
    attempt: num(e.attempt),
    count: num(e.count),
    total: num(e.total),
    detail: str(e.detail, 300),
    path: str(e.path, 120),
    device: str(e.device, 20),
    browser: str(e.browser, 20),
    os: str(e.os, 20),
    activityId: str(String(e.activityId ?? ''), 12) || undefined,
  };
}

app.use(cors());
app.use(express.json());

// Middleware d'authentification JWT (session uniquement)
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Les tokens spécialisés (invitation, média) ne sont pas des sessions : on les refuse ici.
    if (decoded.type) return res.status(401).json({ error: 'Token invalide' });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// Auth pour la lecture des médias : accepte un token de session (en-tête) OU un
// token média court passé en query (?token=), car <img>/<video> ne peuvent pas
// envoyer d'en-tête d'autorisation. Le token média (type "media") ne donne accès
// qu'à cette route, jamais aux actions privilégiées (bloqué par authMiddleware).
function mediaAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.split(' ')[1]
    : (typeof req.query.token === 'string' ? req.query.token : null);
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// Middleware pour restreindre l'accès aux administrateurs
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé. Réservé aux administrateurs.' });
  }
  next();
}

// Génère un token de session pour un utilisateur, avec une durée de vie donnée.
function issueToken(user, expiresIn) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn });
}

// ==================== ROUTES PUBLIQUES ====================

// Endpoint pour récupérer l'itinéraire
app.get('/api/itinerary', (req, res) => {
  try {
    const itinerary = readItinerary();
    res.json(itinerary);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture des données' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Enregistrer une visite (tracking d'audience)
app.post('/api/track', (req, res) => {
  try {
    const analytics = readAnalytics();
    analytics.push(Date.now());
    writeAnalytics(analytics);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la visite' });
  }
});

// Réception des événements de diagnostic (sans auth : on veut aussi capter les
// erreurs des visiteurs non connectés ; les données sont filtrées et plafonnées).
app.post('/api/events', (req, res) => {
  try {
    const incoming = Array.isArray(req.body && req.body.events) ? req.body.events.slice(0, 50) : [];
    const clean = incoming.map(sanitizeEvent).filter(Boolean);
    if (clean.length > 0) {
      const all = readEvents().concat(clean);
      writeEvents(all.slice(-MAX_EVENTS));
    }
    res.status(204).end();
  } catch (err) {
    res.status(204).end(); // la télémétrie ne doit jamais gêner l'utilisateur
  }
});

// Consultation du journal de diagnostic (admin)
app.get('/api/admin/events', authMiddleware, adminOnly, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 1000, MAX_EVENTS);
    const all = readEvents();
    res.json(all.slice(-limit).reverse()); // plus récents d'abord
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture du journal' });
  }
});

// Rattrapage : génère les miniatures/versions allégées manquantes pour les
// vidéos déjà présentes (les médias uploadés avant cette fonctionnalité).
app.post('/api/admin/media/backfill', authMiddleware, adminOnly, (req, res) => {
  let queued = 0;
  try {
    if (fs.existsSync(PHOTOS_DIR)) {
      for (const activityId of fs.readdirSync(PHOTOS_DIR)) {
        const dir = path.join(PHOTOS_DIR, activityId);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const name of fs.readdirSync(dir)) {
          if (!isVideoName(name)) continue;
          const p = path.join(dir, name);
          if (!fs.existsSync(`${p}.thumb`) || !fs.existsSync(`${p}.low`)) {
            enqueueTranscode(dir, name);
            queued += 1;
          }
        }
      }
    }
    res.json({ queued });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors du rattrapage' });
  }
});

// Vider le journal de diagnostic (admin)
app.delete('/api/admin/events', authMiddleware, adminOnly, (req, res) => {
  writeEvents([]);
  res.json({ success: true });
});

// ==================== ROUTES ADMIN ====================

// Login admin
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
  }
  
  const users = readUsers();
  const user = users.find(u => u.username === username);
  
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  
  // Session courte par défaut ; l'utilisateur peut la prolonger via /api/auth/remember.
  const token = issueToken(user, '24h');
  res.json({ token, username: user.username, role: user.role });
});

// Prolonger la session courante ("rester connecté" 30 jours sur l'appareil)
app.post('/api/auth/remember', authMiddleware, (req, res) => {
  res.json({ token: issueToken(req.user, '30d') });
});

// Token court dédié à la lecture des médias (utilisable en query dans les URLs
// <img>/<video>). Périmètre réduit : ne permet que de lire les médias.
app.post('/api/media-token', authMiddleware, (req, res) => {
  res.json({ token: jwt.sign({ type: 'media', id: req.user.id }, JWT_SECRET, { expiresIn: '6h' }) });
});

// ==================== ROUTES INVITATIONS ====================

// Générer un lien/QR d'invitation (admin uniquement).
// Le token est un JWT signé auto-validant : réutilisable jusqu'à son expiration,
// sans stockage serveur. Durée entre 1h et 24h.
app.post('/api/admin/invites', authMiddleware, adminOnly, (req, res) => {
  const validRole = ['user', 'admin'].includes(req.body.role) ? req.body.role : 'user';
  const hours = parseInt(req.body.hours, 10);
  if (isNaN(hours) || hours < 1 || hours > 24) {
    return res.status(400).json({ error: 'Durée invalide (entre 1 et 24 heures)' });
  }
  const token = jwt.sign({ type: 'invite', role: validRole }, JWT_SECRET, { expiresIn: `${hours}h` });
  const decoded = jwt.decode(token);
  res.status(201).json({ token, role: validRole, expiresAt: decoded.exp * 1000 });
});

// Vérifier la validité d'une invitation (public, utilisé par la page d'inscription)
app.get('/api/invite/:token', (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, JWT_SECRET);
    if (decoded.type !== 'invite') throw new Error('Type invalide');
    res.json({ valid: true, role: decoded.role, expiresAt: decoded.exp * 1000 });
  } catch (err) {
    res.status(400).json({ valid: false, error: 'Lien d\'invitation invalide ou expiré' });
  }
});

// S'inscrire via une invitation (public)
app.post('/api/invite/register', (req, res) => {
  const { token, username, password } = req.body;
  if (!token || !username || !password) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'invite') throw new Error('Type invalide');
  } catch (err) {
    return res.status(400).json({ error: 'Lien d\'invitation invalide ou expiré' });
  }
  const users = readUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
  }
  const maxId = users.reduce((max, u) => Math.max(max, u.id), 0);
  const newUser = {
    id: maxId + 1,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: decoded.role === 'admin' ? 'admin' : 'user',
  };
  users.push(newUser);
  writeUsers(users);
  // Connexion automatique après inscription (session courte, prompt "rester connecté" côté client)
  res.status(201).json({ token: issueToken(newUser, '24h'), username: newUser.username, role: newUser.role });
});

// ==================== ROUTES STATISTIQUES ====================

// Récupérer les statistiques
app.get('/api/admin/analytics', authMiddleware, adminOnly, (req, res) => {
  try {
    const analytics = readAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture des statistiques' });
  }
});

// ==================== ROUTES UTILISATEURS ====================

// Lister les utilisateurs
app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  try {
    const users = readUsers();
    // Ne pas renvoyer les hashs de mot de passe
    const safeUsers = users.map(u => ({ id: u.id, username: u.username, role: u.role }));
    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture des utilisateurs' });
  }
});

// Créer un utilisateur
app.post('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Données manquantes' });
    
    const users = readUsers();
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
    }
    
    const maxId = users.reduce((max, u) => Math.max(max, u.id), 0);
    const newUser = {
      id: maxId + 1,
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      role: role || 'user'
    };
    
    users.push(newUser);
    writeUsers(users);
    res.status(201).json({ id: newUser.id, username: newUser.username, role: newUser.role });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de création utilisateur' });
  }
});

// Supprimer un utilisateur
app.delete('/api/admin/users/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    let users = readUsers();
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    
    // Empêcher la suppression du compte principal (id 1)
    if (id === 1) return res.status(403).json({ error: 'Impossible de supprimer l\'administrateur principal' });
    
    users.splice(index, 1);
    writeUsers(users);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de suppression' });
  }
});

// Changer le rôle d'un utilisateur
app.put('/api/admin/users/:id/role', authMiddleware, adminOnly, (req, res) => {
  try {
    const users = readUsers();
    const id = parseInt(req.params.id);
    const { role } = req.body;
    
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }
    
    if (id === 1) {
      return res.status(403).json({ error: 'Impossible de modifier le rôle de l\'administrateur principal' });
    }
    
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    
    users[userIndex].role = role;
    writeUsers(users);
    res.json({ success: true, id, role });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la modification du rôle' });
  }
});

// Modifier son propre profil
app.put('/api/admin/users/me', authMiddleware, (req, res) => {
  try {
    const { username, password } = req.body;
    const users = readUsers();
    
    const userIndex = users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    
    // Vérifier si le nouveau nom d'utilisateur n'est pas déjà pris par un autre
    if (username && username !== users[userIndex].username) {
      if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
      }
      users[userIndex].username = username;
    }
    
    if (password) {
      users[userIndex].passwordHash = bcrypt.hashSync(password, 10);
    }
    
    writeUsers(users);
    
    // Renvoyer un nouveau token si le pseudo change
    const newToken = jwt.sign(
      { id: users[userIndex].id, username: users[userIndex].username, role: users[userIndex].role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ success: true, username: users[userIndex].username, token: newToken });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
  }
});

// Modifier un item du planning
app.put('/api/admin/itinerary/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const itinerary = readItinerary();
    const id = parseInt(req.params.id);
    const index = itinerary.findIndex(item => item.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Activité non trouvée' });
    }
    // On fusionne les données existantes avec les nouvelles
    itinerary[index] = { ...itinerary[index], ...req.body, id };
    writeItinerary(itinerary);
    res.json(itinerary[index]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur de mise à jour' });
  }
});

// Créer un item
app.post('/api/admin/itinerary', authMiddleware, adminOnly, (req, res) => {
  try {
    const itinerary = readItinerary();
    const maxId = itinerary.reduce((max, item) => Math.max(max, item.id), 0);
    const newItem = {
      id: maxId + 1,
      date: req.body.date || '',
      day: req.body.day || '',
      title: req.body.title || 'Nouvelle activité',
      description: req.body.description || '',
      location: req.body.location || '',
      providers: req.body.providers || [],
      price: req.body.price || 0,
      status: req.body.status || 'À faire',
      coordinates: req.body.coordinates || [4.9, -52.3],
      accommodation: req.body.accommodation || null
    };
    itinerary.push(newItem);
    writeItinerary(itinerary);
    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: 'Erreur de création' });
  }
});

// Supprimer un item
app.delete('/api/admin/itinerary/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    let itinerary = readItinerary();
    const id = parseInt(req.params.id);
    const index = itinerary.findIndex(item => item.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Activité non trouvée' });
    }
    itinerary.splice(index, 1);
    writeItinerary(itinerary);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de suppression' });
  }
});

// ==================== ROUTES PHOTOS D'ACTIVITÉ ====================
// Accessibles à tout utilisateur authentifié (pas seulement admin).

// Renvoie le dossier des photos d'une activité, en refusant tout id non numérique
// (protection contre le path traversal).
function activityPhotoDir(rawId) {
  const id = parseInt(rawId, 10);
  if (isNaN(id) || id < 0) return null;
  return path.join(PHOTOS_DIR, String(id));
}

// Métadonnées par média (qui a uploadé, quand, nom d'origine), stockées dans un
// fichier .meta.json à côté des fichiers de l'activité.
function readPhotoMeta(dir) {
  try {
    const p = path.join(dir, '.meta.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (err) { /* meta corrompu -> on repart de zéro */ }
  return {};
}
function writePhotoMeta(dir, meta) {
  try { fs.writeFileSync(path.join(dir, '.meta.json'), JSON.stringify(meta)); } catch (err) { /* best effort */ }
}
function recordUpload(dir, filename, username, originalName) {
  const meta = readPhotoMeta(dir);
  meta[filename] = { by: username || null, at: Date.now(), originalName: originalName || null };
  writePhotoMeta(dir, meta);
}

// Extensions média autorisées (images + vidéos)
const ALLOWED_MEDIA_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic',
  '.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv',
];

// ---- Chiffrement au repos (AES-256-CTR) ----
// Format d'un fichier chiffré : [magic 8 octets][IV 16 octets][ciphertext].
const ENC_MAGIC = Buffer.from('ENCv1\0\0\0', 'binary');
const ENC_PREFIX_LEN = ENC_MAGIC.length + 16;

// Chiffre un flux lisible vers destPath (magic + IV + contenu chiffré).
function encryptStreamTo(readable, destPath) {
  return new Promise((resolve, reject) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-ctr', MEDIA_KEY, iv);
    const out = fs.createWriteStream(destPath);
    out.on('error', reject);
    out.on('finish', resolve);
    out.write(ENC_MAGIC);
    out.write(iv);
    readable.on('error', reject);
    readable.pipe(cipher).pipe(out);
  });
}

// Chiffre un fichier déjà écrit, sur place (no-op si pas de clé).
async function encryptFileInPlace(filePath) {
  if (!MEDIA_KEY) return;
  const tmp = `${filePath}.enc.tmp`;
  await encryptStreamTo(fs.createReadStream(filePath), tmp);
  fs.renameSync(tmp, filePath);
}

// Génère une miniature JPEG légère (max 500px) à partir d'une image en clair.
async function generateThumbnail(srcPath, thumbPath) {
  const image = await Jimp.read(srcPath);
  image.scaleToFit(500, 500);
  const buf = await image.getBufferAsync(Jimp.MIME_JPEG);
  fs.writeFileSync(thumbPath, buf);
}

// ---- Transcodage vidéo (version allégée pour une lecture fluide) ----
const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'];
const isVideoName = (name) => VIDEO_EXT.includes(path.extname(name).toLowerCase());

// Déchiffre un fichier vers une destination en clair (ou copie s'il est déjà en clair).
function decryptToFile(srcPath, destPath) {
  return new Promise((resolve, reject) => {
    const { encrypted, iv } = readEncInfo(srcPath);
    const out = fs.createWriteStream(destPath);
    out.on('error', reject);
    out.on('finish', resolve);
    if (!encrypted) { fs.createReadStream(srcPath).pipe(out); return; }
    const decipher = crypto.createDecipheriv('aes-256-ctr', MEDIA_KEY, iv);
    fs.createReadStream(srcPath, { start: ENC_PREFIX_LEN }).pipe(decipher).pipe(out);
  });
}

// Extrait une image de la vidéo pour servir de miniature (poster).
// On tente à 1s ; si la vidéo est plus courte, on retombe sur la toute première image.
function runFfmpegPoster(input, output) {
  const attempt = (seek) => new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y', '-ss', String(seek), '-i', input,
      '-frames:v', '1', '-vf', "scale='min(500,iw)':-2", '-q:v', '4',
      output,
    ]);
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 && fs.existsSync(output) ? resolve() : reject(new Error(`ffmpeg poster code ${code}`))));
  });
  return attempt(1).catch(() => attempt(0));
}

// Lance ffmpeg : mise à l'échelle max 854px de large (~480p), H.264 + AAC, faststart.
function runFfmpeg(input, output) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', input,
      '-vf', "scale='min(854,iw)':-2",
      '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      output,
    ];
    const proc = spawn('ffmpeg', args);
    proc.on('error', reject); // ffmpeg absent
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg code ${code}`))));
  });
}

function setLowStatus(dir, filename, status) {
  const meta = readPhotoMeta(dir);
  if (!meta[filename]) meta[filename] = {};
  meta[filename].lowStatus = status;
  writePhotoMeta(dir, meta);
}

// File de transcodage : un seul ffmpeg à la fois (on ménage le CPU du NAS).
const transcodeQueue = [];
let transcoding = false;
function enqueueTranscode(dir, filename) {
  transcodeQueue.push({ dir, filename });
  processTranscodeQueue();
}
async function processTranscodeQueue() {
  if (transcoding) return;
  transcoding = true;
  while (transcodeQueue.length > 0) {
    const { dir, filename } = transcodeQueue.shift();
    const originalPath = path.join(dir, filename);
    const lowPath = `${originalPath}.low`;
    const tmpIn = `${originalPath}.tin`;
    const tmpOut = `${originalPath}.tout.mp4`;
    const tmpPoster = `${originalPath}.tposter.jpg`;
    try {
      if (!fs.existsSync(originalPath)) continue;
      setLowStatus(dir, filename, 'pending');
      await decryptToFile(originalPath, tmpIn);

      // 1) Miniature (rapide) : on la produit d'abord pour que la galerie
      //    s'illustre sans attendre la fin du transcodage.
      if (!fs.existsSync(`${originalPath}.thumb`)) {
        try {
          await runFfmpegPoster(tmpIn, tmpPoster);
          await encryptFileInPlace(tmpPoster);
          fs.renameSync(tmpPoster, `${originalPath}.thumb`);
        } catch (err) { /* miniature best-effort */ }
      }

      // 2) Version allégée (lente)
      if (!fs.existsSync(lowPath)) {
        await runFfmpeg(tmpIn, tmpOut);
        await encryptFileInPlace(tmpOut);
        fs.renameSync(tmpOut, lowPath);
      }
      setLowStatus(dir, filename, 'ready');
    } catch (err) {
      setLowStatus(dir, filename, 'failed');
    } finally {
      [tmpIn, tmpOut, tmpPoster].forEach((p) => { try { if (fs.existsSync(p)) fs.rmSync(p, { force: true }); } catch (e) { /* ignore */ } });
    }
  }
  transcoding = false;
}

// Lit l'en-tête d'un fichier et indique s'il est chiffré, avec son IV.
function readEncInfo(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(ENC_PREFIX_LEN);
    const n = fs.readSync(fd, head, 0, ENC_PREFIX_LEN, 0);
    const encrypted = n >= ENC_PREFIX_LEN && head.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC);
    return { encrypted, iv: encrypted ? head.subarray(ENC_MAGIC.length, ENC_PREFIX_LEN) : null };
  } finally {
    fs.closeSync(fd);
  }
}

// Compteur CTR = IV avancé de `blockIndex` blocs (addition 128 bits).
// Permet de commencer le déchiffrement à n'importe quel bloc -> lecture par plage (seek vidéo).
function ivForBlock(iv, blockIndex) {
  let n = 0n;
  for (const b of iv) n = (n << 8n) | BigInt(b);
  n = (n + BigInt(blockIndex)) & ((1n << 128n) - 1n);
  const out = Buffer.alloc(16);
  for (let i = 15; i >= 0; i -= 1) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return out;
}

// Transform qui ignore `skip` octets en tête puis n'en laisse passer que `length`.
// Sert à extraire la plage exacte après un déchiffrement aligné sur les blocs.
function sliceTransform(skip, length) {
  let skipped = 0;
  let sent = 0;
  return new Transform({
    transform(chunk, enc, cb) {
      if (sent >= length) return cb();
      let c = chunk;
      if (skipped < skip) {
        const drop = Math.min(skip - skipped, c.length);
        skipped += drop;
        c = c.subarray(drop);
      }
      if (c.length === 0) return cb();
      const remaining = length - sent;
      if (c.length > remaining) c = c.subarray(0, remaining);
      sent += c.length;
      cb(null, c);
    },
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = activityPhotoDir(req.params.id);
    if (!dir) return cb(new Error('Identifiant d\'activité invalide'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Nom unique et sûr : timestamp + aléatoire + extension d'origine
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_MEDIA_EXT.includes(ext)
      ? ext
      : (file.mimetype.startsWith('video/') ? '.mp4' : '.jpg');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  // Limite par requête : 100 Mo (plafond du tunnel Cloudflare). Les fichiers
  // plus lourds passeront par l'upload en morceaux (phase suivante).
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Seules les images et vidéos sont autorisées'));
  },
});

// Lister les photos d'une activité
app.get('/api/activities/:id/photos', authMiddleware, (req, res) => {
  try {
    const dir = activityPhotoDir(req.params.id);
    if (!dir) return res.status(400).json({ error: 'Identifiant invalide' });
    if (!fs.existsSync(dir)) return res.json([]);
    const meta = readPhotoMeta(dir);
    const files = fs.readdirSync(dir)
      .filter(name => ALLOWED_MEDIA_EXT.includes(path.extname(name).toLowerCase()))
      .map(name => {
        const stat = fs.statSync(path.join(dir, name));
        const m = meta[name] || {};
        return { name, size: stat.size, uploadedAt: stat.mtime.getTime(), by: m.by || null, originalName: m.originalName || null, lowStatus: m.lowStatus || null };
      })
      .sort((a, b) => b.uploadedAt - a.uploadedAt);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture des photos' });
  }
});

// Uploader une ou plusieurs photos
app.post('/api/activities/:id/photos', authMiddleware, upload.array('photos', 20), async (req, res) => {
  try {
    const dir = activityPhotoDir(req.params.id);
    // Pour chaque fichier : miniature (images), chiffrement au repos, et auteur.
    for (const f of (req.files || [])) {
      if (f.mimetype.startsWith('image/') && f.size < 25 * 1024 * 1024) {
        try {
          await generateThumbnail(f.path, `${f.path}.thumb`);
          await encryptFileInPlace(`${f.path}.thumb`);
        } catch (err) { /* miniature best-effort : on garde l'image complète en secours */ }
      }
      await encryptFileInPlace(f.path);
      recordUpload(dir, f.filename, req.user.username, f.originalname);
      if (f.mimetype.startsWith('video/')) enqueueTranscode(dir, f.filename);
    }
    res.status(201).json({ success: true, uploaded: (req.files || []).map(f => f.filename) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de chiffrement du média' });
  }
});

// Télécharger / afficher / streamer un média (nom de fichier validé anti path-traversal).
// Auth par en-tête OU token média en query (pour <img>/<video>). Supporte le
// streaming par plage (Range) pour la lecture vidéo avec avance/recul.
app.get('/api/activities/:id/photos/:filename', mediaAuth, (req, res) => {
  const dir = activityPhotoDir(req.params.id);
  if (!dir) return res.status(400).json({ error: 'Identifiant invalide' });
  const filename = path.basename(req.params.filename);
  let filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Média non trouvé' });

  // Miniature légère pour la galerie.
  let thumb = false;
  if (req.query.thumb === '1') {
    if (fs.existsSync(`${filePath}.thumb`)) {
      filePath = `${filePath}.thumb`;
      thumb = true;
    } else if (isVideoName(filename)) {
      // Pas de miniature pour cette vidéo : on ne renvoie surtout pas la vidéo
      // entière à une balise <img>, le client affichera un placeholder.
      return res.status(404).json({ error: 'Miniature indisponible' });
    }
    // Image sans miniature : on sert l'image complète (repli).
  } else if (isVideoName(filename) && req.query.hd !== '1' && fs.existsSync(`${filePath}.low`)) {
    // Vidéos : on sert la version allégée par défaut (lecture fluide), HD sur demande.
    filePath = `${filePath}.low`;
  }

  const download = req.query.download === '1';
  const { encrypted, iv } = readEncInfo(filePath);

  // Fichiers en clair (ou anciens médias) : Express gère le Range tout seul.
  if (!encrypted) {
    if (download) return res.download(filePath, filename);
    if (thumb) res.type('.jpg');
    return res.sendFile(filePath);
  }

  // Fichiers chiffrés : déchiffrement à la volée, avec support du Range.
  if (!MEDIA_KEY) return res.status(500).json({ error: 'Clé de déchiffrement manquante côté serveur' });
  const stat = fs.statSync(filePath);
  const total = stat.size - ENC_PREFIX_LEN;

  res.type(thumb ? '.jpg' : path.extname(filename));
  res.setHeader('Accept-Ranges', 'bytes');
  if (download) res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  let start = 0;
  let end = total - 1;
  const rangeHeader = req.headers.range;
  if (rangeHeader && !download) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m) {
      if (m[1]) start = parseInt(m[1], 10);
      if (m[2]) end = parseInt(m[2], 10);
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`);
        return res.end();
      }
      res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    }
  }

  const length = end - start + 1;
  res.setHeader('Content-Length', length);

  // Déchiffrement CTR aligné sur les blocs : on démarre au bloc contenant `start`.
  const startBlock = Math.floor(start / 16);
  const skip = start - startBlock * 16;
  const decipher = crypto.createDecipheriv('aes-256-ctr', MEDIA_KEY, ivForBlock(iv, startBlock));
  fs.createReadStream(filePath, { start: ENC_PREFIX_LEN + startBlock * 16, end: ENC_PREFIX_LEN + end })
    .on('error', () => { if (!res.headersSent) res.status(500).end(); })
    .pipe(decipher)
    .pipe(sliceTransform(skip, length))
    .pipe(res);
});

// Supprimer une photo
app.delete('/api/activities/:id/photos/:filename', authMiddleware, (req, res) => {
  const dir = activityPhotoDir(req.params.id);
  if (!dir) return res.status(400).json({ error: 'Identifiant invalide' });
  const filename = path.basename(req.params.filename);
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Photo non trouvée' });
  try {
    fs.unlinkSync(filePath);
    if (fs.existsSync(`${filePath}.thumb`)) fs.unlinkSync(`${filePath}.thumb`);
    if (fs.existsSync(`${filePath}.low`)) fs.unlinkSync(`${filePath}.low`);
    const meta = readPhotoMeta(dir);
    if (meta[filename]) { delete meta[filename]; writePhotoMeta(dir, meta); }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de suppression' });
  }
});

// Télécharger plusieurs médias en une archive zip
app.post('/api/activities/:id/photos/zip', authMiddleware, (req, res) => {
  const dir = activityPhotoDir(req.params.id);
  if (!dir) return res.status(400).json({ error: 'Identifiant invalide' });
  const names = Array.isArray(req.body.names) ? req.body.names : [];
  if (names.length === 0) return res.status(400).json({ error: 'Aucun média sélectionné' });

  const meta = readPhotoMeta(dir);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="medias.zip"');

  const archive = archiver('zip', { zlib: { level: 0 } }); // niveau 0 : médias déjà compressés
  archive.on('error', () => { if (!res.headersSent) res.status(500).end(); });
  archive.pipe(res);

  const usedNames = new Set();
  for (const rawName of names) {
    const filename = path.basename(String(rawName));
    if (!ALLOWED_MEDIA_EXT.includes(path.extname(filename).toLowerCase())) continue;
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) continue;

    // Nom dans l'archive : nom d'origine si connu, en évitant les collisions.
    let entryName = (meta[filename] && meta[filename].originalName) || filename;
    if (usedNames.has(entryName)) {
      const ext = path.extname(entryName);
      entryName = `${entryName.slice(0, -ext.length || undefined)}-${usedNames.size}${ext}`;
    }
    usedNames.add(entryName);

    const { encrypted, iv } = readEncInfo(filePath);
    if (encrypted) {
      if (!MEDIA_KEY) continue;
      const decipher = crypto.createDecipheriv('aes-256-ctr', MEDIA_KEY, iv);
      archive.append(fs.createReadStream(filePath, { start: ENC_PREFIX_LEN }).pipe(decipher), { name: entryName });
    } else {
      archive.append(fs.createReadStream(filePath), { name: entryName });
    }
  }
  archive.finalize();
});

// ============ Upload en morceaux (gros fichiers, jusqu'à 5 Go) ============
// Contourne la limite de 100 Mo par requête (tunnel Cloudflare) en découpant
// le fichier : chaque morceau reste sous la limite, le serveur réassemble.
const UPLOADS_TMP = path.join(__dirname, 'data', 'uploads_tmp');
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024 * 1024; // 5 Go

const isSafeUploadId = (v) => /^[a-f0-9]{16,}$/.test(v);

// Nom de fichier final sûr et unique, extension déduite du nom d'origine ou du type MIME.
function finalMediaName(filename, mimetype) {
  const ext = path.extname(filename || '').toLowerCase();
  const safeExt = ALLOWED_MEDIA_EXT.includes(ext)
    ? ext
    : (String(mimetype).startsWith('video/') ? '.mp4' : '.jpg');
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
}

// Réassemble les morceaux (dans l'ordre) en un seul fichier, en flux (pas de
// chargement complet en mémoire — indispensable pour 5 Go). Chiffre à la volée
// si une clé est configurée.
function assembleChunks(sessionDir, totalChunks, finalPath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(finalPath);
    out.on('error', reject);
    out.on('finish', resolve);

    let dest = out;
    if (MEDIA_KEY) {
      const iv = crypto.randomBytes(16);
      out.write(ENC_MAGIC);
      out.write(iv);
      const cipher = crypto.createCipheriv('aes-256-ctr', MEDIA_KEY, iv);
      cipher.on('error', reject);
      cipher.pipe(out);
      dest = cipher;
    }

    let i = 0;
    const next = () => {
      if (i >= totalChunks) { dest.end(); return; }
      const rs = fs.createReadStream(path.join(sessionDir, `chunk_${i}`));
      rs.on('error', reject);
      rs.on('end', () => { i += 1; next(); });
      rs.pipe(dest, { end: false });
    };
    next();
  });
}

// Démarrer une session d'upload en morceaux
app.post('/api/activities/:id/uploads', authMiddleware, (req, res) => {
  const dir = activityPhotoDir(req.params.id);
  if (!dir) return res.status(400).json({ error: 'Identifiant invalide' });
  const { filename, size, mimetype, totalChunks } = req.body;
  if (!filename || !Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_SIZE) {
    return res.status(400).json({ error: 'Fichier invalide ou trop volumineux (max 5 Go)' });
  }
  if (!String(mimetype).startsWith('image/') && !String(mimetype).startsWith('video/')) {
    return res.status(400).json({ error: 'Seules les images et vidéos sont autorisées' });
  }
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 100000) {
    return res.status(400).json({ error: 'Découpage invalide' });
  }
  const uploadId = crypto.randomBytes(16).toString('hex');
  const sessionDir = path.join(UPLOADS_TMP, uploadId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify({
    activityId: parseInt(req.params.id, 10), filename, size, mimetype, totalChunks,
    uploadedBy: req.user.username || null,
  }));
  res.status(201).json({ uploadId, received: [] });
});

// Connaître les morceaux déjà reçus (reprise après une erreur réseau)
app.get('/api/activities/:id/uploads/:uploadId', authMiddleware, (req, res) => {
  if (!isSafeUploadId(req.params.uploadId)) return res.status(400).json({ error: 'Session invalide' });
  const sessionDir = path.join(UPLOADS_TMP, req.params.uploadId);
  if (!fs.existsSync(path.join(sessionDir, 'meta.json'))) return res.status(404).json({ error: 'Session introuvable' });
  const received = fs.readdirSync(sessionDir)
    .filter((n) => n.startsWith('chunk_'))
    .map((n) => parseInt(n.slice(6), 10));
  res.json({ received });
});

// Recevoir un morceau (corps binaire brut, streamé sur disque)
app.put('/api/activities/:id/uploads/:uploadId/chunks/:index', authMiddleware, (req, res) => {
  if (!isSafeUploadId(req.params.uploadId)) return res.status(400).json({ error: 'Session invalide' });
  const index = parseInt(req.params.index, 10);
  if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'Index invalide' });
  const sessionDir = path.join(UPLOADS_TMP, req.params.uploadId);
  if (!fs.existsSync(path.join(sessionDir, 'meta.json'))) return res.status(404).json({ error: 'Session introuvable' });
  // Écrit dans un fichier .part puis renomme : un morceau n'est "reçu" que s'il est complet.
  const tmpPath = path.join(sessionDir, `.chunk_${index}.part`);
  const finalPath = path.join(sessionDir, `chunk_${index}`);
  const ws = fs.createWriteStream(tmpPath);
  req.pipe(ws);
  ws.on('finish', () => {
    try { fs.renameSync(tmpPath, finalPath); res.json({ ok: true, index }); }
    catch (err) { res.status(500).json({ error: 'Erreur écriture morceau' }); }
  });
  ws.on('error', () => res.status(500).json({ error: 'Erreur écriture morceau' }));
  req.on('error', () => ws.destroy());
});

// Finaliser : réassembler tous les morceaux dans le fichier définitif
app.post('/api/activities/:id/uploads/:uploadId/complete', authMiddleware, async (req, res) => {
  try {
    if (!isSafeUploadId(req.params.uploadId)) return res.status(400).json({ error: 'Session invalide' });
    const dir = activityPhotoDir(req.params.id);
    if (!dir) return res.status(400).json({ error: 'Identifiant invalide' });
    const sessionDir = path.join(UPLOADS_TMP, req.params.uploadId);
    const metaPath = path.join(sessionDir, 'meta.json');
    if (!fs.existsSync(metaPath)) return res.status(404).json({ error: 'Session introuvable' });
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    for (let i = 0; i < meta.totalChunks; i += 1) {
      if (!fs.existsSync(path.join(sessionDir, `chunk_${i}`))) {
        return res.status(400).json({ error: `Morceau manquant (${i})` });
      }
    }
    fs.mkdirSync(dir, { recursive: true });
    const finalName = finalMediaName(meta.filename, meta.mimetype);
    const finalPath = path.join(dir, finalName);
    await assembleChunks(sessionDir, meta.totalChunks, finalPath);
    fs.rmSync(sessionDir, { recursive: true, force: true });
    recordUpload(dir, finalName, meta.uploadedBy || req.user.username, meta.filename);
    if (String(meta.mimetype).startsWith('video/') || isVideoName(finalName)) enqueueTranscode(dir, finalName);
    const stat = fs.statSync(finalPath);
    res.status(201).json({ name: finalName, size: stat.size });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de finalisation' });
  }
});

// Abandonner une session d'upload (nettoyage)
app.delete('/api/activities/:id/uploads/:uploadId', authMiddleware, (req, res) => {
  if (!isSafeUploadId(req.params.uploadId)) return res.status(400).json({ error: 'Session invalide' });
  fs.rmSync(path.join(UPLOADS_TMP, req.params.uploadId), { recursive: true, force: true });
  res.json({ success: true });
});

// Gestion des erreurs multer (taille dépassée, type refusé, etc.)
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Erreur lors de l\'upload' });
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server is running on http://0.0.0.0:${PORT}`);
});
