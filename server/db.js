const Database = require('better-sqlite3');
const path = require('path');

// Open or create the SQLite database
const db = new Database(path.join(__dirname, '..', 'promptly.db'));

// Initialize database schema
// Tables: authorized_users, sessions, commands, sections
// authorized_users: username TEXT PRIMARY KEY, role TEXT
// sessions: id INTEGER PK, token TEXT UNIQUE, active INTEGER, created_at
// commands: id INTEGER PK, session_id INTEGER, username TEXT, command TEXT, output TEXT, explanation TEXT, created_at
// sections: id INTEGER PK, session_id INTEGER, title TEXT, created_at

const init = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS authorized_users (
      username TEXT PRIMARY KEY,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      username TEXT,
      command TEXT NOT NULL,
      output TEXT,
      explanation TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );
  `);
};

init();

module.exports = db;
