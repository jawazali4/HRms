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

let app; // Express app (loaded lazily so a load error becomes a JSON 500)
let handler; // serverless-http wrapper around the app
let readyPromise = null;

function loadApp() {
  if (!handler) {
    const serverless = require('serverless-http');
    app = require('../../backend/app');
    handler = serverless(app, { binary: ['application/pdf', 'application/octet-stream', 'image/*'] });
  }
  return handler;
}

function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const { initDb } = require('../../backend/src/db');
      const models = require('../../backend/src/models');
      // "alter" is intentionally NOT used: on SQLite it recreates tables
      // and fails once data exists. Plain sync() creates missing tables.
      await initDb({ force: false });
      const count = await models.User.count();
      if (count === 0) {
        const payroll = require('../../backend/src/services/payrollService');
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

function jsonError(statusCode, error, code, detail) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error, code, ...(detail ? { detail } : {}) }),
  };
}

module.exports.handler = async (event, context) => {
  if (context) context.callbackWaitsForEmptyEventLoop = false;

  try {
    await ensureReady();
  } catch (err) {
    // Surface the real reason in the function log AND (briefly) to the
    // browser so that a mis-configured DATABASE_URL is easy to spot.
    return jsonError(
      503,
      'Database is still starting. Please refresh in a few seconds.',
      'DB_INIT',
      String((err && err.message) || err).slice(0, 300)
    );
  }

  try {
    const run = loadApp();
    // Netlify may deliver the path either as "/api/..." or as
    // "/.netlify/functions/api/...". Normalize so Express always sees /api.
    const p = event.path || event.rawUrl || '';
    const idx = p.indexOf('/api');
    const ev = idx >= 0 ? { ...event, path: p.slice(idx) } : event;
    return await run(ev, context);
  } catch (err) {
    console.error('[hrms] unhandled error in API function', err);
    return jsonError(500, 'An unexpected error occurred on the server. Please try again.', 'FUNCTION_ERROR');
  }
};
