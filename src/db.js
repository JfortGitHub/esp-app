'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'esp.db');

// Гарантируем, что папка существует
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ═══════════════════════════════════════════════════════════
// СХЕМА БД
// ═══════════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    login       TEXT PRIMARY KEY,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('admin','engineer','user')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS norms (
    id                   TEXT PRIMARY KEY,
    operation_code       TEXT NOT NULL,
    operation_name       TEXT NOT NULL,
    section              TEXT NOT NULL,
    equipment_category   TEXT NOT NULL,
    equipment_type       TEXT,
    equipment_unit       TEXT,
    tm                   TEXT,
    norm_value           REAL NOT NULL,
    unit                 TEXT DEFAULT 'чел-час',
    team_size            INTEGER DEFAULT 2,
    qualification        TEXT,
    complexity           INTEGER DEFAULT 3,
    source_type          TEXT DEFAULT 'federal',
    source_code          TEXT,
    source_title         TEXT,
    confidence_level     REAL DEFAULT 0.7,
    repair_type          TEXT DEFAULT 'ТР',
    tools_required       TEXT,
    safety_requirements  TEXT,
    description          TEXT,
    is_custom            INTEGER DEFAULT 0,
    author               TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_norms_code ON norms(operation_code);
  CREATE INDEX IF NOT EXISTS idx_norms_section ON norms(section);

  CREATE TABLE IF NOT EXISTS equipment (
    id            TEXT PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,
    section       TEXT NOT NULL,
    category      TEXT NOT NULL,
    type          TEXT NOT NULL,
    unit          TEXT NOT NULL,
    tm            TEXT,
    manufacturer  TEXT,
    inv_number    TEXT,
    year          TEXT,
    specs         TEXT,
    notes         TEXT,
    author        TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cards (
    id             TEXT PRIMARY KEY,
    card_number    TEXT NOT NULL,
    equipment_name TEXT NOT NULL,
    tm             TEXT,
    repair_type    TEXT DEFAULT 'СР',
    operations     TEXT NOT NULL,
    total_hours    REAL NOT NULL,
    calendar_days  INTEGER NOT NULL,
    status         TEXT DEFAULT 'draft',
    author         TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workflow_states (
    norm_id     TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'draft',
    updated_at  TEXT,
    updated_by  TEXT
  );

  CREATE TABLE IF NOT EXISTS workflow_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    norm_id    TEXT NOT NULL,
    from_state TEXT NOT NULL,
    to_state   TEXT NOT NULL,
    by_user    TEXT,
    role       TEXT,
    comment    TEXT,
    at         TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_wf_history_norm ON workflow_history(norm_id);

  CREATE TABLE IF NOT EXISTS versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    norm_id         TEXT NOT NULL,
    version_number  INTEGER NOT NULL,
    data            TEXT NOT NULL,
    status_snapshot TEXT,
    comment         TEXT,
    by_user         TEXT,
    at              TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_versions_norm ON versions(norm_id);

  CREATE TABLE IF NOT EXISTS import_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT,
    filename   TEXT,
    added      INTEGER DEFAULT 0,
    updated    INTEGER DEFAULT 0,
    skipped    INTEGER DEFAULT 0,
    blocked    INTEGER DEFAULT 0,
    by_user    TEXT,
    at         TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ═══════════════════════════════════════════════════════════
// СИДИРОВАНИЕ (первый запуск)
// ═══════════════════════════════════════════════════════════
const bcrypt = require('bcryptjs');

function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const insert = db.prepare('INSERT INTO users (login, password, name, role) VALUES (?, ?, ?, ?)');
  const defaults = [
    ['admin', 'admin123', 'Администратор', 'admin'],
    ['engineer', 'eng123', 'Инженер-нормировщик', 'engineer'],
    ['user', 'user123', 'Пользователь', 'user']
  ];
  const tx = db.transaction(() => {
    for (const [login, pwd, name, role] of defaults) {
      insert.run(login, bcrypt.hashSync(pwd, 10), name, role);
    }
  });
  tx();
  console.log('[db] Созданы пользователи по умолчанию: admin/admin123, engineer/eng123, user/user123');
}

seedUsers();

module.exports = db;
