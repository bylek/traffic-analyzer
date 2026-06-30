# Traffic Analyzer

Prosta aplikacja Node.js, która działa **za reverse proxy** i loguje cały ruch
przychodzący na dowolną ścieżkę. Każde żądanie dostaje pustą odpowiedź `200`, a dane
trafiają do SQLite. Panel admina (Basic Auth) pozwala wyeksportować ruch do JSON
z wybranego zakresu czasu — gotowe np. do podania agentowi AI.

## Co jest zapisywane

Dla każdego żądania: czas (UTC), metoda, ścieżka, query string, host, realne IP klienta,
kraj (offline GeoIP), surowy User-Agent, rozpoznana przeglądarka, system, typ urządzenia,
Referer oraz **wszystkie nagłówki** (jako JSON).

## Stack

- Express
- better-sqlite3
- geoip-lite (offline baza krajów MaxMind)
- ua-parser-js

## Instalacja

```bash
npm install
cp .env.example .env   # i ustaw ADMIN_USER / ADMIN_PASS
```

> `geoip-lite` pobiera bazę GeoIP podczas instalacji (krok postinstall). Po instalacji
> działa offline.

## Konfiguracja (.env)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `ADMIN_USER` | — | Login do panelu (**wymagany**) |
| `ADMIN_PASS` | — | Hasło do panelu (**wymagane**) |
| `DB_PATH` | `./traffic.db` | Plik bazy SQLite |
| `IP_HEADER` | `x-forwarded-for` | Nagłówek z realnym IP klienta |

Bez `ADMIN_USER` / `ADMIN_PASS` aplikacja się nie uruchomi.

## Uruchomienie

```bash
npm start
```

- Panel admina: `http://localhost:3000/admin` (Basic Auth)
- Eksport bezpośrednio: `GET /admin/export?from=<ISO>&to=<ISO>` (puste = cały zakres)

## Reverse proxy (nginx)

Aby realne IP klienta trafiało do aplikacji:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Bierzemy **pierwszy** adres z `X-Forwarded-For`. Jeśli używasz Cloudflare, ustaw
`IP_HEADER=cf-connecting-ip`.

## Uwagi

- Żądania do `/admin*` nie są logowane jako ruch.
- Eksport ładuje wybrany zakres do pamięci — dla bardzo dużych zakresów zawężaj
  `from`/`to`.
- Baza jest w trybie WAL; pliki `*.db-wal` / `*.db-shm` są normalne.
