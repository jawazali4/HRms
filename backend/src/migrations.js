'use strict';

/**
 * Manual migrations - OPTIMIZED FOR SPEED
 * - Caches table existence checks
 * - Runs in parallel where possible
 * - Only adds missing columns, skips existing
 * - Fast path for already-migrated DBs
 */

let cache = {
  tables: {},
  columns: {},
  lastCheck: 0,
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isCacheValid() {
  return Date.now() - cache.lastCheck < CACHE_TTL && Object.keys(cache.tables).length > 0;
}

async function ensureTablesAndColumns(sequelize, { forceCheck = false } = {}) {
  const start = Date.now();
  const dialect = sequelize.getDialect();
  const isPostgres = dialect === 'postgres';
  
  console.log(`[migrations] Start (dialect=${dialect}, forceCheck=${forceCheck}, cacheValid=${isCacheValid()})`);
  
  // If cache valid and not forced, return quickly if we know tables exist
  if (!forceCheck && isCacheValid() && cache.tables['branches'] && cache.tables['employees']) {
    console.log(`[migrations] Cache hit - skipping in ${Date.now() - start}ms`);
    return { createdTables: [], addedColumns: [], cached: true, duration: Date.now() - start };
  }
  
  async function tableExists(tableName) {
    if (!forceCheck && cache.tables[tableName] !== undefined) {
      return cache.tables[tableName];
    }
    
    try {
      if (isPostgres) {
        const [results] = await sequelize.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${tableName}') as exists`
        );
        const exists = results[0]?.exists || false;
        cache.tables[tableName] = exists;
        return exists;
      } else {
        const [results] = await sequelize.query(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
        );
        const exists = results.length > 0;
        cache.tables[tableName] = exists;
        return exists;
      }
    } catch (e) {
      console.warn(`[migrations] tableExists ${tableName}:`, e.message);
      return false;
    }
  }
  
  async function columnExists(tableName, columnName) {
    const cacheKey = `${tableName}.${columnName}`;
    if (!forceCheck && cache.columns[cacheKey] !== undefined) {
      return cache.columns[cacheKey];
    }
    
    try {
      if (isPostgres) {
        const [results] = await sequelize.query(
          `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name = '${columnName}') as exists`
        );
        const exists = results[0]?.exists || false;
        cache.columns[cacheKey] = exists;
        return exists;
      } else {
        const [results] = await sequelize.query(`PRAGMA table_info(${tableName})`);
        const exists = results.some(r => r.name === columnName);
        cache.columns[cacheKey] = exists;
        return exists;
      }
    } catch (e) {
      return false;
    }
  }
  
  async function addColumnIfNotExists(tableName, columnName, columnDef) {
    try {
      const exists = await columnExists(tableName, columnName);
      if (exists) return false;
      
      console.log(`[migrations] Adding ${tableName}.${columnName}`);
      if (isPostgres) {
        await sequelize.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${columnDef}`);
      } else {
        try {
          await sequelize.query(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnDef}`);
        } catch (e) {
          if (e.message.includes('duplicate column') || e.message.includes('already exists')) {
            cache.columns[`${tableName}.${columnName}`] = true;
            return false;
          }
          throw e;
        }
      }
      cache.columns[`${tableName}.${columnName}`] = true;
      return true;
    } catch (e) {
      console.warn(`[migrations] Failed ${tableName}.${columnName}:`, e.message);
      return false;
    }
  }
  
  const results = { createdTables: [], addedColumns: [], errors: [], duration: 0 };
  
  try {
    // Fast check: if employees table doesn't exist, let Sequelize handle all creation via sync
    const employeesExists = await tableExists('employees');
    if (!employeesExists) {
      console.log('[migrations] employees table missing - will be created by Sequelize sync, skipping manual');
      cache.lastCheck = Date.now();
      results.duration = Date.now() - start;
      return results;
    }
    
    // Check branches and shifts in parallel
    const [branchesExists, shiftsExists] = await Promise.all([
      tableExists('branches'),
      tableExists('shifts'),
    ]);
    
    // Create missing tables in parallel if postgres
    const createPromises = [];
    
    if (!branchesExists) {
      console.log('[migrations] Creating branches table...');
      if (isPostgres) {
        createPromises.push(
          sequelize.query(`
            CREATE TABLE IF NOT EXISTS "branches" (
              "id" SERIAL PRIMARY KEY,
              "code" VARCHAR(255) NOT NULL UNIQUE,
              "name" VARCHAR(255) NOT NULL,
              "nameAr" VARCHAR(255),
              "type" VARCHAR(255) NOT NULL DEFAULT 'branch',
              "city" VARCHAR(255),
              "address" TEXT,
              "phone" VARCHAR(255),
              "managerId" INTEGER,
              "isActive" BOOLEAN DEFAULT true,
              "defaultShiftId" INTEGER,
              "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
          `).then(() => {
            results.createdTables.push('branches');
            cache.tables['branches'] = true;
          }).catch(e => {
            results.errors.push(`branches: ${e.message}`);
          })
        );
      } else {
        try {
          const { Branch } = require('./models');
          await Branch.sync();
          results.createdTables.push('branches');
          cache.tables['branches'] = true;
        } catch (e) {
          results.errors.push(`branches: ${e.message}`);
        }
      }
    }
    
    if (!shiftsExists) {
      console.log('[migrations] Creating shifts table...');
      if (isPostgres) {
        createPromises.push(
          sequelize.query(`
            CREATE TABLE IF NOT EXISTS "shifts" (
              "id" SERIAL PRIMARY KEY,
              "code" VARCHAR(255) NOT NULL UNIQUE,
              "name" VARCHAR(255) NOT NULL,
              "nameAr" VARCHAR(255),
              "startTime" VARCHAR(255) NOT NULL DEFAULT '08:00',
              "endTime" VARCHAR(255) NOT NULL DEFAULT '17:00',
              "breakStart" VARCHAR(255) DEFAULT '12:00',
              "breakEnd" VARCHAR(255) DEFAULT '13:00',
              "workDays" VARCHAR(255) NOT NULL DEFAULT 'sun_thur',
              "graceIn" INTEGER DEFAULT 15,
              "graceOut" INTEGER DEFAULT 15,
              "overtimeEnabled" BOOLEAN DEFAULT true,
              "branchId" INTEGER,
              "isActive" BOOLEAN DEFAULT true,
              "color" VARCHAR(255) DEFAULT '#0f766e',
              "description" TEXT,
              "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
          `).then(() => {
            results.createdTables.push('shifts');
            cache.tables['shifts'] = true;
          }).catch(e => {
            results.errors.push(`shifts: ${e.message}`);
          })
        );
      } else {
        try {
          const { Shift } = require('./models');
          await Shift.sync();
          results.createdTables.push('shifts');
          cache.tables['shifts'] = true;
        } catch (e) {
          results.errors.push(`shifts: ${e.message}`);
        }
      }
    }
    
    // Wait for table creation
    if (createPromises.length > 0) {
      await Promise.all(createPromises);
    }
    
    // Only check/add columns if we haven't done it recently and tables exist
    // This is the slow part - do it only if needed
    const needsColumnCheck = !isCacheValid() || !cache.columns['employees.pictureUrl'] || forceCheck;
    
    if (needsColumnCheck) {
      console.log('[migrations] Checking for missing columns...');
      
      // Employee columns - check in parallel batches
      const employeeColumns = [
        ['pictureUrl', isPostgres ? 'TEXT' : 'TEXT'],
        ['branchId', 'INTEGER'],
        ['shiftId', 'INTEGER'],
        ['fingerprintId', 'VARCHAR(255)'],
        ['birthDate', isPostgres ? 'DATE' : 'DATE'],
        ['gender', 'VARCHAR(255) DEFAULT \'male\''],
        ['maritalStatus', 'VARCHAR(255)'],
        ['emergencyContact', 'VARCHAR(255)'],
        ['emergencyPhone', 'VARCHAR(255)'],
        ['importBatch', 'VARCHAR(255)'],
      ];
      
      // Add columns in parallel (but limited concurrency to avoid pool exhaustion)
      for (let i = 0; i < employeeColumns.length; i += 3) {
        const batch = employeeColumns.slice(i, i + 3);
        const batchResults = await Promise.all(
          batch.map(([col, def]) => addColumnIfNotExists('employees', col, def).then(added => ({ col, added })))
        );
        for (const { col, added } of batchResults) {
          if (added) results.addedColumns.push(`employees.${col}`);
        }
      }
      
      // Attendance columns - also batched
      const attendanceColumns = [
        ['shiftId', 'INTEGER'],
        ['branchId', 'INTEGER'],
        ['fingerprintData', isPostgres ? 'JSONB' : 'JSON'],
        ['isLate', 'BOOLEAN DEFAULT false'],
        ['isEarlyOut', 'BOOLEAN DEFAULT false'],
        ['lateMinutes', 'INTEGER DEFAULT 0'],
        ['overtimeMinutes', 'INTEGER DEFAULT 0'],
        ['importBatch', 'VARCHAR(255)'],
        ['deviceId', 'VARCHAR(255)'],
      ];
      
      const attendanceExists = await tableExists('attendance');
      if (attendanceExists) {
        for (let i = 0; i < attendanceColumns.length; i += 3) {
          const batch = attendanceColumns.slice(i, i + 3);
          const batchResults = await Promise.all(
            batch.map(([col, def]) => addColumnIfNotExists('attendance', col, def).then(added => ({ col, added })))
          );
          for (const { col, added } of batchResults) {
            if (added) results.addedColumns.push(`attendance.${col}`);
          }
        }
      }
      
      // Assets branchId
      const assetsExists = await tableExists('assets');
      if (assetsExists) {
        const added = await addColumnIfNotExists('assets', 'branchId', 'INTEGER');
        if (added) results.addedColumns.push('assets.branchId');
      }
    } else {
      console.log('[migrations] Skipping column check (cached)');
    }
    
    cache.lastCheck = Date.now();
    results.duration = Date.now() - start;
    console.log(`[migrations] Done in ${results.duration}ms:`, JSON.stringify(results));
    return results;
    
  } catch (err) {
    console.error('[migrations] Failed:', err);
    results.errors.push(err.message);
    results.duration = Date.now() - start;
    return results;
  }
}

function clearCache() {
  cache = { tables: {}, columns: {}, lastCheck: 0 };
}

module.exports = { ensureTablesAndColumns, clearCache, getCache: () => cache };
