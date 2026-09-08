/**
 * Database setup / reset script.
 *
 *   npm run db:setup            → create tables + seed demo data (safe to rerun)
 *   npm run db:setup -- --reset → drop & recreate tables + seed fresh demo data
 *   npm run db:setup -- --sync  → only create tables
 *   npm run db:setup -- --seed  → only add demo data (when tables exist)
 *
 * Runs automatically on server start when the database is empty.
 */
'use strict';

const { initDb } = require('../src/db');
const models = require('../src/models');

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const syncOnly = args.includes('--sync');
  const seedOnly = args.includes('--seed');
  const force = reset;

  await initDb({ force });

  if (syncOnly && seedOnly) {
    await maybeSeed(true); // --sync --seed
  } else if (!syncOnly && !seedOnly) {
    await maybeSeed(true); // default
  } else if (syncOnly) {
    console.log('✔ Tables are ready.');
  } else if (seedOnly) {
    await maybeSeed(true);
  }
  process.exit(0);
}

async function maybeSeed(forceSeed) {
  const count = await models.User.count();
  if (count > 0 && !forceSeed) {
    console.log(`Database already has ${count} users — skipping seed.`);
    return;
  }
  const { seedDemoData } = require('../src/seed');
  await seedDemoData();
  console.log('✔ Demo data loaded. Logins: see README / DEPLOYMENT guide.');
}

main().catch((err) => {
  console.error('Database setup failed:', err);
  process.exit(1);
});
