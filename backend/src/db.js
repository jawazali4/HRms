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
  const candidates = [preferred, path.join(os.tmpdir(), 'hrms', 'hrms.sqlite')];
  for (const file of candidates) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.accessSync(path.dirname(file), fs.constants.W_OK);
      if (file !== preferred) {
        console.warn(`[hrms] "${preferred}" is not writable — using "${file}" for the SQLite database instead.`);
      }
      return file;
    } catch (err) {
      if (file === candidates[candidates.length - 1]) throw err;
    }
  }
  return preferred;
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
  const directHost = (() => {
    try { return /^db\.[a-z0-9]+\.supabase\.co$/i.test(new URL(config.database.url).hostname); } catch { return false; }
  })();
  if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT/.test(msg) && (directHost || /supabase\.co/.test(msg))) {
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
    const e = new Error('Database rejected the password in DATABASE_URL. Re-copy the connection string from Supabase and replace [YOUR-PASSWORD] with your real database password.');
    e.code = 'DB_AUTH';
    e.cause = err;
    return e;
  }
  return err;
}

if (config.database.url) {
  checkSupabaseUrl(config.database.url);
  sequelize = new Sequelize(config.database.url, {
    dialect: 'postgres',
    // Explicit module reference: the Netlify function is bundled with
    // esbuild, and a static require is what lets the bundler include it.
    dialectModule: require('pg'),
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // Supabase uses a self-signed cert
      },
    },
    pool: { max: 5, min: 0, idle: 10000 },
  });
} else {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    // sqlite3 is a native module and is marked "external" in netlify.toml
    // so Netlify ships the real binary instead of trying to bundle it.
    dialectModule: require('sqlite3'),
    storage: resolveSqliteStorage(config.database.storage),
    logging: false,
  });
}

/**
 * Connect and create/update the tables.
 *
 *  - force: drop everything and recreate (DANGEROUS, dev only).
 *  - alter: only used on Postgres. On SQLite, Sequelize implements
 *    ALTER as "copy table → DROP → CREATE", which fails with
 *    "FOREIGN KEY constraint failed" as soon as data exists. Because
 *    the Netlify function calls initDb() on every cold start, that
 *    error surfaced as a 503/502 on the second visit. A plain sync()
 *    creates any missing tables and is safe to run repeatedly.
 */
async function initDb({ force = false, alter = false } = {}) {
  try {
    await sequelize.authenticate();
  } catch (err) {
    throw friendlyDbError(err);
  }
  const isSqlite = sequelize.getDialect() === 'sqlite';
  await sequelize.sync({ force, alter: force ? false : alter && !isSqlite });
  return sequelize;
}

module.exports = { sequelize, initDb };
