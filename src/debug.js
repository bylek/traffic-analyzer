'use strict';

// Logi per-żądanie są gadatliwe, więc włącza je dopiero DEBUG=1 (np. na sandboxie do debugowania).
const ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.DEBUG).toLowerCase());

function debug(...args) {
  if (ENABLED) console.log('[debug]', ...args);
}

module.exports = { debug, DEBUG_ENABLED: ENABLED };
