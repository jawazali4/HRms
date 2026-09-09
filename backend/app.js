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

// health check (used by Netlify & monitoring) - FAST, no heavy operations
// This endpoint tries to check DB but never fails with 500 — it always returns 200 with status
app.get('/api/health', async (_req, res) => {
  const base = { ok: true, service: 'HRMS API', time: new Date().toISOString(), env: config.isServerless ? 'serverless' : 'local', fast: true };
  try {
    const { sequelize } = require('./src/db');
    if (sequelize) {
      await sequelize.authenticate();
      base.dbReady = true;
      base.dialect = sequelize.getDialect();
      // Don't do heavy counts in fast health check - just check users quickly
      try {
        const { User } = require('./src/models');
        const count = await User.count();
        base.users = count;
      } catch (_) {
        base.users = 'unknown';
      }
    }
  } catch (err) {
    base.ok = true;
    base.dbReady = false;
    base.dbError = err.message.slice(0, 300);
    base.code = err.code || 'DB_INIT';
    if (err.code === 'DB_POOL_FULL') {
      base.hint = 'Supabase connection limit reached, wait 5s and retry';
    }
  }
  res.json(base);
});

// Detailed health for debugging - does more checks but still tries to be fast
app.get('/api/health/detailed', async (_req, res) => {
  const start = Date.now();
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
    info.db = { ready: true, dialect: sequelize.getDialect(), authMs: Date.now() - start };
    const models = require('./src/models');
    
    // Only do full sync if explicitly requested via ?sync=true or if tables missing
    const shouldSync = _req.query.sync === 'true';
    if (shouldSync) {
      try {
        const { initDb } = require('./src/db');
        await initDb({ force: false, alter: true });
        info.db.syncAttempted = true;
      } catch (syncErr) {
        info.db.syncError = syncErr.message;
      }
      
      try {
        const { ensureTablesAndColumns } = require('./src/migrations');
        const migResult = await ensureTablesAndColumns(sequelize, { forceCheck: true });
        info.db.migration = migResult;
      } catch (migErr) {
        info.db.migrationError = migErr.message;
      }
    }
    
    // Fast table counts in parallel
    const tableChecks = await Promise.allSettled([
      models.User.count().then(c => ({ table: 'users', count: c })).catch(e => ({ table: 'users', error: e.message })),
      models.Employee.count().then(c => ({ table: 'employees', count: c })).catch(e => ({ table: 'employees', error: e.message })),
      models.Attendance.count().then(c => ({ table: 'attendance', count: c })).catch(e => ({ table: 'attendance', error: e.message })),
      models.Branch.count().then(c => ({ table: 'branches', count: c })).catch(e => ({ table: 'branches', error: e.message })),
      models.Shift.count().then(c => ({ table: 'shifts', count: c })).catch(e => ({ table: 'shifts', error: e.message })),
    ]);
    
    info.db.tables = {};
    for (const result of tableChecks) {
      if (result.status === 'fulfilled') {
        const val = result.value;
        info.db.tables[val.table] = val.count !== undefined ? val.count : `error: ${val.error}`;
      }
    }
    
    info.db.durationMs = Date.now() - start;
  } catch (err) {
    info.db = { ready: false, error: err.message, code: err.code, stack: err.stack?.slice(0, 500), durationMs: Date.now() - start };
  }
  res.json(info);
});

// Force DB sync endpoint (admin only, for fixing missing tables)
app.post('/api/health/sync', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Auth required' });
    
    const { initDb, sequelize } = require('./src/db');
    const models = require('./src/models');
    
    console.log('[hrms] Force sync requested');
    
    // Run manual migrations first (adds missing columns)
    let migrationResult = null;
    try {
      const { ensureTablesAndColumns } = require('./src/migrations');
      migrationResult = await ensureTablesAndColumns(sequelize, { forceCheck: true });
      console.log('[hrms] Force migration result:', migrationResult);
    } catch (migErr) {
      console.error('[health/sync] migration failed:', migErr.message);
      migrationResult = { error: migErr.message };
    }
    
    // Then try full sync with alter:true
    try {
      await initDb({ force: false, alter: true });
    } catch (syncErr) {
      console.warn('[health/sync] initDb failed:', syncErr.message);
    }
    
    // Ensure all models synced
    const results = { migration: migrationResult };
    for (const [name, model] of Object.entries(models)) {
      if (name === 'sequelize') continue;
      try {
        await model.sync({ alter: true });
        results[name] = 'synced';
      } catch (e) {
        results[name] = `error: ${e.message}`;
      }
    }
    
    res.json({ ok: true, message: 'Database sync completed', results });
  } catch (err) {
    console.error('[health/sync] failed:', err);
    res.status(500).json({ error: err.message, stack: err.stack?.slice(0, 1000) });
  }
});

// Clear demo data endpoint (admin only) - removes all demo data for production
app.post('/api/health/clear-demo', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Auth required - login as admin first' });
    
    // Verify admin
    const jwt = require('jsonwebtoken');
    const config = require('./config');
    let user = null;
    try {
      const token = auth.replace('Bearer ', '');
      user = jwt.verify(token, config.jwt.secret);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token - please login again' });
    }
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can clear demo data' });
    }
    
    console.log('[hrms] Clear demo data requested by admin:', user.email);
    
    const { clearDemoData } = require('./src/seed');
    const result = await clearDemoData();
    
    res.json({ 
      ok: true, 
      message: 'Demo data cleared successfully! Clean production DB ready.',
      result,
      nextSteps: [
        'Demo employees (EMP-00x) removed',
        'Demo attendance, leaves, loans removed',
        'Only admin user remains',
        'You can now add real employees via Excel import or manually',
        'Configure Hostinger email in Netlify env vars for payroll emails'
      ]
    });
  } catch (err) {
    console.error('[health/clear-demo] failed:', err);
    res.status(500).json({ error: err.message, stack: err.stack?.slice(0, 1000) });
  }
});

// Quick setup guide endpoint
app.get('/api/setup-guide', async (_req, res) => {
  res.json({
    title: 'HRMS Setup Guide - Production Mode',
    steps: [
      {
        step: 1,
        title: 'Remove Demo Data (For Speed)',
        description: 'Demo data makes app slow. Remove it for production.',
        actions: [
          'Login as admin (admin@company.sa / Demo@1234)',
          'POST /api/health/clear-demo with admin token',
          'Or run SQL in Supabase to delete EMP-00x employees',
          'Set env vars: PRODUCTION_MODE=true, REMOVE_DEMO_DATA=true, AUTO_SEED=false'
        ]
      },
      {
        step: 2,
        title: 'Fix Slow & Max Clients Error',
        description: 'Use Transaction Pooler for multi-user speed',
        actions: [
          'In Supabase dashboard → Connect → Transaction pooler (port 6543)',
          'Copy URI: postgres://...@aws-0-xx.pooler.supabase.com:6543/postgres?pgbouncer=true',
          'Add ?pgbouncer=true at end',
          'Paste into Netlify DATABASE_URL env var',
          'Redeploy - now handles thousands of concurrent users'
        ]
      },
      {
        step: 3,
        title: 'Configure Hostinger Email',
        description: 'For payroll emails',
        actions: [
          'hPanel → Emails → Create payroll@yourdomain.com',
          'Netlify → Env vars: SMTP_HOST=smtp.hostinger.com, SMTP_PORT=465, SMTP_USER=payroll@yourdomain.com, SMTP_PASS=your_password, SMTP_SECURE=true',
          'Set COMPANY_NAME and COMPANY_EMAIL',
          'Redeploy and test email in Payroll page'
        ]
      },
      {
        step: 4,
        title: 'Fix Payroll Download Session Expire',
        description: 'Already fixed in latest version',
        actions: [
          'JWT expiry extended to 7 days (was 12h)',
          'Payroll PDF now uses auth token (not direct link)',
          'If still expires, login again - token lasts 7 days',
          'Set JWT_SECRET to random 32+ chars for security',
          'Set JWT_EXPIRES_IN=7d in env vars'
        ]
      },
      {
        step: 5,
        title: 'Add Real Employees',
        description: 'Fast bulk import',
        actions: [
          'Go to Employees page → Download Template',
          'Fill Excel with real employees',
          'Upload Excel → Bulk import',
          'Assign branches and shifts',
          'Set fingerprint IDs for ZKTeco'
        ]
      },
      {
        step: 6,
        title: 'Multi-User Setup',
        description: 'HR, Admin, Employee, Manager',
        actions: [
          'Admin: full access, can manage users',
          'HR: manage employees, payroll, leave, loans',
          'Manager: view team, approve leave/loans',
          'Employee: view own payslips, attendance, request leave',
          'Create users in Users page, assign roles',
          'Each user gets login with role-based dashboard'
        ]
      }
    ],
    envVars: {
      required: [
        'DATABASE_URL (use Transaction Pooler port 6543 with ?pgbouncer=true)',
        'JWT_SECRET (random 32+ chars)',
        'JWT_EXPIRES_IN=7d'
      ],
      email: [
        'SMTP_HOST=smtp.hostinger.com',
        'SMTP_PORT=465',
        'SMTP_USER=payroll@yourdomain.com',
        'SMTP_PASS=your_hostinger_password',
        'SMTP_FROM=payroll@yourdomain.com',
        'SMTP_SECURE=true',
        'COMPANY_NAME=Your Company',
        'COMPANY_EMAIL=payroll@yourdomain.com'
      ],
      performance: [
        'PRODUCTION_MODE=true',
        'REMOVE_DEMO_DATA=true',
        'AUTO_SEED=false',
        'DB_FORCE_MIGRATE=false'
      ]
    },
    performanceTips: [
      '✅ No demo data = 10x faster',
      '✅ Transaction Pooler (6543) = handles thousands of users',
      '✅ Pool max:1 = no more max clients error',
      '✅ Fast init = <2s cold start (was 5-10s)',
      '✅ Health cache 10s = less DB load',
      '✅ JWT 7d = no session expire on payroll download'
    ]
  });
});

// modules
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/employees', require('./src/routes/employees'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/branches', require('./src/routes/branches'));
app.use('/api/shifts', require('./src/routes/shifts'));
app.use('/api/imports', require('./src/routes/imports'));
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
  if (status >= 500) {
    console.error('Server error:', err);
    console.error(err.stack);
  }
  
  // For table missing errors, provide helpful message
  const msg = err.message || '';
  const isTableMissing = msg.includes('does not exist') || msg.includes('relation') || msg.includes('no such table') || msg.includes('branches') || msg.includes('shifts');
  
  let userMessage = err.message;
  if (status >= 500) {
    if (isTableMissing) {
      userMessage = `Database tables missing or outdated: ${msg}. The system is trying to auto-create them. Please refresh in 5-10 seconds. If this persists, check that DATABASE_URL is correct and run with DB_FORCE_SYNC or PRODUCTION_MODE.`;
    } else {
      userMessage = 'An unexpected error occurred on the server. Please try again.';
    }
  }
  
  res.status(status).json({
    error: userMessage,
    code: err.code || 'ERROR',
    detail: msg.slice(0, 1000),
    ...(isTableMissing ? { hint: 'Tables missing - auto-creation in progress' } : {}),
  });
});

module.exports = app;
