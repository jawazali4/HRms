/**
 * Central configuration. Every setting has a safe default so the app
 * works out-of-the-box with zero configuration (local file database,
 * development JWT secret, etc.).
 */
'use strict';

const os = require('os');
const path = require('path');
require('dotenv').config(); // loads .env from the current working directory (project root)

const isProd = process.env.NODE_ENV === 'production';

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || value === true || value === '1';
}

// Are we running inside a serverless function (Netlify / AWS Lambda)?
// There the deployed code lives on a READ-ONLY filesystem — only /tmp is
// writable. Creating the SQLite file next to the code would throw EACCES
// while the function is loading, which Netlify reports as a bare 502.
const isServerless = Boolean(
  process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
);

function defaultSqlitePath() {
  if (isServerless) return path.join(os.tmpdir(), 'hrms', 'hrms.sqlite');
  return path.join(__dirname, 'data', 'hrms.sqlite');
}

module.exports = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  isServerless,

  company: {
    name: process.env.COMPANY_NAME || 'Al Noor Trading Company',
    email: process.env.COMPANY_EMAIL || 'payroll@company.local',
    country: 'Saudi Arabia',
    currency: 'SAR',
    timezone: 'Asia/Riyadh',
  },

  port: parseInt(process.env.PORT || '4000', 10),

  database: {
    // Supabase/Postgres connection string, e.g.
    // postgres://postgres:password@db.xxxx.supabase.co:5432/postgres
    url: process.env.DATABASE_URL || '',
    // Local SQLite file (used automatically when DATABASE_URL is empty).
    // On Netlify/Lambda this must live in /tmp — see defaultSqlitePath().
    storage: process.env.DB_STORAGE || defaultSqlitePath(),
    forceSync: bool(process.env.DB_FORCE_SYNC, false), // drop + recreate (DANGEROUS)
  },

  jwt: {
    secret:
      process.env.JWT_SECRET || 'hrms-dev-secret-do-not-use-in-production!!',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  seed: {
    // Seed demo data automatically when the database is empty.
    autoSeed: bool(process.env.AUTO_SEED, true),
    demoPassword: process.env.DEMO_PASSWORD || 'Demo@1234',
  },

  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.COMPANY_EMAIL || '',
    secure: bool(process.env.SMTP_SECURE, false),
  },

  frontendUrl:
    process.env.FRONTEND_URL ||
    (isProd ? '/' : 'http://localhost:5173'),

  // Kiosk clock-in/out protection (simple in-memory rate limiting)
  kiosk: {
    maxAttempts: 10, // failed PIN tries before temporary lock
    lockMinutes: 15,
  },
};
