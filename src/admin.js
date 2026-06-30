'use strict';

const crypto = require('crypto');
const express = require('express');
const { selectRange } = require('./db');

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

// Porównanie odporne na timing attack.
function safeEqual(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function basicAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    if (safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASS)) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Traffic Analyzer Admin", charset="UTF-8"');
  return res.status(401).send('Authentication required');
}

// Parsuje datetime-local / ISO do epoch ms. Zwraca null gdy brak/niepoprawne.
function parseEpoch(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// Epoch ms → ISO 8601 (null pozostaje null).
function epochToIso(epoch) {
  return epoch == null ? null : new Date(epoch).toISOString();
}

const PANEL_HTML = `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Traffic Analyzer — panel</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #222; }
    h1 { font-size: 1.4rem; }
    form { display: grid; gap: 14px; margin-top: 24px; }
    label { display: grid; gap: 4px; font-size: .9rem; }
    input { padding: 8px; font-size: 1rem; border: 1px solid #ccc; border-radius: 6px; }
    button { padding: 10px 16px; font-size: 1rem; border: 0; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    p.hint { color: #666; font-size: .85rem; }
  </style>
</head>
<body>
  <h1>Traffic Analyzer — eksport ruchu</h1>
  <p class="hint">Wybierz zakres czasu i pobierz raport JSON. Puste pola = cały zakres.</p>
  <form action="export" method="get">
    <label>Od
      <input type="datetime-local" name="from">
    </label>
    <label>Do
      <input type="datetime-local" name="to">
    </label>
    <button type="submit">Pobierz JSON</button>
  </form>
</body>
</html>`;

const router = express.Router();
router.use(basicAuth);

router.get('/', (req, res) => {
  res.type('html').send(PANEL_HTML);
});

router.get('/export', (req, res) => {
  const fromEpoch = parseEpoch(req.query.from);
  const toEpoch = parseEpoch(req.query.to);

  const rows = selectRange(fromEpoch, toEpoch).map((row) => ({
    ...row,
    headers: safeParseJson(row.headers),
  }));

  const fromIso = epochToIso(fromEpoch);
  const toIso = epochToIso(toEpoch);
  const fromTag = fromIso ? fromIso.slice(0, 10) : 'all';
  const toTag = toIso ? toIso.slice(0, 10) : 'all';

  res.set('Content-Disposition', `attachment; filename="traffic-${fromTag}-${toTag}.json"`);
  res.type('application/json').send(JSON.stringify({
    generated_at: new Date().toISOString(),
    from: fromIso,
    to: toIso,
    count: rows.length,
    requests: rows,
  }, null, 2));
});

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

module.exports = router;
