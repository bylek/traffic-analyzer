'use strict';

const geoip = require('geoip-lite');
const { UAParser } = require('ua-parser-js');
const { insertRequest } = require('./db');
const { clientIp } = require('./ip');
const { debug } = require('./debug');

// Jeden parser reużywany dla wszystkich żądań (ścieżka gorąca — bez alokacji per request).
const uaParser = new UAParser();

// Składa rekord z żądania i zapisuje go do bazy.
// Wywoływane po wysłaniu odpowiedzi (res 'finish'), więc nie blokuje klienta.
function logRequest(req) {
  try {
    const now = new Date();
    const ip = clientIp(req);
    const geo = ip ? geoip.lookup(ip) : null;

    const ua = req.headers['user-agent'] || '';
    const parsed = uaParser.setUA(ua).getResult();

    const url = new URL(req.originalUrl || req.url, 'http://placeholder');

    const info = insertRequest({
      ts: now.toISOString(),
      ts_epoch: now.getTime(),
      method: req.method,
      path: url.pathname,
      query: url.search ? url.search.slice(1) : '',
      host: req.headers['host'] || null,
      client_ip: ip,
      country: geo ? geo.country : null,
      user_agent: ua || null,
      browser: [parsed.browser.name, parsed.browser.version].filter(Boolean).join(' ') || null,
      os: [parsed.os.name, parsed.os.version].filter(Boolean).join(' ') || null,
      device: parsed.device.type || 'desktop',
      referer: req.headers['referer'] || req.headers['referrer'] || null,
      headers: JSON.stringify(req.headers),
    });

    debug(`zapisano #${info.lastInsertRowid}: ${req.method} ${url.pathname} ip=${ip} kraj=${geo ? geo.country : '-'}`);
  } catch (err) {
    // Logowanie ruchu nie może wywrócić aplikacji. Błąd zapisu pokazujemy zawsze (nie tylko w DEBUG).
    console.error('[logger] BŁĄD zapisu żądania:', err && err.stack ? err.stack : err);
  }
}

module.exports = { logRequest };
