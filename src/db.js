'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'traffic.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT    NOT NULL,
    ts_epoch   INTEGER NOT NULL,
    method     TEXT,
    path       TEXT,
    query      TEXT,
    host       TEXT,
    client_ip  TEXT,
    country    TEXT,
    user_agent TEXT,
    browser    TEXT,
    os         TEXT,
    device     TEXT,
    referer    TEXT,
    headers    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_requests_ts_epoch ON requests (ts_epoch);
`);

const insertStmt = db.prepare(`
  INSERT INTO requests
    (ts, ts_epoch, method, path, query, host, client_ip, country,
     user_agent, browser, os, device, referer, headers)
  VALUES
    (@ts, @ts_epoch, @method, @path, @query, @host, @client_ip, @country,
     @user_agent, @browser, @os, @device, @referer, @headers)
`);

// Zakres czasu jest opcjonalny — gdy from/to są null, warunki BETWEEN przepuszczają wszystko.
const selectRangeStmt = db.prepare(`
  SELECT id, ts, ts_epoch, method, path, query, host, client_ip, country,
         user_agent, browser, os, device, referer, headers
  FROM requests
  WHERE ts_epoch >= COALESCE(@from, ts_epoch)
    AND ts_epoch <= COALESCE(@to, ts_epoch)
  ORDER BY ts_epoch ASC
`);

function insertRequest(record) {
  insertStmt.run(record);
}

function selectRange(fromEpoch, toEpoch) {
  return selectRangeStmt.all({ from: fromEpoch, to: toEpoch });
}

module.exports = { db, insertRequest, selectRange, DB_PATH };
