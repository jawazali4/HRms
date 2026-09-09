/**
 * Netlify Function wrapper - ULTRA FAST, NO DEMO DATA
 * Fixes:
 * - Remove all demo data for production speed
 * - Slow warming up
 * - EMAXCONNSESSION max clients reached
 * - Session expire on payroll download
 * 
 * Optimizations:
 * - Pool max 1 (not 5) to stay under Supabase 15 limit
 * - Fast init: authenticate only, skip heavy alter:true on every request
 * - NO auto seeding of demo data (production mode)
 * - Only creates admin user if no users exist
 * - Health check cached
 */
'use strict';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

let app;
let handler;
let readyPromise = null;
let dbReady = false;
let lastHealthCheck = 0;
let healthCache = null;

function loadApp() {
  if (!handler) {
    const serverless = require('serverless-http');
    app = require('../../backend/app');
    handler = serverless(app, { binary: ['application/pdf', 'application/octet-stream', 'image/*'] });
  }
  return handler;
}

function ensureDbReady({ fast = true } = {}) {
  if (!readyPromise) {
    readyPromise = (async () => {
      const start = Date.now();
      console.log('[hrms] Starting DB init (FAST PRODUCTION MODE, no demo data)...');
      const { initDb, sequelize } = require('../../backend/src/db');
      const config = require('../../backend/config');
      
      // Fast init - just authenticate and quick table check
      await initDb({ force: false, alter: false, fast: true });
      
      // Only run migrations if forced
      if (config.database.forceMigrate) {
        try {
          const { ensureTablesAndColumns } = require('../../backend/src/migrations');
          const migResult = await ensureTablesAndColumns(sequelize, { forceCheck: true });
          console.log('[hrms] Force migration result:', JSON.stringify(migResult));
        } catch (migErr) {
          console.warn('[hrms] Migration warning:', migErr.message);
        }
      } else {
        // Quick migration check (cached, fast)
        try {
          const { ensureTablesAndColumns } = require('../../backend/src/migrations');
          const migResult = await ensureTablesAndColumns(sequelize, { forceCheck: false });
          if (migResult.addedColumns.length > 0 || migResult.createdTables.length > 0) {
            console.log('[hrms] Migration added:', JSON.stringify(migResult));
          }
        } catch (migErr) {
          console.warn('[hrms] Migration check warning:', migErr.message);
        }
      }
      
      dbReady = true;
      console.log(`[hrms] DB ready in ${Date.now() - start}ms`);
      
      // PRODUCTION MODE: Only create admin if no users, NO demo data
      try {
        const models = require('../../backend/src/models');
        let count = 0;
        try {
          count = await models.User.count();
        } catch (e) {
          console.warn('[hrms] User count failed:', e.message);
          count = 0;
        }

        if (count === 0) {
          console.log('[hrms] No users found, creating production admin only (NO DEMO DATA)...');
          const { seedProductionAdmin } = require('../../backend/src/seed');
          await seedProductionAdmin();
          console.log('[hrms] Production admin created - clean DB, no demo data');
        } else {
          console.log(`[hrms] Found ${count} existing users - production mode, no seeding`);
        }
      } catch (seedErr) {
        console.warn('[hrms] Seed check failed:', seedErr.message);
      }
    })().catch((err) => {
      console.error('[hrms] DB init failed', err);
      console.error(err.stack);
      readyPromise = null;
      dbReady = false;
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

function isKnownDbError(err) {
  return err && (err.code === 'DB_HOST_UNREACHABLE' || err.code === 'DB_AUTH' || err.code === 'DB_CONN_REFUSED' || err.code === 'DB_SSL' || err.code === 'DB_BUSY' || err.code === 'DB_POOL_FULL');
}

module.exports.handler = async (event, context) => {
  if (context) context.callbackWaitsForEmptyEventLoop = false;

  const startTime = Date.now();
  const path = event.path || event.rawUrl || '';
  const method = event.httpMethod || 'UNKNOWN';
  console.log(`[hrms] ${method} ${path} - start`);

  const isHealthCheck = path.includes('/health');
  const isDetailedHealth = path.includes('/health/detailed');
  const isSync = path.includes('/health/sync');

  // For detailed health and sync, we need full DB init with migrations
  const needsFullInit = isDetailedHealth || isSync;

  try {
    await ensureDbReady({ fast: !needsFullInit });
  } catch (err) {
    console.error(`[hrms] DB init failed after ${Date.now() - startTime}ms:`, err.message);

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
          hint: err.code === 'DB_POOL_FULL' ? 'Supabase connection limit reached, wait 5s and retry' : undefined,
        }),
      };
    }

    const known = isKnownDbError(err);
    let errorMessage = err.message;
    if (!known) {
      errorMessage = `Database initializing: ${err.message}. Please refresh in 3 seconds.`;
    }
    
    if (err.code === 'DB_POOL_FULL') {
      return jsonError(
        503,
        'Database busy (too many connections). Please wait 5 seconds and refresh.',
        'DB_POOL_FULL'
      );
    }

    return jsonError(
      503,
      errorMessage,
      err.code || 'DB_INIT',
      !known ? String((err && err.stack) || err).slice(0, 300) : undefined
    );
  }

  // Fast health check cache (return cached for 10 seconds to reduce DB load - multi-user optimization)
  if (isHealthCheck && !isDetailedHealth && !isSync) {
    const now = Date.now();
    if (healthCache && now - lastHealthCheck < 10000) {
      console.log(`[hrms] Health cache hit in ${Date.now() - startTime}ms`);
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify(healthCache),
      };
    }
    
    try {
      const { sequelize } = require('../../backend/src/db');
      await sequelize.authenticate();
      const response = {
        ok: true,
        service: 'HRMS API',
        time: new Date().toISOString(),
        dbReady: true,
        dialect: sequelize.getDialect(),
        fast: true,
        productionMode: true,
        demoData: false,
      };
      healthCache = response;
      lastHealthCheck = now;
      console.log(`[hrms] Health ok in ${Date.now() - startTime}ms`);
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify(response),
      };
    } catch (e) {
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
    console.log(`[hrms] ${method} ${path} - ${result.statusCode} in ${Date.now() - startTime}ms`);
    
    // Clear health cache on any write operation to ensure fresh data
    if (method !== 'GET') {
      healthCache = null;
    }
    
    return result;
  } catch (err) {
    console.error('[hrms] Unhandled error', err);
    console.error(err.stack);
    
    if (err.message && (err.message.includes('max clients') || err.message.includes('too many clients') || err.message.includes('EMAXCONNSESSION'))) {
      return jsonError(
        503,
        'Database connection limit reached. Please wait 5 seconds and try again.',
        'DB_POOL_FULL'
      );
    }
    
    return jsonError(
      500,
      'An unexpected error occurred. Please try again.',
      'FUNCTION_ERROR',
      String(err.message).slice(0, 300)
    );
  }
};
