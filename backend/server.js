const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 8081;

// Clé secrète pour JWT (en production, utiliser une variable d'environnement)
const JWT_SECRET = process.env.JWT_SECRET || 'guyane2026-secret-key-voyage';

// Chemin vers les fichiers de données
const ITINERARY_FILE = path.join(__dirname, 'data', 'itinerary.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

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
    const defaultUsers = [{
      id: 1,
      username: 'admin',
      passwordHash: bcrypt.hashSync('Weko@Guy973', 10),
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

// ==================== ROUTES UTILISATEURS ====================

// Lister les utilisateurs
app.get('/api/admin/users', authMiddleware, (req, res) => {
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
app.post('/api/admin/users', authMiddleware, (req, res) => {
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
app.delete('/api/admin/users/:id', authMiddleware, (req, res) => {
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

// Mettre à jour une activité
app.put('/api/admin/itinerary/:id', authMiddleware, (req, res) => {
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

// Ajouter une nouvelle activité
app.post('/api/admin/itinerary', authMiddleware, (req, res) => {
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

// Supprimer une activité
app.delete('/api/admin/itinerary/:id', authMiddleware, (req, res) => {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server is running on http://0.0.0.0:${PORT}`);
});
