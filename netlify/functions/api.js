/**
 * Netlify Function wrapper — runs the whole Express API as one function.
 * Path: /api/*  →  /.netlify/functions/api/*  (see netlify.toml)
 *
 * Database behaviour:
 *  - DATABASE_URL empty (default): a small SQLite file is created in
 *    Netlify's temporary filesystem (/tmp — the only writable place in
 *    a serverless function). It works instantly for demos, but Netlify
 *    may recycle the function and reset data. For a permanent system,
 *    paste a free Supabase Postgres URL into DATABASE_URL — the same
 *    code then stores everything in Supabase automatically.
 *  - First request initializes tables and loads the demo data once.
 *
 * Why the defensive code below? Netlify shows a bare "502 Bad Gateway"
 * whenever the function throws while loading OR the handler rejects.
 * Everything that can fail is therefore done lazily inside the handler
 * and converted into a JSON error the app can display.
 */
'use strict';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

let app;
let handler;
let readyPromise = null;
let seedPromise = null;
let dbReady = false;

function loadApp() {
  if (!handler) {
    const serverless = require('serverless-http');
    app = require('../../backend/app');
    handler = serverless(app, { binary: ['application/pdf', 'application/octet-stream', 'image/*'] });
  }
  return handler;
}

function ensureDbReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      console.log('[hrms] Starting database initialization...');
      const { initDb } = require('../../backend/src/db');
      await initDb({ force: false });
      dbReady = true;
      console.log('[hrms] Database ready');

      // Minimal seed for instant login — this is fast (<500ms) because it uses precomputed hashes
      const models = require('../../backend/src/models');
      let count = 0;
      try {
        count = await models.User.count();
      } catch (e) {
        console.warn('[hrms] User count failed, assuming 0:', e.message);
        count = 0;
      }

      if (count === 0) {
        console.log('[hrms] No users found, seeding minimal data...');
        const { seedMinimalData } = require('../../backend/src/seed');
        await seedMinimalData();
        console.log('[hrms] Minimal data seeded — login should work now');

        // Trigger full seed + payroll in background (non-blocking for login)
        // We don't await this here — it will continue after response if possible,
        // or be done on next request
        seedFullInBackground();
      } else {
        console.log(`[hrms] Found ${count} existing users — skipping minimal seed`);
        // Ensure full demo data exists in background if needed
        seedFullInBackground();
      }
    })().catch((err) => {
      console.error('[hrms] database init failed', err);
      console.error(err.stack);
      readyPromise = null;
      dbReady = false;
      throw err;
    });
  }
  return readyPromise;
}

function seedFullInBackground() {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      console.log('[hrms] Starting full demo data seeding (background)...');
      const models = require('../../backend/src/models');
      const { Payslip } = models;

      // Check if full data already exists
      const attendanceCount = await models.Attendance.count().catch(() => 0);
      const payslipCount = await Payslip.count().catch(() => 0);

      if (attendanceCount > 50 && payslipCount > 0) {
        console.log(`[hrms] Full demo data already exists (attendance: ${attendanceCount}, payslips: ${payslipCount})`);
        return;
      }

      const { seedFullDemoData } = require('../../backend/src/seed');
      await seedFullDemoData();

      // Generate payroll for Aug 2026 if not exists
      if (payslipCount === 0) {
        console.log('[hrms] Generating August 2026 payroll...');
        const payroll = require('../../backend/src/services/payrollService');
        try {
          const gen = await payroll.generatePayslips('2026-08');
          console.log(`[hrms] Payroll generated: ${gen.generated} slips`);
          const fin = await payroll.finalizePayslips('2026-08');
          console.log(`[hrms] Payroll finalized: ${fin.finalized} slips, emailed: ${fin.emailed}`);
        } catch (payErr) {
          console.warn('[hrms] Payroll generation failed (non-critical):', payErr.message);
        }
      }
      console.log('[hrms] Full demo data seeding completed');
    } catch (err) {
      console.warn('[hrms] Full seeding failed (non-critical, login still works):', err.message);
      // Don't throw — minimal data is enough for login
    } finally {
      seedPromise = null;
    }
  })();

  return seedPromise;
}

function jsonError(statusCode, error, code, detail) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error, code, ...(detail ? { detail } : {}) }),
  };
}

function isKnownDbError(err) {
  return err && (err.code === 'DB_HOST_UNREACHABLE' || err.code === 'DB_AUTH' || err.code === 'DB_CONN_REFUSED' || err.code === 'DB_SSL' || err.code === 'DB_BUSY');
}

module.exports.handler = async (event, context) => {
  if (context) context.callbackWaitsForEmptyEventLoop = false;

  const startTime = Date.now();
  const path = event.path || event.rawUrl || '';
  console.log(`[hrms] ${event.httpMethod || 'UNKNOWN'} ${path} - starting`);

  // Health check should work even if DB is not ready, but try to init DB anyway
  const isHealthCheck = path.includes('/health');

  try {
    await ensureDbReady();
  } catch (err) {
    console.error(`[hrms] DB init failed after ${Date.now() - startTime}ms:`, err.message);

    // For health check, return 503 with details but still include ok:false
    if (isHealthCheck) {
      return {
        statusCode: 503,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ok: false,
          service: 'HRMS API',
          time: new Date().toISOString(),
          dbReady: false,
          error: err.message,
          code: err.code || 'DB_INIT',
        }),
      };
    }

    const known = isKnownDbError(err);
    // Return detailed error for all DB failures, not just known ones
    // This helps users debug DATABASE_URL issues
    const errorMessage = known
      ? err.message
      : `Database initialization failed: ${err.message}. Please try refreshing in a few seconds. If this persists, check Netlify function logs.`;

    return jsonError(
      503,
      errorMessage,
      err.code || 'DB_INIT',
      !known ? String((err && err.stack) || err).slice(0, 500) : undefined
    );
  }

  // If this is a health check and DB is ready, return quickly
  if (isHealthCheck) {
    try {
      const { sequelize } = require('../../backend/src/db');
      await sequelize.authenticate();
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ok: true,
          service: 'HRMS API',
          time: new Date().toISOString(),
          dbReady: true,
          dialect: sequelize.getDialect(),
        }),
      };
    } catch (e) {
      // DB was ready earlier but now fails — still return 200 with warning for health
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ok: true,
          service: 'HRMS API',
          time: new Date().toISOString(),
          dbReady: false,
          warning: e.message,
        }),
      };
    }
  }

  try {
    const run = loadApp();
    const p = event.path || event.rawUrl || '';
    const idx = p.indexOf('/api');
    const ev = idx >= 0 ? { ...event, path: p.slice(idx) } : event;

    const result = await run(ev, context);
    console.log(`[hrms] ${event.httpMethod} ${path} - ${result.statusCode} in ${Date.now() - startTime}ms`);
    return result;
  } catch (err) {
    console.error('[hrms] unhandled error in API function', err);
    console.error(err.stack);
    return jsonError(
      500,
      'An unexpected error occurred on the server. Please try again.',
      'FUNCTION_ERROR',
      String(err.message).slice(0, 500)
    );
  }
};
