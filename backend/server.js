/**
 * Local development / self-hosted server.
 *   npm run dev:api   (or: npm start)
 *
 * Boots the database (creates tables + demo data on first run) and
 * serves the API on http://localhost:4000
 */
'use strict';

const app = require('./app');
const config = require('./config');
const { initDb } = require('./src/db');
const models = require('./src/models');
const payroll = require('./src/services/payrollService');
const { currentMonthStr } = require('./src/services/time');

async function boot() {
  await initDb({ force: config.database.forceSync });

  // First run → seed demo data so the app is usable immediately.
  const count = await models.User.count();
  if (count === 0) {
    const { seedDemoData } = require('./src/seed');
    await seedDemoData();
    // Pre-generate the August 2026 payroll so dashboards are populated.
    await payroll.generatePayslips('2026-08');
    const res = await payroll.finalizePayslips('2026-08');
    console.log(
      `  Payroll Aug 2026 pre-generated → ${res.finalized} slips, ${res.emailed} emailed, email enabled: ${!res.emailDisabled}`
    );
  } else if (config.database.forceSync) {
    console.log('  Database was reset. (Seeding skipped — tables exist but no data.)');
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log('');
    console.log('  ┌────────────────────────────────────────────────────┐');
    console.log('  │   HRMS (Saudi Arabia) API is running               │');
    console.log(`  │   Local:  http://localhost:${config.port}/api/health        │`);
    console.log('  └────────────────────────────────────────────────────┘');
    console.log(`  Database: ${config.database.url ? 'PostgreSQL (Supabase)' : 'SQLite (local file)'}`);
    console.log(`  Demo login (HR): ahlam@alnoor.sa  /  ${config.seed.demoPassword}`);
  });
}

boot().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
