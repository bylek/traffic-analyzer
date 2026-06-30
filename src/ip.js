'use strict';

const IP_HEADER = (process.env.IP_HEADER || 'x-forwarded-for').toLowerCase();

// Normalizuje IPv4-mapped IPv6 (::ffff:1.2.3.4) do czystego IPv4.
function normalize(ip) {
  if (!ip) return ip;
  ip = ip.trim();
  const m = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  return m ? m[1] : ip;
}

// Realne IP klienta. Apka stoi za reverse proxy, więc bierzemy pierwszy adres
// z nagłówka (domyślnie X-Forwarded-For); fallback do adresu połączenia TCP.
function clientIp(req) {
  const header = req.headers[IP_HEADER];
  if (header) {
    const value = Array.isArray(header) ? header[0] : header;
    const first = value.split(',')[0];
    if (first && first.trim()) return normalize(first);
  }
  return normalize(req.socket && req.socket.remoteAddress) || null;
}

module.exports = { clientIp, normalize };
