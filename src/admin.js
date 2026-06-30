'use strict';

const crypto = require('crypto');
const express = require('express');
const { selectRange, selectRecent, countRange } = require('./db');

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

const PREVIEW_LIMIT = 100; // ile najnowszych rekordów pokazujemy w tabeli podglądu

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
    :root { color-scheme: light; }
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 32px auto; padding: 0 16px; color: #1f2937; }
    h1 { font-size: 1.4rem; margin-bottom: 4px; }
    p.hint { color: #6b7280; font-size: .85rem; margin-top: 0; }
    form { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin: 20px 0; }
    label { display: grid; gap: 4px; font-size: .85rem; }
    input { padding: 8px; font-size: .95rem; border: 1px solid #d1d5db; border-radius: 6px; }
    button { padding: 9px 16px; font-size: .95rem; border: 0; border-radius: 6px; cursor: pointer; }
    button.primary { background: #2563eb; color: #fff; }
    button.primary:hover { background: #1d4ed8; }
    button.secondary { background: #e5e7eb; color: #111827; }
    button.secondary:hover { background: #d1d5db; }
    #status { font-size: .85rem; color: #6b7280; margin: 8px 0; }
    .table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
    table { border-collapse: collapse; width: 100%; font-size: .82rem; }
    th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #f0f0f0; white-space: nowrap; }
    th { background: #f9fafb; position: sticky; top: 0; font-weight: 600; }
    td.wrap { white-space: normal; max-width: 320px; word-break: break-word; }
    tr:hover td { background: #f9fafb; }
    .empty { padding: 24px; text-align: center; color: #9ca3af; }
  </style>
</head>
<body>
  <h1>Traffic Analyzer — podgląd ruchu</h1>
  <p class="hint">Domyślnie ostatnia 1 godzina. Tabela pokazuje najnowsze ${PREVIEW_LIMIT} rekordów z zakresu; pełny raport pobierzesz przyciskiem.</p>

  <form id="filters">
    <label>Od
      <input type="datetime-local" id="from" name="from">
    </label>
    <label>Do
      <input type="datetime-local" id="to" name="to">
    </label>
    <button type="submit" class="primary">Pokaż</button>
    <button type="button" id="download" class="secondary">Pobierz pełny raport (JSON)</button>
  </form>

  <div id="status">Ładowanie…</div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Czas</th><th>Metoda</th><th>Ścieżka</th><th>IP</th><th>Kraj</th>
          <th>Przeglądarka</th><th>OS</th><th>Urządzenie</th><th>Referer</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
    <div class="empty" id="empty" hidden>Brak rekordów w wybranym zakresie.</div>
  </div>

  <script>
    const API_BASE = '%BASE%'; // ścieżka montowania routera (np. /admin) — wstrzykiwana przez serwer
    const $ = (id) => document.getElementById(id);
    const pad = (n) => String(n).padStart(2, '0');

    // Date -> wartość dla <input type="datetime-local"> w czasie lokalnym.
    function toLocalInput(d) {
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
        + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    // Domyślny zakres: ostatnia 1 godzina.
    const now = new Date();
    $('to').value = toLocalInput(now);
    $('from').value = toLocalInput(new Date(now.getTime() - 60 * 60 * 1000));

    // <input datetime-local> daje czas lokalny bez strefy. Konwertujemy go na jednoznaczny
    // UTC ISO (new Date interpretuje wartość w strefie przeglądarki), żeby serwer — który może
    // działać w innej strefie (np. UTC na sandboxie) — filtrował dokładnie ten sam moment.
    function toInstant(localValue) {
      const t = new Date(localValue);
      return Number.isNaN(t.getTime()) ? '' : t.toISOString();
    }

    function queryString() {
      const p = new URLSearchParams();
      const from = toInstant($('from').value);
      const to = toInstant($('to').value);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      return p.toString();
    }

    function cell(text, wrap) {
      const td = document.createElement('td');
      if (wrap) td.className = 'wrap';
      td.textContent = text == null || text === '' ? '—' : String(text);
      return td;
    }

    async function load() {
      $('status').textContent = 'Ładowanie…';
      try {
        // URL bez danych logowania (fetch nie akceptuje userinfo w URL, gdyby ktoś otworzył panel z user:pass@host).
        const url = new URL(API_BASE + '/data?' + queryString(), location.href);
        url.username = '';
        url.password = '';
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const tbody = $('rows');
        tbody.replaceChildren();
        for (const r of data.requests) {
          const tr = document.createElement('tr');
          const path = r.path + (r.query ? '?' + r.query : '');
          tr.append(
            cell(new Date(r.ts).toLocaleString()),
            cell(r.method),
            cell(path, true),
            cell(r.client_ip),
            cell(r.country),
            cell(r.browser),
            cell(r.os),
            cell(r.device),
            cell(r.referer, true),
          );
          tbody.append(tr);
        }
        $('empty').hidden = data.requests.length > 0;
        $('status').textContent = 'Pokazano ' + data.requests.length
          + (data.total > data.requests.length ? ' z ' + data.total + ' w zakresie (limit podglądu ' + data.limit + ')' : ' rekordów');
      } catch (err) {
        $('status').textContent = 'Błąd ładowania: ' + err.message;
      }
    }

    $('filters').addEventListener('submit', (e) => { e.preventDefault(); load(); });
    $('download').addEventListener('click', () => { window.location.href = API_BASE + '/export?' + queryString(); });

    load();
  </script>
</body>
</html>`;

const router = express.Router();
router.use(basicAuth);

router.get('/', (req, res) => {
  // req.baseUrl to ścieżka montowania (np. /admin) — panel używa jej do budowy adresów API.
  res.type('html').send(PANEL_HTML.replace('%BASE%', req.baseUrl));
});

// Podgląd dla tabeli — JSON inline (bez wymuszania pobrania), ograniczony limitem.
router.get('/data', (req, res) => {
  const fromEpoch = parseEpoch(req.query.from);
  const toEpoch = parseEpoch(req.query.to);
  const total = countRange(fromEpoch, toEpoch);
  const rows = selectRecent(fromEpoch, toEpoch, PREVIEW_LIMIT).map((row) => ({
    ...row,
    headers: safeParseJson(row.headers),
  }));

  res.json({
    from: epochToIso(fromEpoch),
    to: epochToIso(toEpoch),
    limit: PREVIEW_LIMIT,
    count: rows.length,
    total,
    requests: rows,
  });
});

// Pełny raport — wszystkie rekordy z zakresu, pobierane jako plik.
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
