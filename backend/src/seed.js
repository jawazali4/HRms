/**
 * Demo data — created automatically the first time the app starts.
 *
 * Contains:
 *  • 7 login accounts: HR, manager, employees (incl. Saudi + expat,
 *    salaried + hourly + commission) and a system admin.
 *  • Employees with pay types: salaried, hourly, commission.
 *  • August 2026 attendance history + the current month up to yesterday,
 *    clocked in from kiosk / mobile / web.
 *  • Leave requests (approved annual + unpaid + sick-leave tier demo +
 *    pending requests), loans, sales commissions, assets and payslips.
 *
 * All demo passwords are:  Demo@1234
 * All demo kiosk PINs are: 1234
 */
'use strict';

const config = require('../config');
const {
  User,
  Employee,
  Attendance,
  LeaveRequest,
  Loan,
  Asset,
  SalesCommission,
} = require('./models');
const { hashPasswordSync, hashPin } = require('./services/passwords');
const { todayStr, daysInclusive } = require('./services/time');
const leaveSvc = require('./services/leaveService');

const PW = config.seed.demoPassword || 'Demo@1234';
const PIN = '1234';

/* ---------------------------------------------------------------- */
/* Employees                                                         */
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

/* ---------------------------------------------------------------- */
/* helpers                                                           */
/* ---------------------------------------------------------------- */

async function upsert(model, where, data) {
  const existing = await model.findOne({ where });
  if (existing) {
    await existing.update(data);
    return existing;
  }
  return model.create(data);
}

function riyadhIso(dateStr, riyadhMinutes) {
  // Riyadh is UTC+3 → to store "08:00 Riyadh" as UTC, subtract 3 h.
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + (riyadhMinutes - 180) * 60000).toISOString();
}

function isWorkdayUTC(dow) {
  return dow >= 0 && dow <= 4; // Sun (0) … Thu (4)
}

/* ---------------------------------------------------------------- */
/* main seed                                                         */
/* ---------------------------------------------------------------- */

async function seedDemoData() {
  const created = {};
  for (const e of employees) {
    created[e.employeeCode] = await upsert(Employee, { employeeCode: e.employeeCode }, { ...e, pinHash: hashPin(PIN) });
  }
  // link managers (EMPs report to Khalid EMP-002)
  const khalid = created['EMP-002'];
  for (const code of ['EMP-003', 'EMP-004', 'EMP-005', 'EMP-006']) {
    await created[code].update({ managerId: khalid.id });
  }

  // users (same passwords everywhere)
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
        passwordHash: hashPasswordSync(PW),
        employeeId: emp ? emp.id : null,
      }
    );
    // make sure the employee row role matches the login role
    if (emp && emp.role !== u.role) await emp.update({ role: u.role });
  }

  // ---------------- attendance backfill ----------------
  // August 2026 (full) + current month up to yesterday.
  const attendanceRows = [];
  const offDays = {
    // day ranges each employee is on approved leave / absent
    'EMP-002': { '2026-08-16': '2026-08-27' },
    'EMP-005': { '2026-08-02': '2026-08-06', '2026-08-23': '2026-08-23' },
    'EMP-006': { '2026-08-09': '2026-08-25' },
  };
  const hoursPlan = {
    // employeeCode → workdays (day-of-month) that end at 18:00 (10 h → 2 h OT)
    // or 17:00 (9 h → 1 h OT); normal days are exactly 08:00 → 16:00
    'EMP-002': { overtimeEnd: 1080, overtimeDays: [2, 9, 12] },  // 3 × 2 h overtime
    'EMP-003': { overtimeEnd: 1020, overtimeDays: [4, 10] },     // 2 × 1 h overtime
    'EMP-004': { overtimeEnd: 1080, overtimeDays: [2, 12, 17] }, // 3 × 2 h overtime
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
      if (ym === currentMonth() && day >= todayStr()) break; // future days not filled
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      if (!isWorkdayUTC(dow)) continue;
      for (const e of employees) {
        const off = offDays[e.employeeCode];
        const onLeave = off && Object.keys(off).some((from) => day >= from && day <= off[from]);
        if (onLeave) continue;
        const plan = hoursPlan[e.employeeCode];
        const ot = plan && plan.overtimeDays.includes(d) ? plan.overtimeEnd : 960; // 16:00
        attendanceRows.push({
          employeeId: created[e.employeeCode].id,
          date: day,
          clockIn: riyadhIso(day, 480), // 08:00 Riyadh
          clockOut: riyadhIso(day, ot), // 16:00 normal · 18:00/17:00 overtime
          source: sourcePlan[e.employeeCode],
        });
      }
    }
  }
  // fast bulk insert: only rows that do not already exist
  const existingAtt = await Attendance.findAll({
    attributes: ['employeeId', 'date'],
    raw: true,
  });
  const haveAtt = new Set(existingAtt.map((e) => `${e.employeeId}:${e.date}`));
  const freshAtt = attendanceRows.filter((r) => !haveAtt.has(`${r.employeeId}:${r.date}`));
  for (let i = 0; i < freshAtt.length; i += 250) {
    await Attendance.bulkCreate(freshAtt.slice(i, i + 250));
  }

  // ---------------- approved & pending leave ----------------
  const adminUser = await User.findOne({ where: { email: 'ahlam@alnoor.sa' } });
  const approvals = await User.findOne({ where: { email: 'khalid@alnoor.sa' } });
  const nowIso = new Date().toISOString();
  const leaveRows = [
    // Khalid: 12 calendar days of approved annual leave (fully paid)
    { emp: 'EMP-002', type: 'annual', start: '2026-08-16', end: '2026-08-27', reason: 'Family vacation', status: 'approved', approver: approvals },
    // Noura: 5 days approved annual + 1 day approved unpaid
    { emp: 'EMP-005', type: 'annual', start: '2026-08-02', end: '2026-08-06', reason: 'Annual vacation', status: 'approved', approver: approvals },
    { emp: 'EMP-005', type: 'unpaid', start: '2026-08-23', end: '2026-08-23', reason: 'Personal errand (unpaid)', status: 'approved', approver: approvals },
    // Fatima: sick-leave tier demo — 29 days in June already used within her
    // leave year (full-pay band), so August's 17 days hit the 75% band.
    { emp: 'EMP-006', type: 'sick', start: '2026-06-01', end: '2026-06-29', reason: 'Medical treatment (doctor certificate attached)', status: 'approved', approver: adminUser },
    { emp: 'EMP-006', type: 'sick', start: '2026-08-09', end: '2026-08-25', reason: 'Follow-up medical treatment (doctor certificate attached)', status: 'approved', approver: adminUser },
    // pending requests for the demo of the approval workflow
    { emp: 'EMP-003', type: 'annual', start: '2026-09-27', end: '2026-10-01', reason: 'Travel to visit family', status: 'pending', approver: approvals },
    { emp: 'EMP-005', type: 'annual', start: '2026-09-20', end: '2026-09-24', reason: 'Short vacation', status: 'pending', approver: approvals },
  ];
  for (const lv of leaveRows) {
    const emp = created[lv.emp];
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
    // dedupe: same employee/type/range
    const where = {
      employeeId: emp.id,
      type: lv.type,
      startDate: lv.start,
      endDate: lv.end,
    };
    await upsert(LeaveRequest, where, base);
  }

  // ---------------- loans ----------------
  const loanDefs = [
    {
      emp: 'EMP-005', amount: 12000, monthlyInstallment: 1000, months: 12, interestRate: 0,
      reason: 'Furniture purchase', status: 'approved', startMonth: '2026-08',
    },
    {
      emp: 'EMP-002', amount: 8000, monthlyInstallment: 800, months: 10, interestRate: 0,
      reason: 'Car repair', status: 'pending', startMonth: '2026-10',
    },
    {
      emp: 'EMP-004', amount: 5000, monthlyInstallment: 500, months: 10, interestRate: 0,
      reason: 'Umrah travel support', status: 'pending', startMonth: '2026-10',
    },
  ];
  for (const def of loanDefs) {
    const emp = created[def.emp];
    const where = { employeeId: emp.id, amount: def.amount, startMonth: def.startMonth || null };
    await upsert(
      Loan,
      where,
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
      }
    );
  }

  // ---------------- sales commissions (Aug) ----------------
  await upsert(
    SalesCommission,
    { employeeId: created['EMP-004'].id, period: '2026-08' },
    {
      employeeId: created['EMP-004'].id,
      period: '2026-08',
      salesAmount: 50000,
      description: 'August sales — new accounts & renewals',
    }
  );

  // ---------------- assets ----------------
  const assetDefs = [
    { assetCode: 'AST-1001', name: 'Dell Latitude 5440 Laptop', category: 'Laptop', brand: 'Dell', serialNumber: 'DL-55-2010', purchaseDate: '2026-01-10', purchasePrice: 5200, status: 'assigned', assign: 'EMP-002' },
    { assetCode: 'AST-1002', name: 'HP LaserJet Pro Printer', category: 'Printer', brand: 'HP', serialNumber: 'HP-LJ-7781', purchaseDate: '2025-11-02', purchasePrice: 1850, status: 'available' },
    { assetCode: 'AST-1003', name: 'iPhone 15 Work Phone', category: 'Mobile', brand: 'Apple', serialNumber: 'IP15-99331', purchaseDate: '2026-02-20', purchasePrice: 3900, status: 'assigned', assign: 'EMP-004' },
    { assetCode: 'AST-1004', name: 'Warehouse Scanner (Zebra)', category: 'Scanner', brand: 'Zebra', serialNumber: 'ZB-SC-4488', purchaseDate: '2025-08-15', purchasePrice: 2400, status: 'assigned', assign: 'EMP-003' },
    { assetCode: 'AST-1005', name: 'Office Desk & Chair Set', category: 'Furniture', serialNumber: 'FUR-221', purchaseDate: '2024-03-01', purchasePrice: 2800, status: 'assigned', assign: 'EMP-005' },
    { assetCode: 'AST-1006', name: 'Asus Monitor 27"', category: 'Monitor', brand: 'Asus', serialNumber: 'AS27-1122', purchaseDate: '2025-06-18', purchasePrice: 950, status: 'maintenance' },
  ];
  for (const a of assetDefs) {
    const where = { assetCode: a.assetCode };
    const data = {
      assetCode: a.assetCode, name: a.name, category: a.category,
      brand: a.brand || null, serialNumber: a.serialNumber || null,
      purchaseDate: a.purchaseDate || null, purchasePrice: a.purchasePrice,
      status: a.status,
      assignedToId: a.assign ? created[a.assign].id : null,
      assignedAt: a.assign ? nowIso : null,
      notes: 'Demo asset',
    };
    await upsert(Asset, where, data);
  }

  console.log(`✔ Seeded ${employees.length} employees, ${userDefs.length} users, ${attendanceRows.length} attendance records, leave, loans, commissions and assets.`);
  return { employees: employees.length, users: userDefs.length, attendance: attendanceRows.length };
}

function currentMonth() {
  return todayStr().slice(0, 7);
}

module.exports = { seedDemoData };
