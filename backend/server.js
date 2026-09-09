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

async function boot() {
  console.log('[hrms] Booting server...');
  console.log(`[hrms] Environment: ${config.isServerless ? 'serverless' : 'local'}, dialect: ${config.database.url ? 'postgres' : 'sqlite'}`);
  console.log(`[hrms] Storage: ${config.database.storage}`);

  await initDb({ force: config.database.forceSync });
  console.log('[hrms] Database initialized');

  // First run → seed demo data so the app is usable immediately.
  let count = 0;
  try {
    count = await models.User.count();
  } catch (e) {
    console.warn('[hrms] Could not count users, assuming 0:', e.message);
  }

  if (count === 0) {
    console.log('[hrms] No users found, seeding demo data...');
    const { seedDemoData } = require('./src/seed');
    const result = await seedDemoData();
    console.log(`[hrms] Demo data seeded:`, result);

    // Pre-generate the August 2026 payroll so dashboards are populated.
    try {
      const payroll = require('./src/services/payrollService');
      await payroll.generatePayslips('2026-08');
      const res = await payroll.finalizePayslips('2026-08');
      console.log(
        `  Payroll Aug 2026 pre-generated → ${res.finalized} slips, ${res.emailed} emailed, email enabled: ${!res.emailDisabled}`
      );
    } catch (payErr) {
      console.warn('[hrms] Payroll pre-generation failed (non-critical):', payErr.message);
    }
  } else {
    console.log(`[hrms] Found ${count} existing users`);
    if (config.database.forceSync) {
      console.log('  Database was reset. (Seeding skipped — tables exist but no data.)');
    }
    // Ensure full demo data exists
    try {
      const { Attendance, Payslip } = models;
      const attCount = await Attendance.count().catch(() => 0);
      const payCount = await Payslip.count().catch(() => 0);
      if (attCount < 10 || payCount === 0) {
        console.log('[hrms] Full demo data missing, seeding in background...');
        const { seedFullDemoData } = require('./src/seed');
        seedFullDemoData()
          .then(() => console.log('[hrms] Background full seed completed'))
          .catch((e) => console.warn('[hrms] Background seed failed:', e.message));
      }
    } catch (e) {
      console.warn('[hrms] Could not check full demo data:', e.message);
    }
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log('');
    console.log('  ┌────────────────────────────────────────────────────┐');
    console.log('  │   HRMS (Saudi Arabia) API is running               │');
    console.log(`  │   Local:  http://localhost:${config.port}/api/health        │`);
    console.log('  │   Health: http://localhost:4000/api/health/detailed │');
    console.log('  └────────────────────────────────────────────────────┘');
    console.log(`  Database: ${config.database.url ? 'PostgreSQL (Supabase)' : 'SQLite (local file)'}`);
    console.log(`  Storage: ${config.database.storage}`);
    console.log(`  Demo login (HR): ahlam@alnoor.sa  /  ${config.seed.demoPassword}`);
    console.log('');
  });
}

boot().catch((err) => {
  console.error('Failed to start:', err);
  console.error(err.stack);
  process.exit(1);
});
