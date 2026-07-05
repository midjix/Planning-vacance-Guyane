const express = require('express');
const cors = require('cors');
const itinerary = require('./data/itinerary.json');

const app = express();
const PORT = process.env.PORT || 8081;

app.use(cors());
app.use(express.json());

// Endpoint to get the itinerary data
app.get('/api/itinerary', (req, res) => {
  res.json(itinerary);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server is running on http://0.0.0.0:${PORT}`);
});
