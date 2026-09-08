'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Employee, User } = require('../models');
const { authRequired, ah, requireRole, visibleEmployeeIds, audit, badRequest, notFound } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { hashPasswordSync, hashPin } = require('../services/passwords');
const leaveSvc = require('../services/leaveService');
const { standardMonthlyWage } = require('../services/payrollService');

const HR = requireRole('hr', 'admin');
const ROLES = ['employee', 'manager', 'hr', 'admin'];
const PAY_TYPES = ['salaried', 'hourly', 'commission'];
const NATIONALITIES = ['saudi', 'gcc', 'expat'];
const GOSI_SCHEMES = ['systemA', 'systemB', 'none'];
const WORK_DAYS = ['sun_thur', 'mon_fri'];
const STATUSES = ['active', 'on_leave', 'terminated'];

function safeEmployee(emp, { withFinance = false } = {}) {
  const row = {
    id: emp.id,
    employeeCode: emp.employeeCode,
    fullNameAr: emp.fullNameAr,
    fullNameEn: emp.fullNameEn,
    email: emp.email,
    phone: emp.phone,
    nationality: emp.nationality,
    hireDate: emp.hireDate,
    status: emp.status,
    role: emp.role,
    department: emp.department,
    jobTitle: emp.jobTitle,
    managerId: emp.managerId,
    managerName: emp.Manager ? emp.Manager.fullNameEn : null,
    payType: emp.payType,
    contractType: emp.contractType,
    workDays: emp.workDays,
    iban: emp.iban ? String(emp.iban).replace(/^(.{4}).*(.{4})$/, '$1••••••••$2') : null,
    createdLoginEmail: emp.User ? emp.User.email : null,
    isLoginActive: emp.User ? emp.User.isActive : false,
  };
  if (withFinance) {
    row.basicSalary = Number(emp.basicSalary);
    row.housingAllowance = Number(emp.housingAllowance);
    row.transportAllowance = Number(emp.transportAllowance);
    row.otherAllowances = Number(emp.otherAllowances);
    row.hourlyRate = Number(emp.hourlyRate);
    row.commissionRate = Number(emp.commissionRate);
    row.monthlyGross = standardMonthlyWage(emp);
    row.gosiScheme = emp.gosiScheme;
    row.nationalId = emp.nationalId;
  }
  return row;
}

/**
 * GET /api/employees
 * employee → own record only · manager → team + self · hr/admin → all
 * Query: ?department=&status=&payType=&search=&role=&finance=1
 */
router.get(
  '/',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const isHr = ['hr', 'admin'].includes(req.user.role);
    const where = {};
    if (ids !== null) where.id = { [Op.in]: ids };

    if (isHr) {
      const { department, status, payType, role, search } = req.query;
      if (department) where.department = department;
      if (status) where.status = status;
      if (payType) where.payType = payType;
      if (role) where.role = role;
      if (search) {
        where[Op.or] = [
          { fullNameEn: { [Op.like]: `%${search}%` } },
          { fullNameAr: { [Op.like]: `%${search}%` } },
          { employeeCode: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
        ];
      }
    }

    const employees = await Employee.findAll({
      where,
      include: [
        { model: Employee, as: 'Manager', attributes: ['id', 'fullNameEn', 'employeeCode'] },
        { model: User, attributes: ['id', 'email', 'isActive'] },
      ],
      order: [['employeeCode', 'ASC']],
    });
    const wantsFinance = isHr && (req.query.finance === '1' || req.query.finance === 'true');
    res.json({ employees: employees.map((e) => safeEmployee(e, { withFinance: wantsFinance || (ids === null) })) });
  })
);

/**
 * GET /api/employees/:id  — full details + live leave balances
 * (finance fields only for HR/admin and for the employee themself)
 */
router.get(
  '/:id',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const targetId = Number(req.params.id);
    if (ids !== null && !ids.includes(targetId)) {
      return res.status(403).json({ error: 'You may only access your own or your team\'s data.', code: 'SCOPE' });
    }
    const emp = await Employee.findByPk(targetId, {
      include: [
        { model: Employee, as: 'Manager', attributes: ['id', 'fullNameEn', 'employeeCode', 'jobTitle'] },
        { model: User, attributes: ['id', 'email', 'isActive'] },
      ],
    });
    if (!emp) return notFound(res, 'Employee not found.');
    const withFinance = ['hr', 'admin'].includes(req.user.role) || (req.employee && req.employee.id === targetId);
    const balances = await leaveSvc.leaveBalances(emp);
    res.json({ employee: safeEmployee(emp, { withFinance }), balances });
  })
);

/* ---------------- write operations (HR/admin only) ---------------- */

const EMPLOYEE_BODY = {
  fullNameAr: { required: true, string: true, max: 120 },
  fullNameEn: { required: true, string: true, max: 120 },
  email: { required: true, email: true },
  phone: { string: true, max: 30 },
  nationalId: { string: true, max: 30 },
  nationality: { oneOf: NATIONALITIES },
  gosiScheme: { oneOf: GOSI_SCHEMES },
  hireDate: { required: true, date: true },
  status: { oneOf: STATUSES },
  role: { oneOf: ROLES },
  department: { string: true, max: 100 },
  jobTitle: { string: true, max: 100 },
  managerId: { number: true, min: 0 },
  payType: { oneOf: PAY_TYPES },
  basicSalary: { number: true, min: 0, max: 5000000 },
  housingAllowance: { number: true, min: 0, max: 5000000 },
  transportAllowance: { number: true, min: 0, max: 5000000 },
  otherAllowances: { number: true, min: 0, max: 5000000 },
  hourlyRate: { number: true, min: 0, max: 50000 },
  commissionRate: { number: true, min: 0, max: 100 },
  iban: { string: true, max: 34 },
  contractType: { oneOf: ['full_time', 'part_time'] },
  workDays: { oneOf: WORK_DAYS },
};

async function nextEmployeeCode() {
  const last = await Employee.findOne({ order: [['id', 'DESC']], attributes: ['employeeCode'] });
  const n = last ? parseInt(String(last.employeeCode).replace(/\D/g, ''), 10) || 1000 : 1000;
  return `EMP-${String(n + 1).padStart(3, '0')}`;
}

/** POST /api/employees — create employee + login account + kiosk PIN */
router.post(
  '/',
  authRequired,
  HR,
  validate({
    ...EMPLOYEE_BODY,
    password: { optional: true, minLen: 8, max: 200 },
    kioskPin: { optional: true, number: true, min: 1000, max: 9999 },
  }),
  ah(async (req, res) => {
    const b = req.body;
    const email = b.email.toLowerCase().trim();
    if (await Employee.findOne({ where: { email } })) {
      return badRequest(res, 'An employee with this email already exists.');
    }
    if (await User.findOne({ where: { email } })) {
      return badRequest(res, 'A login account with this email already exists.');
    }
    const code = b.employeeCode || (await nextEmployeeCode());
    if (await Employee.findOne({ where: { employeeCode: code } })) {
      return badRequest(res, 'This employee code is already in use.');
    }

    const finance = {
      basicSalary: Number(b.basicSalary || 0),
      housingAllowance: Number(b.housingAllowance || 0),
      transportAllowance: Number(b.transportAllowance || 0),
      otherAllowances: Number(b.otherAllowances || 0),
      hourlyRate: Number(b.hourlyRate || 0),
      commissionRate: Number(b.commissionRate || 0),
    };

    const emp = await Employee.create({
      employeeCode: code,
      fullNameAr: b.fullNameAr,
      fullNameEn: b.fullNameEn,
      email,
      phone: b.phone || null,
      nationalId: b.nationalId || null,
      nationality: b.nationality || 'saudi',
      gosiScheme: b.gosiScheme || 'systemB',
      hireDate: b.hireDate,
      status: b.status || 'active',
      role: b.role || 'employee',
      department: b.department || null,
      jobTitle: b.jobTitle || null,
      managerId: b.managerId ? Number(b.managerId) : null,
      payType: b.payType || 'salaried',
      ...finance,
      iban: b.iban || null,
      contractType: b.contractType || 'full_time',
      workDays: b.workDays || 'sun_thur',
      pinHash: b.kioskPin ? hashPin(String(b.kioskPin)) : null,
    });

    const generatedPassword = b.password || Math.random().toString(36).slice(2, 10) + 'A1!';
    await User.create({
      email,
      passwordHash: hashPasswordSync(generatedPassword),
      role: b.role || 'employee',
      employeeId: emp.id,
    });

    await audit({ req, action: 'create', entity: 'Employee', entityId: emp.id, meta: { code, email } });
    res.status(201).json({
      employee: safeEmployee(emp, { withFinance: true }),
      credentials: {
        email,
        password: b.password ? undefined : generatedPassword,
        note: b.password
          ? 'Use the password you provided.'
          : 'A temporary password was generated — share it with the employee and ask them to change it after first login.',
      },
    });
  })
);

/** PUT /api/employees/:id — update profile (role change syncs the login account) */
const EMPLOYEE_BODY_OPTIONAL = Object.fromEntries(
  Object.entries(EMPLOYEE_BODY).map(([k, rule]) => [k, { ...rule, required: false, optional: true }])
);
router.put(
  '/:id',
  authRequired,
  HR,
  validate({
    ...EMPLOYEE_BODY_OPTIONAL,
    ':id': { number: true, min: 1 },
    employeeCode: { optional: true, string: true, max: 20 },
  }),
  ah(async (req, res) => {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return notFound(res, 'Employee not found.');
    const b = req.body;
    const upd = {};
    const stringFields = [
      'fullNameAr', 'fullNameEn', 'phone', 'nationalId', 'nationality', 'gosiScheme',
      'status', 'department', 'jobTitle', 'payType', 'iban', 'contractType', 'workDays',
    ];
    for (const f of stringFields) if (b[f] !== undefined) upd[f] = b[f];
    for (const f of ['basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances', 'hourlyRate', 'commissionRate']) {
      if (b[f] !== undefined) upd[f] = Number(b[f]);
    }
    if (b.managerId !== undefined) upd.managerId = b.managerId ? Number(b.managerId) : null;
    if (b.employeeCode !== undefined && b.employeeCode !== emp.employeeCode) {
      const dup = await Employee.findOne({ where: { employeeCode: b.employeeCode } });
      if (dup) return badRequest(res, 'This employee code is already in use.');
      upd.employeeCode = b.employeeCode;
    }
    if (b.role !== undefined && b.role !== emp.role) {
      upd.role = b.role;
      await User.update({ role: b.role }, { where: { employeeId: emp.id } });
    }
    await emp.update(upd);
    await audit({ req, action: 'update', entity: 'Employee', entityId: emp.id, meta: { fields: Object.keys(upd) } });
    res.json({ employee: safeEmployee(emp, { withFinance: true }) });
  })
);

/** PUT /api/employees/:id/pin — set/change the kiosk PIN */
router.put(
  '/:id/pin',
  authRequired,
  HR,
  validate({ ':id': { number: true }, pin: { required: true, number: true, min: 1000, max: 9999 } }),
  ah(async (req, res) => {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return notFound(res, 'Employee not found.');
    await emp.update({ pinHash: hashPin(String(req.body.pin)) });
    await audit({ req, action: 'update', entity: 'Employee', entityId: emp.id, meta: { what: 'kiosk pin reset' } });
    res.json({ ok: true, message: `Kiosk PIN updated for ${emp.employeeCode}.` });
  })
);

module.exports = router;
