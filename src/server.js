'use strict';

// Wczytaj .env, jeśli istnieje (bez dodatkowej zależności).
require('./load-env');

const express = require('express');
const adminRouter = require('./admin');
const { logRequest } = require('./logger');
const { DB_PATH } = require('./db');

const PORT = parseInt(process.env.PORT || '3000', 10);

if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
  console.error('Błąd: ustaw ADMIN_USER i ADMIN_PASS (panel admina jest zabezpieczony Basic Auth).');
  process.exit(1);
}

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

// Panel admina — montowany przed catch-all, NIE jest logowany jako ruch.
app.use('/admin', adminRouter);

// Catch-all: loguje każde żądanie (dowolna metoda, dowolna ścieżka) i zwraca puste 200.
app.use((req, res) => {
  res.on('finish', () => logRequest(req));
  res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Traffic Analyzer nasłuchuje na :${PORT}`);
  console.log(`Baza SQLite: ${DB_PATH}`);
  console.log(`Panel admina: http://localhost:${PORT}/admin`);
});
