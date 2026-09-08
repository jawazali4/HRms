/**
 * Express application. Mounted in two places:
 *   1. locally  → node backend/server.js
 *   2. Netlify  → netlify/functions/api.js (same app, one function)
 */
'use strict';

const express = require('express');
const cors = require('cors');
const config = require('./config');

const app = express();

app.disable('x-powered-by');

app.use(cors({ origin: config.corsOrigins.length === 1 && config.corsOrigins[0] === '*' ? true : config.corsOrigins, credentials: false }));
app.use(express.json({ limit: '2mb' }));

// Tiny request log (visible in the Netlify function logs)
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  }
  next();
});

// health check (used by Netlify & monitoring)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'HRMS API', time: new Date().toISOString() });
});

// modules
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/employees', require('./src/routes/employees'));
app.use('/api/attendance', require('./src/routes/attendance'));
app.use('/api/leave', require('./src/routes/leave'));
app.use('/api/loans', require('./src/routes/loans'));
app.use('/api/payroll', require('./src/routes/payroll'));
app.use('/api/assets', require('./src/routes/assets'));
app.use('/api/reports', require('./src/routes/reports'));
app.use('/api/dashboard', require('./src/routes/dashboard'));

// 404 for unknown API routes (frontend handles the rest)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.', code: 'NOT_FOUND' });
});

// Central error handler — every route error lands here
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('Server error:', err);
  res.status(status).json({
    error: status >= 500 ? 'An unexpected error occurred on the server. Please try again.' : err.message,
    code: err.code || 'ERROR',
  });
});

module.exports = app;
