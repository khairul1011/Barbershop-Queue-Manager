const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);

// Menggunakan mode WAL untuk performa dan konkurensi yang lebih baik (opsional tapi disarankan)
db.pragma('journal_mode = WAL');

const createTableStmt = `
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    senderName TEXT,
    senderPhone TEXT NOT NULL,
    receivedTime TEXT NOT NULL,
    message TEXT NOT NULL,
    extractedDay TEXT,
    extractedTime TEXT,
    extractedService TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
  )
`;

db.exec(createTableStmt);

module.exports = db;
