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

if (config.database.url) {
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
  await sequelize.authenticate();
  const isSqlite = sequelize.getDialect() === 'sqlite';
  await sequelize.sync({ force, alter: force ? false : alter && !isSqlite });
  return sequelize;
}

module.exports = { sequelize, initDb };
