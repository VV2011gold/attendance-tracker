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

// Safe writable fallback — always inside the project directory.
// On Render free tier /opt/render/project/src is writable; /var/data is not.
const PROJECT_ROOT = path.join(__dirname, '../..');
const DEFAULT_DB   = path.join(PROJECT_ROOT, 'data', 'attendance.db');

// If DATABASE_PATH is set but points to a non-writable root path, ignore it
// and fall back to the safe default.
function resolveDbPath() {
  const envPath = process.env.DATABASE_PATH;
  if (!envPath) return DEFAULT_DB;
  // Reject paths that start with /var or other system roots not owned by app
  if (/^\/(var|etc|usr|sys|proc)/.test(envPath)) {
    console.warn(`[DB] DATABASE_PATH "${envPath}" is a restricted path — using default: ${DEFAULT_DB}`);
    return DEFAULT_DB;
  }
  return path.resolve(envPath);
}

const dbPath     = resolveDbPath();
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
