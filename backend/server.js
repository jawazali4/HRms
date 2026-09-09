/**
 * Local development / self-hosted server - PRODUCTION MODE, NO DEMO DATA
 *   npm run dev:api   (or: npm start)
 *
 * Boots the database (creates tables, NO demo data) and
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
  console.log(`[hrms] Mode: ${config.seed.productionMode ? 'PRODUCTION (no demo data, FAST)' : 'DEMO'}`);

  const forceMigrate = config.database.forceMigrate || config.database.forceSync;
  await initDb({ force: config.database.forceSync, alter: forceMigrate, fast: !forceMigrate });
  console.log('[hrms] Database initialized');
  
  if (forceMigrate) {
    try {
      const { ensureTablesAndColumns } = require('./src/migrations');
      const { sequelize } = require('./src/db');
      const migResult = await ensureTablesAndColumns(sequelize, { forceCheck: true });
      console.log('[hrms] Force migration result:', migResult);
    } catch (e) {
      console.warn('[hrms] Force migration failed:', e.message);
    }
  }

  // First run → only create admin, NO demo data
  let count = 0;
  try {
    count = await models.User.count();
  } catch (e) {
    console.warn('[hrms] Could not count users, assuming 0:', e.message);
  }

  if (count === 0) {
    console.log('[hrms] No users found, creating production admin (NO DEMO DATA for speed)...');
    const { seedProductionAdmin } = require('./src/seed');
    const result = await seedProductionAdmin();
    console.log(`[hrms] Production setup:`, result);
    console.log('');
    console.log('  ✅ Clean database ready - no demo data');
    console.log(`  👑 Admin: ${process.env.ADMIN_EMAIL || 'admin@company.sa'} / ${config.seed.demoPassword}`);
    console.log('  📧 Configure Hostinger email in .env for payroll emails');
    console.log('');
  } else {
    console.log(`[hrms] Found ${count} existing users - production mode, no demo seeding for speed`);
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log('');
    console.log('  ┌────────────────────────────────────────────────────┐');
    console.log('  │   HRMS (Saudi Arabia) - PRODUCTION MODE            │');
    console.log(`  │   Local:  http://localhost:${config.port}/api/health        │`);
    console.log('  │   Health: http://localhost:4000/api/health/detailed │');
    console.log('  └────────────────────────────────────────────────────┘');
    console.log(`  Database: ${config.database.url ? 'PostgreSQL (Supabase)' : 'SQLite (local file)'}`);
    console.log(`  Storage: ${config.database.storage}`);
    console.log(`  Mode: PRODUCTION (fast, no demo data)`);
    console.log(`  JWT Expiry: ${config.jwt.expiresIn} (extended for multi-user)`);
    console.log(`  Email: ${config.smtp.host ? `Configured (${config.smtp.host})` : 'Not configured - see HOSTINGER_EMAIL_SETUP.md'}`);
    console.log('');
  });
}

boot().catch((err) => {
  console.error('Failed to start:', err);
  console.error(err.stack);
  process.exit(1);
});
