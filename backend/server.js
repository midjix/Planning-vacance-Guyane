const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');

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
  
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: user.username, role: user.role });
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

// Extensions d'images autorisées
const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'];

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
    const safeExt = ALLOWED_IMAGE_EXT.includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 Mo par fichier
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Seules les images sont autorisées'));
  },
});

// Lister les photos d'une activité
app.get('/api/activities/:id/photos', authMiddleware, (req, res) => {
  try {
    const dir = activityPhotoDir(req.params.id);
    if (!dir) return res.status(400).json({ error: 'Identifiant invalide' });
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir)
      .filter(name => ALLOWED_IMAGE_EXT.includes(path.extname(name).toLowerCase()))
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

// Gestion des erreurs multer (taille dépassée, type refusé, etc.)
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Erreur lors de l\'upload' });
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server is running on http://0.0.0.0:${PORT}`);
});
