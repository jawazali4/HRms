/**
 * Database connection.
 *
 * The app works out of the box on a local SQLite file (zero setup).
 * If you paste a Supabase connection string into DATABASE_URL it
 * automatically uses Supabase/Postgres instead — no code changes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('../config');

let sequelize;

if (config.database.url) {
  sequelize = new Sequelize(config.database.url, {
    dialect: 'postgres',
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
  fs.mkdirSync(path.dirname(config.database.storage), { recursive: true });
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: config.database.storage,
    logging: false,
  });
}

async function initDb({ force = false, alter = false } = {}) {
  await sequelize.authenticate();
  await sequelize.sync({ force, alter });
  return sequelize;
}

module.exports = { sequelize, initDb };
