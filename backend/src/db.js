/**
 * Database connection.
 *
 * The app works out of the box on a local SQLite file (zero setup).
 * If you paste a Supabase connection string into DATABASE_URL it
 * automatically uses Supabase/Postgres instead — no code changes.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('../config');

let sequelize;

/**
 * Make sure the folder for the SQLite file exists and is writable.
 * On Netlify/Lambda the code directory is read-only, so if the
 * configured location cannot be created we fall back to /tmp instead
 * of crashing while the function is still loading (→ HTTP 502).
 */
function resolveSqliteStorage(preferred) {
  const candidates = [
    preferred,
    path.join(os.tmpdir(), 'hrms', 'hrms.sqlite'),
    path.join(os.tmpdir(), 'hrms.sqlite'),
    path.join('/tmp', 'hrms.sqlite'),
  ].filter(Boolean);
  // Deduplicate while preserving order
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
      // Try to touch the file to ensure we can write
      try {
        const fd = fs.openSync(file, 'a');
        fs.closeSync(fd);
      } catch (_) {
        // file creation may fail but directory is writable — continue
      }
      if (file !== preferred) {
        console.warn(`[hrms] "${preferred}" is not writable — using "${file}" for the SQLite database instead.`);
      }
      console.log(`[hrms] SQLite storage resolved to: ${file}`);
      return file;
    } catch (err) {
      lastErr = err;
      console.warn(`[hrms] SQLite candidate "${file}" not writable: ${err.message}`);
    }
  }
  // If all fail, throw the last error
  throw lastErr || new Error('No writable location for SQLite database');
}

/**
 * Supabase offers two kinds of hosts:
 *   db.<project>.supabase.co          -> direct connection, IPv6 ONLY
 *   aws-0-<region>.pooler.supabase.com -> connection pooler, IPv4 + IPv6
 * Netlify Functions (and most serverless platforms) have no IPv6, so the
 * direct host fails with "getaddrinfo ENOTFOUND". Detect that up front
 * and explain it instead of showing a cryptic DNS error.
 */
function checkSupabaseUrl(url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return; // not a URL we understand — let Sequelize report it
  }
  if (config.isServerless && /^db\.[a-z0-9]+\.supabase\.co$/i.test(host)) {
    console.warn(
      `[hrms] DATABASE_URL points at "${host}" (Supabase DIRECT connection, IPv6 only). ` +
        'Netlify cannot reach it. In Supabase click "Connect" and copy the "Session pooler" ' +
        'or "Transaction pooler" URI (host ends with pooler.supabase.com) instead.'
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

  // Supabase direct host unreachable (IPv6 only)
  if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT/.test(combined) && (directHost || /supabase\.co/.test(combined))) {
    const e = new Error(
      'DATABASE_URL uses the Supabase "Direct connection" host (db.<project>.supabase.co), which is IPv6-only ' +
        'and unreachable from Netlify. In Supabase click "Connect" and copy the "Session pooler" URI ' +
        '(host aws-0-<region>.pooler.supabase.com, port 5432) into DATABASE_URL, then redeploy.'
    );
    e.code = 'DB_HOST_UNREACHABLE';
    e.cause = err;
    return e;
  }
  if (/password authentication failed/i.test(msg)) {
    const e = new Error(
      'Database rejected the password in DATABASE_URL. Re-copy the connection string from Supabase and replace [YOUR-PASSWORD] with your real database password.'
    );
    e.code = 'DB_AUTH';
    e.cause = err;
    return e;
  }
  if (/ECONNREFUSED|connect ECONNREFUSED/i.test(combined)) {
    const e = new Error(
      'Cannot connect to the database. If using Supabase, ensure DATABASE_URL is the Session pooler URI (pooler.supabase.com) and that your Supabase project is running.'
    );
    e.code = 'DB_CONN_REFUSED';
    e.cause = err;
    return e;
  }
  if (/self signed certificate|SSL|TLS/i.test(combined) && config.database.url) {
    const e = new Error(
      'Database SSL connection failed. This usually happens with an incorrect DATABASE_URL. For Supabase, use the Session pooler URI with sslmode=require.'
    );
    e.code = 'DB_SSL';
    e.cause = err;
    return e;
  }
  if (/SQLITE_BUSY|database is locked|SQLITE_CANTOPEN/i.test(combined)) {
    const e = new Error(
      'SQLite database is busy or locked. This can happen with concurrent requests on Netlify. Please retry in a few seconds.'
    );
    e.code = 'DB_BUSY';
    e.cause = err;
    return e;
  }
  return err;
}

function loadDialectModule(name) {
  try {
    return require(name);
  } catch (e) {
    console.error(`[hrms] Failed to load ${name} module:`, e.message);
    // For sqlite3, try to provide a helpful error
    if (name === 'sqlite3') {
      const err = new Error(
        `SQLite module not available (${e.message}). On Netlify, ensure sqlite3 is listed in external_node_modules. Locally, run npm install.`
      );
      err.code = 'SQLITE_MODULE_MISSING';
      throw err;
    }
    throw e;
  }
}

if (config.database.url) {
  checkSupabaseUrl(config.database.url);
  sequelize = new Sequelize(config.database.url, {
    dialect: 'postgres',
    dialectModule: loadDialectModule('pg'),
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      connectionTimeoutMillis: 15000,
      query_timeout: 15000,
      statement_timeout: 15000,
    },
    pool: {
      max: 5,
      min: 0,
      idle: 10000,
      acquire: 20000,
      evict: 10000,
    },
    retry: {
      max: 3,
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
    dialectOptions: {},
    pool: {
      max: 1,
      min: 0,
      idle: 10000,
      acquire: 20000,
    },
    retry: {
      max: 3,
      match: [/SQLITE_BUSY/, /database is locked/, /SQLITE_CANTOPEN/],
    },
  });
  sequelize.addHook('afterConnect', (connection) => {
    if (connection && typeof connection.run === 'function') {
      try {
        connection.run('PRAGMA busy_timeout = 5000;');
        connection.run('PRAGMA journal_mode = WAL;');
        connection.run('PRAGMA synchronous = NORMAL;');
      } catch (_) {}
    }
  });
}

/**
 * Connect and create/update the tables with retry logic.
 */
async function initDb({ force = false, alter = false } = {}) {
  const maxRetries = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[hrms] initDb attempt ${attempt}/${maxRetries} (dialect: ${sequelize.getDialect()})`);
      await sequelize.authenticate();
      console.log('[hrms] Database authentication successful');
      break;
    } catch (err) {
      lastErr = friendlyDbError(err);
      console.error(`[hrms] Database authenticate failed (attempt ${attempt}):`, err.message);
      if (attempt === maxRetries) throw lastErr;
      // Wait before retry (exponential backoff)
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }

  const isSqlite = sequelize.getDialect() === 'sqlite';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sequelize.sync({ force, alter: force ? false : alter && !isSqlite });
      console.log('[hrms] Database sync completed');
      return sequelize;
    } catch (err) {
      lastErr = friendlyDbError(err);
      console.error(`[hrms] Database sync failed (attempt ${attempt}):`, err.message);
      // SQLITE_BUSY is retriable
      if (/SQLITE_BUSY|database is locked/i.test(String(err.message)) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

module.exports = { sequelize, initDb, friendlyDbError };
