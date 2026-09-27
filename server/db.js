const fs = require('fs');
const Database = require('better-sqlite3');
const { DATA_DIR, UPLOAD_DIR, DB_FILE } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'police',
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  hours TEXT,
  open_time TEXT NOT NULL DEFAULT '09:00',
  close_time TEXT NOT NULL DEFAULT '18:00',
  lat REAL,
  lng REAL
);

CREATE TABLE IF NOT EXISTS officers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  badge TEXT NOT NULL,
  rank TEXT NOT NULL DEFAULT 'Officer',
  station_id INTEGER NOT NULL REFERENCES stations(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  officer_id INTEGER REFERENCES officers(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  found_location TEXT,
  found_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  ai_caption TEXT,
  ai_tags TEXT,
  text_embedding BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  embedding BLOB
);

CREATE TABLE IF NOT EXISTS lost_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL,
  description TEXT,
  category TEXT,
  ai_caption TEXT,
  text_embedding BLOB,
  status TEXT NOT NULL DEFAULT 'searching',
  matched_item_id INTEGER REFERENCES items(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lost_report_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES lost_reports(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  embedding BLOB
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  station_id INTEGER NOT NULL REFERENCES stations(id),
  scheduled_at TEXT NOT NULL,
  ownership_proof TEXT,
  contact_phone TEXT,
  match_score REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  police_note TEXT,
  decided_by INTEGER REFERENCES officers(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  item_id INTEGER REFERENCES items(id),
  report_id INTEGER REFERENCES lost_reports(id),
  score REAL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
`);

function toBlob(vec) {
  if (!vec) return null;
  const f = Float32Array.from(vec);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

function fromBlob(buf) {
  if (!buf) return null;
  const copy = Buffer.from(buf);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

module.exports = { db, toBlob, fromBlob };
