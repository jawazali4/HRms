/**
 * Netlify Function wrapper — runs the whole Express API as one function.
 * Path: /api/*  →  /.netlify/functions/api/*  (see netlify.toml)
 *
 * Database behaviour:
 *  - DATABASE_URL empty (default): a small SQLite file is created in
 *    Netlify's temporary filesystem. It works instantly for demos, but
 *    Netlify may recycle the function and reset data. For a permanent
 *    system, paste a free Supabase Postgres URL into DATABASE_URL —
 *    the same code then stores everything in Supabase automatically.
 *  - First request initializes tables and loads the demo data once.
 */
'use strict';

const serverless = require('serverless-http');
const app = require('../../backend/app');
const { initDb } = require('../../backend/src/db');
const models = require('../../backend/src/models');
const payroll = require('../../backend/src/services/payrollService');

let readyPromise = null;

function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await initDb({ force: false, alter: true });
      const count = await models.User.count();
      if (count === 0) {
        const { seedDemoData } = require('../../backend/src/seed');
        await seedDemoData();
        await payroll.generatePayslips('2026-08');
        await payroll.finalizePayslips('2026-08');
        console.log('[hrms] first run: demo data + August 2026 payroll created');
      }
    })().catch((err) => {
      console.error('[hrms] database init failed', err);
      readyPromise = null; // allow a retry on the next request
      throw err;
    });
  }
  return readyPromise;
}

const handler = serverless(app);

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    await ensureReady();
  } catch {
    return {
      statusCode: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Database is still starting. Please refresh in a few seconds.' }),
    };
  }
  // Netlify may deliver the path either as "/api/..." or as
  // "/.netlify/functions/api/...". Normalize so Express always sees /api.
  const p = event.path || '';
  const idx = p.indexOf('/api');
  const ev = idx >= 0 ? { ...event, path: p.slice(idx) } : event;
  return handler(ev, context);
};
