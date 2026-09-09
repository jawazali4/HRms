/**
 * Database connection - OPTIMIZED FOR SPEED AND CONNECTION POOLING
 * 
 * Fixes:
 * - EMAXCONNSESSION max clients reached (Supabase pool_size:15)
 * - Slow warming up
 * 
 * Solution:
 * - Serverless pool max:1 (not 5) to stay under Supabase limit
 * - Fast init: authenticate only, skip heavy alter:true sync on every request
 * - Migrations run only once per cold start, cached, and only if needed
 * - Table existence cached in memory
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('../config');

let sequelize;
let migrationCache = null;
let migrationRun = false;

function resolveSqliteStorage(preferred) {
  const candidates = [
    preferred,
    path.join(os.tmpdir(), 'hrms', 'hrms.sqlite'),
    path.join(os.tmpdir(), 'hrms.sqlite'),
    path.join('/tmp', 'hrms.sqlite'),
  ].filter(Boolean);
  const seen = new Set();
  const uniq = candidates.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  let lastErr = null;
  for (const file of uniq) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.accessSync(path.dirname(file), fs.constants.W_OK);
      try {
        const fd = fs.openSync(file, 'a');
        fs.closeSync(fd);
      } catch (_) {}
      if (file !== preferred) {
        console.warn(`[hrms] "${preferred}" not writable — using "${file}" instead.`);
      }
      console.log(`[hrms] SQLite storage: ${file}`);
      return file;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('No writable location for SQLite');
}

function checkSupabaseUrl(url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if (config.isServerless && /^db\.[a-z0-9]+\.supabase\.co$/i.test(host)) {
    console.warn(
      `[hrms] DATABASE_URL uses DIRECT host "${host}" (IPv6 only). Use Session Pooler (pooler.supabase.com) instead.`
    );
  }
}

function friendlyDbError(err) {
  const msg = String((err && err.message) || err);
  const stack = String((err && err.stack) || '');
  const combined = `${msg} ${stack}`;
  const directHost = (() => {
    try {
      return /^db\.[a-z0-9]+\.supabase\.co$/i.test(new URL(config.database.url).hostname);
    } catch {
      return false;
    }
  })();

  if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT/.test(combined) && (directHost || /supabase\.co/.test(combined))) {
    const e = new Error(
      'DATABASE_URL uses Direct host (IPv6-only, unreachable from Netlify). Use Session Pooler URI (pooler.supabase.com).'
    );
    e.code = 'DB_HOST_UNREACHABLE';
    e.cause = err;
    return e;
  }
  if (/password authentication failed/i.test(msg)) {
    const e = new Error('Database password wrong in DATABASE_URL.');
    e.code = 'DB_AUTH';
    e.cause = err;
    return e;
  }
  if (/ECONNREFUSED/i.test(combined)) {
    const e = new Error('Cannot connect to DB. Check DATABASE_URL and Supabase project running.');
    e.code = 'DB_CONN_REFUSED';
    e.cause = err;
    return e;
  }
  if (/self signed certificate|SSL|TLS/i.test(combined) && config.database.url) {
    const e = new Error('DB SSL failed. Use Session Pooler URI with sslmode=require.');
    e.code = 'DB_SSL';
    e.cause = err;
    return e;
  }
  if (/SQLITE_BUSY|database is locked|SQLITE_CANTOPEN/i.test(combined)) {
    const e = new Error('SQLite busy, retry in few seconds.');
    e.code = 'DB_BUSY';
    e.cause = err;
    return e;
  }
  if (/max clients reached|EMAXCONNSESSION|too many clients|MaxClientsInSessionMode/i.test(combined)) {
    const e = new Error(
      'Database connection limit reached (Supabase max 15). Wait 5 seconds and retry. If persists, reduce concurrent requests.'
    );
    e.code = 'DB_POOL_FULL';
    e.cause = err;
    return e;
  }
  return err;
}

function loadDialectModule(name) {
  try {
    return require(name);
  } catch (e) {
    if (name === 'sqlite3') {
      const err = new Error(`SQLite module missing (${e.message}).`);
      err.code = 'SQLITE_MODULE_MISSING';
      throw err;
    }
    throw e;
  }
}

// OPTIMIZED POOL FOR SERVERLESS - max 1 to avoid Supabase 15 limit
if (config.database.url) {
  checkSupabaseUrl(config.database.url);
  const isServerless = config.isServerless;
  
  sequelize = new Sequelize(config.database.url, {
    dialect: 'postgres',
    dialectModule: loadDialectModule('pg'),
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      connectionTimeoutMillis: 8000,
      query_timeout: 10000,
      statement_timeout: 10000,
      // Important for Supabase pooler
      keepAlive: true,
    },
    pool: {
      max: isServerless ? 1 : 3,  // Was 5, now 1 for serverless to avoid max clients error
      min: 0,
      idle: 5000,        // Was 10000, now 5s to release faster
      acquire: 10000,    // Was 20000
      evict: 5000,
    },
    retry: {
      max: 2,
    },
  });
} else {
  const storagePath = resolveSqliteStorage(config.database.storage);
  const sqliteModule = loadDialectModule('sqlite3');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    dialectModule: sqliteModule,
    storage: storagePath,
    logging: false,
    pool: {
      max: 1,
      min: 0,
      idle: 5000,
      acquire: 10000,
    },
    retry: {
      max: 2,
      match: [/SQLITE_BUSY/, /database is locked/],
    },
  });
  sequelize.addHook('afterConnect', (connection) => {
    if (connection && typeof connection.run === 'function') {
      try {
        connection.run('PRAGMA busy_timeout = 3000;');
        connection.run('PRAGMA journal_mode = WAL;');
        connection.run('PRAGMA synchronous = NORMAL;');
      } catch (_) {}
    }
  });
}

/**
 * FAST initDb - optimized for serverless
 * - First checks if DB already ready via authenticate (fast)
 * - Only does heavy sync if tables missing or forced
 * - Migrations run only once per cold start, cached
 */
async function initDb({ force = false, alter = false, fast = false } = {}) {
  const start = Date.now();
  console.log(`[hrms] initDb start (force=${force}, alter=${alter}, fast=${fast}, dialect=${sequelize.getDialect()})`);
  
  // Fast path: just authenticate, skip sync if not forced and already migrated
  if (fast && !force && migrationRun) {
    try {
      await sequelize.authenticate();
      console.log(`[hrms] Fast init - authenticated in ${Date.now() - start}ms, skipping sync`);
      return sequelize;
    } catch (e) {
      console.warn('[hrms] Fast auth failed, falling back to full init:', e.message);
    }
  }

  // Normal auth with retry
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await sequelize.authenticate();
      console.log(`[hrms] Auth ok in ${Date.now() - start}ms`);
      break;
    } catch (err) {
      lastErr = friendlyDbError(err);
      console.error(`[hrms] Auth failed attempt ${attempt}:`, err.message);
      if (attempt === 2) throw lastErr;
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }

  // If fast mode and no force, skip heavy sync - just ensure critical tables via quick check
  if (fast && !force) {
    try {
      // Quick check if branches table exists, if not, run migrations
      const [result] = await sequelize.query(
        sequelize.getDialect() === 'postgres' 
          ? `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'branches') as exists`
          : `SELECT name FROM sqlite_master WHERE type='table' AND name='branches'`
      );
      const branchesExists = sequelize.getDialect() === 'postgres' ? result[0]?.exists : result.length > 0;
      
      if (!branchesExists && !migrationRun) {
        console.log('[hrms] Branches missing in fast mode, running migrations...');
        const { ensureTablesAndColumns } = require('./migrations');
        await ensureTablesAndColumns(sequelize);
        migrationRun = true;
      } else {
        console.log(`[hrms] Fast init - tables exist, skipping heavy sync in ${Date.now() - start}ms`);
        migrationRun = true;
        return sequelize;
      }
    } catch (e) {
      console.warn('[hrms] Fast check failed:', e.message);
    }
  }

  // Full sync only when needed (force, alter, or first time)
  const isSqlite = sequelize.getDialect() === 'sqlite';
  const shouldAlter = alter || force;
  
  try {
    if (force) {
      console.log('[hrms] Force sync - dropping and recreating...');
      await sequelize.sync({ force: true });
    } else if (shouldAlter) {
      console.log('[hrms] Sync with alter:true...');
      await sequelize.sync({ alter: true });
    } else {
      console.log('[hrms] Sync without alter (create missing only)...');
      await sequelize.sync({ alter: false });
    }
    console.log(`[hrms] Sync completed in ${Date.now() - start}ms`);
  } catch (err) {
    lastErr = friendlyDbError(err);
    console.error(`[hrms] Sync failed:`, err.message);
    
    // Try migrations as fallback
    try {
      const { ensureTablesAndColumns } = require('./migrations');
      const migResult = await ensureTablesAndColumns(sequelize);
      console.log('[hrms] Migration fallback result:', JSON.stringify(migResult));
      if (migResult.addedColumns.length > 0 || migResult.createdTables.length > 0) {
        console.log(`[hrms] Migration added missing items, continuing in ${Date.now() - start}ms`);
        migrationRun = true;
        return sequelize;
      }
    } catch (migErr) {
      console.warn('[hrms] Migration fallback failed:', migErr.message);
    }
    
    if (!force) {
      console.warn(`[hrms] Sync failed but returning sequelize anyway in ${Date.now() - start}ms for diagnostics`);
      return sequelize;
    }
    throw lastErr;
  }

  // Run migrations once per cold start (cached)
  if (!migrationRun) {
    try {
      const { ensureTablesAndColumns } = require('./migrations');
      const migResult = await ensureTablesAndColumns(sequelize);
      console.log(`[hrms] Migration completed in ${Date.now() - start}ms:`, JSON.stringify(migResult));
      migrationCache = migResult;
      migrationRun = true;
    } catch (migErr) {
      console.warn('[hrms] Migration warning:', migErr.message);
    }
  } else {
    console.log(`[hrms] Migration already run, skipping (cached)`);
  }

  console.log(`[hrms] initDb completed in ${Date.now() - start}ms`);
  return sequelize;
}

// Reset migration cache (for testing or forced re-migration)
function resetMigrationCache() {
  migrationCache = null;
  migrationRun = false;
}

module.exports = { sequelize, initDb, friendlyDbError, resetMigrationCache, getMigrationCache: () => migrationCache };
