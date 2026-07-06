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

// Mot de passe hashé (Weko@Guy973)
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('Weko@Guy973', 10);

// Chemin vers le fichier de données
const DATA_FILE = path.join(__dirname, 'data', 'itinerary.json');

// Fonctions utilitaires pour lire/écrire le fichier JSON
function readItinerary() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeItinerary(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
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
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Mot de passe requis' });
  }
  if (!bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
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
