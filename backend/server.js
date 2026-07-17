const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8081;

// Clé secrète pour JWT — doit être fournie via la variable d'environnement JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('Erreur: la variable d\'environnement JWT_SECRET est manquante. Définis-la avant de démarrer le serveur.');
  process.exit(1);
}

// Chemin vers les fichiers de données
const ITINERARY_FILE = path.join(__dirname, 'data', 'itinerary.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const ANALYTICS_FILE = path.join(__dirname, 'data', 'analytics.json');
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

app.use(cors());
app.use(express.json());

// Middleware d'authentification JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
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

// Extensions média autorisées (images + vidéos)
const ALLOWED_MEDIA_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic',
  '.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv',
];

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
    const files = fs.readdirSync(dir)
      .filter(name => ALLOWED_MEDIA_EXT.includes(path.extname(name).toLowerCase()))
      .map(name => {
        const stat = fs.statSync(path.join(dir, name));
        return { name, size: stat.size, uploadedAt: stat.mtime.getTime() };
      })
      .sort((a, b) => b.uploadedAt - a.uploadedAt);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lecture des photos' });
  }
});

// Uploader une ou plusieurs photos
app.post('/api/activities/:id/photos', authMiddleware, upload.array('photos', 20), (req, res) => {
  const uploaded = (req.files || []).map(f => f.filename);
  res.status(201).json({ success: true, uploaded });
});

// Télécharger / afficher une photo (nom de fichier validé pour éviter le path traversal)
app.get('/api/activities/:id/photos/:filename', authMiddleware, (req, res) => {
  const dir = activityPhotoDir(req.params.id);
  if (!dir) return res.status(400).json({ error: 'Identifiant invalide' });
  const filename = path.basename(req.params.filename);
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Photo non trouvée' });
  if (req.query.download === '1') {
    return res.download(filePath, filename);
  }
  res.sendFile(filePath);
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur de suppression' });
  }
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
// chargement complet en mémoire — indispensable pour 5 Go).
function assembleChunks(sessionDir, totalChunks, finalPath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(finalPath);
    out.on('error', reject);
    let i = 0;
    const next = () => {
      if (i >= totalChunks) { out.end(resolve); return; }
      const rs = fs.createReadStream(path.join(sessionDir, `chunk_${i}`));
      rs.on('error', reject);
      rs.on('end', () => { i += 1; next(); });
      rs.pipe(out, { end: false });
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
