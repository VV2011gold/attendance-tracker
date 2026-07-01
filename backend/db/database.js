/**
 * database.js
 * Initialises and exports a singleton DatabaseSync instance using Node.js's
 * built-in `node:sqlite` module (available from Node 22.5+, stable in Node 26).
 * No native addon compilation is required.
 *
 * The schema is applied automatically on first run via idempotent
 * CREATE TABLE IF NOT EXISTS statements.
 */

const path = require('path');
const fs   = require('fs');
// node:sqlite is built in — no npm install needed
const { DatabaseSync } = require('node:sqlite');

// Resolve the database file path.
// Render free tier: use /opt/render/project/src/data (writable, inside project).
// Local dev: falls back to project root.
const dbPath = path.resolve(
  process.env.DATABASE_PATH ||
  path.join(__dirname, '../../data/attendance.db')
);
const schemaPath = path.join(__dirname, 'schema.sql');

// Create the directory for the DB file if it doesn't already exist
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Open (or create) the SQLite database
const db = new DatabaseSync(dbPath);

// Performance pragmas
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Apply schema (idempotent — all statements use CREATE ... IF NOT EXISTS)
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

console.log(`[DB] Connected to SQLite at ${dbPath}`);

module.exports = db;
