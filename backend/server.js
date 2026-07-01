/**
 * server.js
 * Express application entry point.
 * Mounts all routes, starts the HTTP server, and initialises the cron scheduler.
 */

require('dotenv').config({ path: __dirname + '/.env' });

const express  = require('express');
const cors     = require('cors');
const path     = require('path');

// ── Route imports ────────────────────────────────────────────────────────────
const employeeRoutes   = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');

// ── Scheduler (initialised after the server starts) ──────────────────────────
const { initScheduler } = require('./scheduler/slackReminder');

// ── App setup ────────────────────────────────────────────────────────────────
const app  = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// HOST is intentionally not pinned — cloud platforms (Code Engine, Railway, etc.)
// route traffic internally and require the app to listen on all interfaces.
// For local dev this still works: traffic only reaches port 3000 from localhost.

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' })); // Restrict in production via CORS_ORIGIN env var
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve the frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/employees',  employeeRoutes);
app.use('/api/attendance', attendanceRoutes);

// ── Health check endpoint ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── SPA fallback: serve index.html for any non-API GET ─────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
  // Initialise the cron job (non-blocking; errors are logged, not thrown)
  initScheduler();
});

module.exports = app; // exported for testing
