'use strict';

// Wczytuje plik .env z katalogu roboczego, jeśli istnieje.
// Korzysta z wbudowanego process.loadEnvFile (Node 20.12+/22+); brak pliku jest ignorowany.
const path = require('path');

try {
  const envPath = path.join(process.cwd(), '.env');
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
} catch {
  // Brak .env — używamy zmiennych środowiskowych z otoczenia.
}
