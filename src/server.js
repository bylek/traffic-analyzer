'use strict';

// Wczytaj .env, jeśli istnieje (bez dodatkowej zależności).
require('./load-env');

const path = require('path');
const fs = require('fs');
const express = require('express');
const adminRouter = require('./admin');
const { logRequest } = require('./logger');
const { DB_PATH, countAll } = require('./db');
const { debug, DEBUG_ENABLED } = require('./debug');

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
  debug(`→ ${req.method} ${req.originalUrl} | ${process.env.IP_HEADER || 'x-forwarded-for'}=${req.headers[(process.env.IP_HEADER || 'x-forwarded-for').toLowerCase()] || '(brak)'}`);
  // Zapis dopiero po wysłaniu odpowiedzi; jeśli klient zerwie połączenie wcześniej, wpis NIE powstanie.
  res.on('finish', () => logRequest(req));
  res.on('close', () => {
    if (!res.writableFinished) {
      debug(`✗ połączenie zamknięte przed finish — wpis NIE zapisany: ${req.method} ${req.originalUrl}`);
    }
  });
  res.status(200).end();
});

// Diagnostyka startowa bazy — pomaga ustalić, czemu wpisy się nie tworzą (np. zła ścieżka / brak praw zapisu na sandboxie).
function reportDbHealth() {
  const abs = path.resolve(DB_PATH);
  console.log(`Baza SQLite: ${DB_PATH}  (absolutnie: ${abs})`);
  try {
    fs.accessSync(path.dirname(abs), fs.constants.W_OK);
    console.log(`Katalog bazy zapisywalny: TAK`);
  } catch {
    console.error(`Katalog bazy zapisywalny: NIE — brak praw zapisu w ${path.dirname(abs)} (wpisy się nie zapiszą!)`);
  }
  try {
    console.log(`Rekordów w bazie na starcie: ${countAll()}`);
  } catch (err) {
    console.error(`Nie udało się odczytać liczby rekordów:`, err.message);
  }
}

app.listen(PORT, () => {
  console.log(`Traffic Analyzer nasłuchuje na :${PORT}`);
  reportDbHealth();
  console.log(`Panel admina: http://localhost:${PORT}/admin`);
  console.log(`Logi per-żądanie (DEBUG): ${DEBUG_ENABLED ? 'WŁĄCZONE' : 'wyłączone (ustaw DEBUG=1, aby włączyć)'}`);
});
