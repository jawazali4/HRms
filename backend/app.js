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
// This endpoint tries to check DB but never fails with 500 — it always returns 200 with status
app.get('/api/health', async (_req, res) => {
  const base = { ok: true, service: 'HRMS API', time: new Date().toISOString(), env: config.isServerless ? 'serverless' : 'local' };
  try {
    const { sequelize } = require('./src/db');
    if (sequelize) {
      await sequelize.authenticate();
      base.dbReady = true;
      base.dialect = sequelize.getDialect();
      try {
        const { User } = require('./src/models');
        const count = await User.count();
        base.users = count;
      } catch (_) {
        base.users = 'unknown';
      }
    }
  } catch (err) {
    base.ok = true; // Still ok for load balancer, but indicate DB issue
    base.dbReady = false;
    base.dbError = err.message.slice(0, 300);
    base.code = err.code || 'DB_INIT';
    console.warn('[hrms] Health check DB not ready:', err.message);
  }
  res.json(base);
});

// Detailed health for debugging (requires no auth but more info)
app.get('/api/health/detailed', async (_req, res) => {
  const info = {
    ok: true,
    service: 'HRMS API',
    time: new Date().toISOString(),
    node: process.version,
    env: {
      isServerless: config.isServerless,
      isProd: config.isProd,
      hasDatabaseUrl: Boolean(config.database.url),
      databaseUrlHost: (() => {
        try {
          return config.database.url ? new URL(config.database.url).hostname : 'sqlite';
        } catch {
          return 'invalid-url';
        }
      })(),
      storage: config.database.storage,
    },
  };
  try {
    const { sequelize } = require('./src/db');
    await sequelize.authenticate();
    info.db = { ready: true, dialect: sequelize.getDialect() };
    const models = require('./src/models');
    info.db.tables = {
      users: await models.User.count().catch((e) => `error: ${e.message}`),
      employees: await models.Employee.count().catch((e) => `error: ${e.message}`),
      attendance: await models.Attendance.count().catch((e) => `error: ${e.message}`),
    };
  } catch (err) {
    info.db = { ready: false, error: err.message, code: err.code, stack: err.stack?.slice(0, 500) };
  }
  res.json(info);
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
    ...(status >= 500 && process.env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
  });
});

module.exports = app;
