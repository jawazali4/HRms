/**
 * Demo data — created automatically the first time the app starts.
 * Can be disabled for production use via PRODUCTION_MODE=true or REMOVE_DEMO_DATA=true
 *
 * All demo passwords are:  Demo@1234
 * All demo kiosk PINs are: 1234
 */
'use strict';

const config = require('../config');
const { Op } = require('sequelize');
const {
  User,
  Employee,
  Attendance,
  LeaveRequest,
  Loan,
  Asset,
  SalesCommission,
  Branch,
  Shift,
  Payslip,
  AuditLog,
} = require('./models');
const { hashPasswordSync, hashPin } = require('./services/passwords');
const { todayStr, daysInclusive } = require('./services/time');
const leaveSvc = require('./services/leaveService');

const PW = config.seed.demoPassword || 'Demo@1234';
const PIN = '1234';

const PRECOMPUTED_PW_HASH = '$2a$10$pSnwbF5yY.OJt7tX48DalO/1612f7fXMD/pYvZsYumJOUz56MOkr.';
const PRECOMPUTED_PIN_HASH = '602677b509f08ef5$0cec948a5330345b1f03518c794a2c50e17e488ed6799773fc407560c9503d2c';

function getPasswordHash() {
  if (config.isServerless || process.env.FAST_SEED === 'true') {
    return PRECOMPUTED_PW_HASH;
  }
  if (PW !== 'Demo@1234') {
    return hashPasswordSync(PW);
  }
  return PRECOMPUTED_PW_HASH;
}

function getPinHash() {
  if (config.isServerless || process.env.FAST_SEED === 'true') {
    return PRECOMPUTED_PIN_HASH;
  }
  return hashPin(PIN);
}

/* ---------------------------------------------------------------- */
/* Production minimal seed - only admin user, no demo data          */
/* ---------------------------------------------------------------- */
async function seedProductionAdmin() {
  console.log('[hrms] Production mode - creating only admin user, no demo data...');
  const pwHash = getPasswordHash();
  const pinHash = getPinHash();

  // Create default branches
  const branches = [
    { code: 'HEAD', name: 'Head Office', nameAr: 'المكتب الرئيسي', type: 'head_office', city: 'Buraydah', isActive: true },
    { code: 'FACTORY', name: 'Factory', nameAr: 'المصنع', type: 'factory', city: 'Buraydah', isActive: true },
    { code: 'WH-01', name: 'Warehouse 1', nameAr: 'المستودع 1', type: 'warehouse', city: 'Buraydah', isActive: true },
    { code: 'BR-01', name: 'Branch 1', nameAr: 'الفرع 1', type: 'branch', city: 'Riyadh', isActive: true },
  ];

  const createdBranches = {};
  for (const b of branches) {
    const existing = await Branch.findOne({ where: { code: b.code } });
    if (!existing) {
      createdBranches[b.code] = await Branch.create(b);
    } else {
      createdBranches[b.code] = existing;
    }
  }

  // Create default shifts
  const shifts = [
    { code: 'MORNING', name: 'Morning Shift', nameAr: 'الوردية الصباحية', startTime: '08:00', endTime: '17:00', workDays: 'sun_thur', branchId: createdBranches['HEAD']?.id, color: '#0f766e' },
    { code: 'EVENING', name: 'Evening Shift', nameAr: 'الوردية المسائية', startTime: '16:00', endTime: '01:00', workDays: 'sun_thur', branchId: createdBranches['FACTORY']?.id, color: '#f59e0b' },
    { code: 'NIGHT', name: 'Night Shift', nameAr: 'الوردية الليلية', startTime: '23:00', endTime: '08:00', workDays: 'sun_thur', branchId: createdBranches['FACTORY']?.id, color: '#7c3aed' },
    { code: 'WAREHOUSE', name: 'Warehouse Shift', nameAr: 'وردية المستودع', startTime: '07:00', endTime: '16:00', workDays: 'sat_thu', branchId: createdBranches['WH-01']?.id, color: '#059669' },
  ];

  for (const s of shifts) {
    const existing = await Shift.findOne({ where: { code: s.code } });
    if (!existing) {
      await Shift.create({ ...s, isActive: true });
    }
  }

  // Create only admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@company.sa';
  const adminExists = await User.findOne({ where: { email: adminEmail } });
  if (!adminExists) {
    await User.create({
      email: adminEmail,
      passwordHash: pwHash,
      role: 'admin',
      isActive: true,
      employeeId: null,
    });
    console.log(`[hrms] Admin user created: ${adminEmail} / ${PW}`);
  }

  console.log('[hrms] Production seed complete - empty DB with admin only');
  return { production: true, branches: branches.length, shifts: shifts.length };
}

/* ---------------------------------------------------------------- */
/* Demo employees (only for demo mode)                               */
/* ---------------------------------------------------------------- */
const employees = [
  {
    employeeCode: 'EMP-001', fullNameAr: 'أحلام الحربي', fullNameEn: 'Ahlam Al-Harbi',
    email: 'ahlam@alnoor.sa', phone: '+966 55 000 0001', nationalId: '1012345678',
    nationality: 'saudi', gosiScheme: 'systemA', hireDate: '2020-01-05',
    role: 'hr', department: 'Human Resources', jobTitle: 'HR Manager', managerId: null,
    payType: 'salaried', basicSalary: 11000, housingAllowance: 3000,
    transportAllowance: 500, commissionRate: 0, iban: 'SA4420000001234567890001',
    gosiSubNo: 'GOSI-110001', workDays: 'sun_thur',
  },
  {
    employeeCode: 'EMP-002', fullNameAr: 'خالد القحطاني', fullNameEn: 'Khalid Al-Qahtani',
    email: 'khalid@alnoor.sa', phone: '+966 55 000 0002', nationalId: '1023456789',
    nationality: 'saudi', gosiScheme: 'systemA', hireDate: '2019-06-01',
    role: 'manager', department: 'Sales & Operations', jobTitle: 'Operations Manager', managerId: null,
    payType: 'salaried', basicSalary: 15000, housingAllowance: 5000,
    transportAllowance: 1000, commissionRate: 0, iban: 'SA4420000001234567890002',
    gosiSubNo: 'GOSI-110002', workDays: 'sun_thur',
  },
  {
    employeeCode: 'EMP-003', fullNameAr: 'سارة محمد', fullNameEn: 'Sara Mohammed',
    email: 'sara@alnoor.sa', phone: '+966 55 000 0003', nationalId: 'Iqama-2233445566',
    nationality: 'expat', gosiScheme: 'none', hireDate: '2024-05-15',
    role: 'employee', department: 'Warehouse', jobTitle: 'Warehouse Associate', managerId: null,
    payType: 'hourly', basicSalary: 0, housingAllowance: 0, hourlyRate: 45,
    commissionRate: 0, iban: 'SA4420000001234567890003', workDays: 'sun_thur',
  },
  {
    employeeCode: 'EMP-004', fullNameAr: 'عمر فاروق', fullNameEn: 'Omar Farouk',
    email: 'omar@alnoor.sa', phone: '+966 55 000 0004', nationalId: '1045678901',
    nationality: 'saudi', gosiScheme: 'systemB', hireDate: '2023-09-01',
    role: 'employee', department: 'Sales', jobTitle: 'Sales Executive', managerId: null,
    payType: 'commission', basicSalary: 4500, housingAllowance: 1500,
    commissionRate: 8, iban: 'SA4420000001234567890004', gosiSubNo: 'GOSI-110004',
    workDays: 'sun_thur',
  },
  {
    employeeCode: 'EMP-005', fullNameAr: 'نورة السعود', fullNameEn: 'Noura Al-Saud',
    email: 'noura@alnoor.sa', phone: '+966 55 000 0005', nationalId: '1056789012',
    nationality: 'saudi', gosiScheme: 'systemB', hireDate: '2021-03-15',
    role: 'employee', department: 'Customer Care', jobTitle: 'Customer Service Specialist', managerId: null,
    payType: 'salaried', basicSalary: 9000, housingAllowance: 3000,
    transportAllowance: 1000, commissionRate: 0, iban: 'SA4420000001234567890005',
    gosiSubNo: 'GOSI-110005', workDays: 'sun_thur',
  },
  {
    employeeCode: 'EMP-006', fullNameAr: 'فاطمة زين', fullNameEn: 'Fatima Zain',
    email: 'fatima@alnoor.sa', phone: '+966 55 000 0006', nationalId: '1067890123',
    nationality: 'saudi', gosiScheme: 'systemB', hireDate: '2022-02-10',
    role: 'employee', department: 'Finance', jobTitle: 'Accounts Assistant', managerId: null,
    payType: 'salaried', basicSalary: 5500, housingAllowance: 1500,
    commissionRate: 0, iban: 'SA4420000001234567890006', gosiSubNo: 'GOSI-110006',
    workDays: 'sun_thur',
  },
];

async function upsert(model, where, data) {
  const existing = await model.findOne({ where });
  if (existing) {
    await existing.update(data);
    return existing;
  }
  return model.create(data);
}

function riyadhIso(dateStr, riyadhMinutes) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + (riyadhMinutes - 180) * 60000).toISOString();
}

function isWorkdayUTC(dow) {
  return dow >= 0 && dow <= 4;
}

async function seedMinimalData() {
  // Check production mode
  if (config.seed.productionMode || config.seed.removeDemoData) {
    return seedProductionAdmin();
  }

  console.log('[hrms] Seeding minimal data (employees + users) for fast cold start...');
  const pwHash = getPasswordHash();
  const pinHash = getPinHash();
  const created = {};

  // Create branches and shifts first
  await seedProductionAdmin();

  for (const e of employees) {
    created[e.employeeCode] = await upsert(Employee, { employeeCode: e.employeeCode }, { ...e, pinHash });
  }
  const khalid = created['EMP-002'];
  for (const code of ['EMP-003', 'EMP-004', 'EMP-005', 'EMP-006']) {
    if (created[code] && khalid && created[code].managerId !== khalid.id) {
      await created[code].update({ managerId: khalid.id });
    }
  }

  const userDefs = [
    { email: 'admin@alnoor.sa', role: 'admin', employeeCode: null },
    { email: 'ahlam@alnoor.sa', role: 'hr', employeeCode: 'EMP-001' },
    { email: 'khalid@alnoor.sa', role: 'manager', employeeCode: 'EMP-002' },
    { email: 'sara@alnoor.sa', role: 'employee', employeeCode: 'EMP-003' },
    { email: 'omar@alnoor.sa', role: 'employee', employeeCode: 'EMP-004' },
    { email: 'noura@alnoor.sa', role: 'employee', employeeCode: 'EMP-005' },
    { email: 'fatima@alnoor.sa', role: 'employee', employeeCode: 'EMP-006' },
  ];

  for (const u of userDefs) {
    const emp = u.employeeCode ? created[u.employeeCode] : null;
    await upsert(
      User,
      { email: u.email },
      {
        email: u.email,
        role: u.role,
        isActive: true,
        passwordHash: pwHash,
        employeeId: emp ? emp.id : null,
      }
    );
    if (emp && emp.role !== u.role) await emp.update({ role: u.role });
  }

  console.log('[hrms] Minimal seed complete — login ready');
  return { employees: employees.length, users: userDefs.length, minimal: true };
}

async function seedFullDemoData() {
  if (config.seed.productionMode || config.seed.removeDemoData) {
    console.log('[hrms] Production mode - skipping full demo data');
    return { production: true };
  }

  const minimal = await seedMinimalData();

  const { sequelize } = require('./db');
  const transaction = await sequelize.transaction();
  try {
    const created = {};
    for (const e of employees) {
      const emp = await Employee.findOne({ where: { employeeCode: e.employeeCode }, transaction });
      if (emp) created[e.employeeCode] = emp;
    }

    console.log('[hrms] Seeding attendance...');
    const attendanceRows = [];
    const offDays = {
      'EMP-002': { '2026-08-16': '2026-08-27' },
      'EMP-005': { '2026-08-02': '2026-08-06', '2026-08-23': '2026-08-23' },
      'EMP-006': { '2026-08-09': '2026-08-25' },
    };
    const hoursPlan = {
      'EMP-002': { overtimeEnd: 1080, overtimeDays: [2, 9, 12] },
      'EMP-003': { overtimeEnd: 1020, overtimeDays: [4, 10] },
      'EMP-004': { overtimeEnd: 1080, overtimeDays: [2, 12, 17] },
    };
    const sourcePlan = {
      'EMP-001': 'web', 'EMP-002': 'kiosk', 'EMP-003': 'mobile',
      'EMP-004': 'mobile', 'EMP-005': 'kiosk', 'EMP-006': 'web',
    };

    const monthsToFill = ['2026-08', currentMonth()];
    for (const ym of monthsToFill) {
      const [y, m] = ym.split('-').map(Number);
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      for (let d = 1; d <= dim; d += 1) {
        const day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (ym === currentMonth() && day >= todayStr()) break;
        const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
        if (!isWorkdayUTC(dow)) continue;
        for (const e of employees) {
          const off = offDays[e.employeeCode];
          const onLeave = off && Object.keys(off).some((from) => day >= from && day <= off[from]);
          if (onLeave) continue;
          const plan = hoursPlan[e.employeeCode];
          const ot = plan && plan.overtimeDays.includes(d) ? plan.overtimeEnd : 960;
          if (!created[e.employeeCode]) continue;
          attendanceRows.push({
            employeeId: created[e.employeeCode].id,
            date: day,
            clockIn: riyadhIso(day, 480),
            clockOut: riyadhIso(day, ot),
            source: sourcePlan[e.employeeCode],
          });
        }
      }
    }

    const existingAtt = await Attendance.findAll({
      attributes: ['employeeId', 'date'],
      raw: true,
      transaction,
    });
    const haveAtt = new Set(existingAtt.map((e) => `${e.employeeId}:${e.date}`));
    const freshAtt = attendanceRows.filter((r) => !haveAtt.has(`${r.employeeId}:${r.date}`));
    for (let i = 0; i < freshAtt.length; i += 250) {
      await Attendance.bulkCreate(freshAtt.slice(i, i + 250), { transaction, ignoreDuplicates: true });
    }
    console.log(`[hrms] Attendance seeded: ${freshAtt.length} new records`);

    const adminUser = await User.findOne({ where: { email: 'ahlam@alnoor.sa' }, transaction });
    const approvals = await User.findOne({ where: { email: 'khalid@alnoor.sa' }, transaction });
    const nowIso = new Date().toISOString();
    const leaveRows = [
      { emp: 'EMP-002', type: 'annual', start: '2026-08-16', end: '2026-08-27', reason: 'Family vacation', status: 'approved', approver: approvals },
      { emp: 'EMP-005', type: 'annual', start: '2026-08-02', end: '2026-08-06', reason: 'Annual vacation', status: 'approved', approver: approvals },
      { emp: 'EMP-005', type: 'unpaid', start: '2026-08-23', end: '2026-08-23', reason: 'Personal errand (unpaid)', status: 'approved', approver: approvals },
      { emp: 'EMP-006', type: 'sick', start: '2026-06-01', end: '2026-06-29', reason: 'Medical treatment', status: 'approved', approver: adminUser },
      { emp: 'EMP-006', type: 'sick', start: '2026-08-09', end: '2026-08-25', reason: 'Follow-up treatment', status: 'approved', approver: adminUser },
      { emp: 'EMP-003', type: 'annual', start: '2026-09-27', end: '2026-10-01', reason: 'Travel to visit family', status: 'pending', approver: approvals },
      { emp: 'EMP-005', type: 'annual', start: '2026-09-20', end: '2026-09-24', reason: 'Short vacation', status: 'pending', approver: approvals },
    ];

    for (const lv of leaveRows) {
      const emp = created[lv.emp];
      if (!emp) continue;
      const days = daysInclusive(lv.start, lv.end);
      const win = leaveSvc.leaveWindow(lv.start, emp.hireDate);
      const overlap = leaveSvc.intersectionDays(win.start, win.end, lv.start, lv.end);
      const base = {
        employeeId: emp.id,
        type: lv.type,
        startDate: lv.start,
        endDate: lv.end,
        days: Math.min(days, overlap),
        reason: lv.reason,
        status: lv.status,
      };
      if (lv.status === 'approved') {
        base.approvedById = lv.approver ? lv.approver.id : approvals.id;
        base.approvedAt = nowIso;
        base.reviewedNote = 'Approved (demo data)';
      }
      const where = {
        employeeId: emp.id,
        type: lv.type,
        startDate: lv.start,
        endDate: lv.end,
      };
      const existing = await LeaveRequest.findOne({ where, transaction });
      if (!existing) await LeaveRequest.create(base, { transaction });
    }

    const loanDefs = [
      { emp: 'EMP-005', amount: 12000, monthlyInstallment: 1000, months: 12, interestRate: 0, reason: 'Furniture purchase', status: 'approved', startMonth: '2026-08' },
      { emp: 'EMP-002', amount: 8000, monthlyInstallment: 800, months: 10, interestRate: 0, reason: 'Car repair', status: 'pending', startMonth: '2026-10' },
      { emp: 'EMP-004', amount: 5000, monthlyInstallment: 500, months: 10, interestRate: 0, reason: 'Umrah travel support', status: 'pending', startMonth: '2026-10' },
    ];
    for (const def of loanDefs) {
      const emp = created[def.emp];
      if (!emp) continue;
      const where = { employeeId: emp.id, amount: def.amount, startMonth: def.startMonth || null };
      const existing = await Loan.findOne({ where, transaction });
      if (!existing) {
        await Loan.create(
          {
            employeeId: emp.id,
            amount: def.amount,
            monthlyInstallment: def.monthlyInstallment,
            months: def.months,
            interestRate: def.interestRate,
            reason: def.reason,
            status: def.status,
            startMonth: def.startMonth,
            remainingAmount: def.amount,
            paidMonths: 0,
            requestedAt: new Date(),
            approvedById: approvals ? approvals.id : null,
            approvedAt: def.status === 'approved' ? nowIso : null,
          },
          { transaction }
        );
      }
    }

    const commEmp = created['EMP-004'];
    if (commEmp) {
      const existingComm = await SalesCommission.findOne({ where: { employeeId: commEmp.id, period: '2026-08' }, transaction });
      if (!existingComm) {
        await SalesCommission.create(
          {
            employeeId: commEmp.id,
            period: '2026-08',
            salesAmount: 50000,
            description: 'August sales',
          },
          { transaction }
        );
      }
    }

    const assetDefs = [
      { assetCode: 'AST-1001', name: 'Dell Latitude 5440 Laptop', category: 'Laptop', brand: 'Dell', serialNumber: 'DL-55-2010', purchaseDate: '2026-01-10', purchasePrice: 5200, status: 'assigned', assign: 'EMP-002' },
      { assetCode: 'AST-1002', name: 'HP LaserJet Pro Printer', category: 'Printer', brand: 'HP', serialNumber: 'HP-LJ-7781', purchaseDate: '2025-11-02', purchasePrice: 1850, status: 'available' },
      { assetCode: 'AST-1003', name: 'iPhone 15 Work Phone', category: 'Mobile', brand: 'Apple', serialNumber: 'IP15-99331', purchaseDate: '2026-02-20', purchasePrice: 3900, status: 'assigned', assign: 'EMP-004' },
      { assetCode: 'AST-1004', name: 'Warehouse Scanner (Zebra)', category: 'Scanner', brand: 'Zebra', serialNumber: 'ZB-SC-4488', purchaseDate: '2025-08-15', purchasePrice: 2400, status: 'assigned', assign: 'EMP-003' },
      { assetCode: 'AST-1005', name: 'Office Desk & Chair Set', category: 'Furniture', serialNumber: 'FUR-221', purchaseDate: '2024-03-01', purchasePrice: 2800, status: 'assigned', assign: 'EMP-005' },
      { assetCode: 'AST-1006', name: 'Asus Monitor 27"', category: 'Monitor', brand: 'Asus', serialNumber: 'AS27-1122', purchaseDate: '2025-06-18', purchasePrice: 950, status: 'maintenance' },
    ];
    for (const a of assetDefs) {
      const existing = await Asset.findOne({ where: { assetCode: a.assetCode }, transaction });
      if (!existing) {
        await Asset.create(
          {
            assetCode: a.assetCode,
            name: a.name,
            category: a.category,
            brand: a.brand || null,
            serialNumber: a.serialNumber || null,
            purchaseDate: a.purchaseDate || null,
            purchasePrice: a.purchasePrice,
            status: a.status,
            assignedToId: a.assign ? created[a.assign].id : null,
            assignedAt: a.assign ? nowIso : null,
            notes: 'Demo asset',
          },
          { transaction }
        );
      }
    }

    await transaction.commit();
    console.log(`✔ Full seed completed`);
    return { employees: employees.length, attendance: attendanceRows.length, full: true };
  } catch (err) {
    await transaction.rollback();
    console.error('[hrms] Full seed failed:', err);
    throw err;
  }
}

async function seedDemoData() {
  if (config.seed.productionMode || config.seed.removeDemoData) {
    return seedProductionAdmin();
  }

  if (config.isServerless) {
    const minimal = await seedMinimalData();
    try {
      await seedFullDemoData();
    } catch (e) {
      console.warn('[hrms] Full demo seeding failed:', e.message);
    }
    return minimal;
  }
  return seedFullDemoData();
}

async function clearDemoData() {
  console.log('[hrms] Clearing demo data...');
  const { sequelize } = require('./db');
  const t = await sequelize.transaction();
  try {
    // Delete demo employees (EMP-00x)
    await Attendance.destroy({ where: {}, transaction: t });
    await LeaveRequest.destroy({ where: {}, transaction: t });
    await Loan.destroy({ where: {}, transaction: t });
    await Payslip.destroy({ where: {}, transaction: t });
    await SalesCommission.destroy({ where: {}, transaction: t });
    await Asset.destroy({ where: {}, transaction: t });
    await AuditLog.destroy({ where: {}, transaction: t });
    await User.destroy({ where: { email: { [Op.like]: '%@alnoor.sa' } }, transaction: t });
    await Employee.destroy({ where: { employeeCode: { [Op.like]: 'EMP-00%' } }, transaction: t });
    await t.commit();
    console.log('[hrms] Demo data cleared');
    // Recreate production admin
    await seedProductionAdmin();
    return { ok: true, message: 'Demo data cleared, production admin created' };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

function currentMonth() {
  return todayStr().slice(0, 7);
}

module.exports = { seedDemoData, seedMinimalData, seedFullDemoData, seedProductionAdmin, clearDemoData };
