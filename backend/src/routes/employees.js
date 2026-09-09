'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Employee, User, Attendance, LeaveRequest, Loan, Payslip, Asset, SalesCommission, AuditLog, Branch, Shift, sequelize } = require('../models');
const { authRequired, ah, requireRole, visibleEmployeeIds, audit, badRequest, notFound } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { hashPasswordSync, hashPin } = require('../services/passwords');
const leaveSvc = require('../services/leaveService');
const { standardMonthlyWage } = require('../services/payrollService');

const HR = requireRole('hr', 'admin');
const ADMIN = requireRole('admin');
const ROLES = ['employee', 'manager', 'hr', 'admin'];
const PAY_TYPES = ['salaried', 'hourly', 'commission'];
const NATIONALITIES = ['saudi', 'gcc', 'expat'];
const GOSI_SCHEMES = ['systemA', 'systemB', 'none'];
const WORK_DAYS = ['sun_thur', 'mon_fri', 'sat_fri', 'sun_fri'];
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
    pictureUrl: emp.pictureUrl || null,
    branchId: emp.branchId || null,
    branchName: emp.branch ? emp.branch.name : null,
    branchCode: emp.branch ? emp.branch.code : null,
    shiftId: emp.shiftId || null,
    shiftName: emp.shift ? emp.shift.name : null,
    shiftCode: emp.shift ? emp.shift.code : null,
    shiftTime: emp.shift ? `${emp.shift.startTime}-${emp.shift.endTime}` : null,
    fingerprintId: emp.fingerprintId || null,
    gender: emp.gender || null,
    birthDate: emp.birthDate || null,
  };
  if (withFinance) {
    try { row.basicSalary = Number(emp.basicSalary); } catch { row.basicSalary = 0; }
    try { row.housingAllowance = Number(emp.housingAllowance); } catch { row.housingAllowance = 0; }
    try { row.transportAllowance = Number(emp.transportAllowance); } catch { row.transportAllowance = 0; }
    try { row.otherAllowances = Number(emp.otherAllowances); } catch { row.otherAllowances = 0; }
    try { row.hourlyRate = Number(emp.hourlyRate); } catch { row.hourlyRate = 0; }
    try { row.commissionRate = Number(emp.commissionRate); } catch { row.commissionRate = 0; }
    try { row.monthlyGross = standardMonthlyWage(emp); } catch { row.monthlyGross = 0; }
    row.gosiScheme = emp.gosiScheme;
    row.nationalId = emp.nationalId;
    row.fullIban = emp.iban;
  }
  return row;
}

// Helper to run migrations if columns missing
async function tryMigrate() {
  try {
    const { ensureTablesAndColumns } = require('../migrations');
    const result = await ensureTablesAndColumns(sequelize);
    console.log('[employees] Migration after error:', result);
    return result;
  } catch (e) {
    console.warn('[employees] Migration failed:', e.message);
    return null;
  }
}

router.get(
  '/',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const isHr = ['hr', 'admin'].includes(req.user.role);
    const where = {};
    if (ids !== null) where.id = { [Op.in]: ids };

    if (isHr) {
      const { department, status, payType, role, search, branchId } = req.query;
      if (department) where.department = department;
      if (status) where.status = status;
      if (payType) where.payType = payType;
      if (role) where.role = role;
      if (branchId) {
        try { 
          const bid = Number(branchId);
          if (!isNaN(bid)) where.branchId = bid;
        } catch {}
      }
      if (search) {
        const like = `%${search}%`;
        where[Op.or] = [
          { fullNameEn: { [Op.like]: like } },
          { fullNameAr: { [Op.like]: like } },
          { employeeCode: { [Op.like]: like } },
          { email: { [Op.like]: like } },
        ];
      }
    }

    const includes = [
      { model: Employee, as: 'Manager', attributes: ['id', 'fullNameEn', 'employeeCode'] },
      { model: User, attributes: ['id', 'email', 'isActive'] },
    ];
    
    try {
      await Branch.count();
      includes.push({ model: Branch, as: 'branch', attributes: ['id', 'name', 'code', 'type'] });
    } catch {}
    
    try {
      await Shift.count();
      includes.push({ model: Shift, as: 'shift', attributes: ['id', 'name', 'code', 'startTime', 'endTime'] });
    } catch {}

    let employees;
    try {
      employees = await Employee.findAll({
        where,
        include: includes,
        order: [['employeeCode', 'ASC']],
      });
    } catch (err) {
      console.warn('[employees] Primary fetch failed:', err.message);
      
      // If column missing, try to migrate and retry
      if (err.message.includes('does not exist') || err.message.includes('no such column') || err.message.includes('pictureUrl') || err.message.includes('branchId') || err.message.includes('shiftId') || err.message.includes('fingerprintId')) {
        console.log('[employees] Column missing detected, attempting migration...');
        await tryMigrate();
        
        // Retry after migration
        try {
          employees = await Employee.findAll({
            where,
            include: includes,
            order: [['employeeCode', 'ASC']],
          });
        } catch (retryErr) {
          console.warn('[employees] Retry after migration failed:', retryErr.message);
          // Final fallback: raw query without new columns
          const fallbackWhere = { ...where };
          delete fallbackWhere.branchId;
          
          // Use raw SQL to get employees without new columns
          try {
            const dialect = sequelize.getDialect();
            let query;
            if (dialect === 'postgres') {
              query = `SELECT * FROM "employees" ORDER BY "employeeCode" ASC`;
            } else {
              query = `SELECT * FROM employees ORDER BY employeeCode ASC`;
            }
            const [results] = await sequelize.query(query);
            // Manually filter by where conditions (simplified)
            employees = results.map(r => ({
              ...r,
              Manager: null,
              User: null,
              branch: null,
              shift: null,
              toJSON: function() { return this; }
            }));
            // Apply in-memory filtering for search etc
            if (where.id && where.id[Op.in]) {
              const allowedIds = where.id[Op.in];
              employees = employees.filter(e => allowedIds.includes(e.id));
            }
            if (isHr && req.query.search) {
              const s = req.query.search.toLowerCase();
              employees = employees.filter(e => 
                (e.fullNameEn && e.fullNameEn.toLowerCase().includes(s)) ||
                (e.fullNameAr && e.fullNameAr.toLowerCase().includes(s)) ||
                (e.employeeCode && e.employeeCode.toLowerCase().includes(s)) ||
                (e.email && e.email.toLowerCase().includes(s))
              );
            }
            // Wrap in model instances for safeEmployee to work
            employees = employees.map(e => {
              const inst = Employee.build(e, { isNewRecord: false });
              inst.Manager = null;
              inst.User = null;
              inst.branch = null;
              inst.shift = null;
              return inst;
            });
          } catch (rawErr) {
            console.error('[employees] Raw query fallback failed:', rawErr.message);
            // Last resort: try without any includes
            employees = await Employee.findAll({
              where: fallbackWhere,
              include: [
                { model: Employee, as: 'Manager', attributes: ['id', 'fullNameEn', 'employeeCode'] },
                { model: User, attributes: ['id', 'email', 'isActive'] },
              ],
              order: [['employeeCode', 'ASC']],
            });
          }
        }
      } else if (err.message.includes('branches') || err.message.includes('shifts')) {
        console.warn('[employees] Fallback without branch/shift due to:', err.message);
        const fallbackWhere = { ...where };
        delete fallbackWhere.branchId;
        employees = await Employee.findAll({
          where: fallbackWhere,
          include: [
            { model: Employee, as: 'Manager', attributes: ['id', 'fullNameEn', 'employeeCode'] },
            { model: User, attributes: ['id', 'email', 'isActive'] },
          ],
          order: [['employeeCode', 'ASC']],
        });
      } else {
        throw err;
      }
    }
    
    const wantsFinance = isHr && (req.query.finance === '1' || req.query.finance === 'true');
    res.json({ employees: employees.map((e) => safeEmployee(e, { withFinance: wantsFinance || (ids === null) })) });
  })
);

router.get(
  '/:id',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const targetId = Number(req.params.id);
    if (ids !== null && !ids.includes(targetId)) {
      return res.status(403).json({ error: 'You may only access your own or your team\'s data.', code: 'SCOPE' });
    }
    
    let emp;
    try {
      emp = await Employee.findByPk(targetId, {
        include: [
          { model: Employee, as: 'Manager', attributes: ['id', 'fullNameEn', 'employeeCode', 'jobTitle'] },
          { model: User, attributes: ['id', 'email', 'isActive'] },
          { model: Branch, as: 'branch' },
          { model: Shift, as: 'shift' },
        ],
      });
    } catch (err) {
      console.warn('[employees/:id] fallback:', err.message);
      if (err.message.includes('does not exist') || err.message.includes('no such column')) {
        await tryMigrate();
        try {
          emp = await Employee.findByPk(targetId, {
            include: [
              { model: Employee, as: 'Manager', attributes: ['id', 'fullNameEn', 'employeeCode', 'jobTitle'] },
              { model: User, attributes: ['id', 'email', 'isActive'] },
              { model: Branch, as: 'branch' },
              { model: Shift, as: 'shift' },
            ],
          });
        } catch {
          emp = await Employee.findByPk(targetId, {
            include: [
              { model: Employee, as: 'Manager', attributes: ['id', 'fullNameEn', 'employeeCode', 'jobTitle'] },
              { model: User, attributes: ['id', 'email', 'isActive'] },
            ],
          });
        }
      } else {
        emp = await Employee.findByPk(targetId, {
          include: [
            { model: Employee, as: 'Manager', attributes: ['id', 'fullNameEn', 'employeeCode', 'jobTitle'] },
            { model: User, attributes: ['id', 'email', 'isActive'] },
          ],
        });
      }
    }
    
    if (!emp) return notFound(res, 'Employee not found.');
    const withFinance = ['hr', 'admin'].includes(req.user.role) || (req.employee && req.employee.id === targetId);
    let balances = null;
    try {
      balances = await leaveSvc.leaveBalances(emp);
    } catch (e) {
      console.warn('[employees] leaveBalances failed:', e.message);
    }
    res.json({ employee: safeEmployee(emp, { withFinance }), balances });
  })
);

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
  pictureUrl: { string: true, max: 2000000 },
  branchId: { number: true, min: 0 },
  shiftId: { number: true, min: 0 },
  fingerprintId: { string: true, max: 50 },
  gender: { string: true, max: 10 },
  birthDate: { string: true, max: 20 },
};

async function nextEmployeeCode() {
  const last = await Employee.findOne({ order: [['id', 'DESC']], attributes: ['employeeCode'] });
  const n = last ? parseInt(String(last.employeeCode).replace(/\D/g, ''), 10) || 1000 : 1000;
  return `EMP-${String(n + 1).padStart(3, '0')}`;
}

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

    const createData = {
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
      pinHash: b.kioskPin ? hashPin(String(b.kioskPin)) : hashPin('1234'),
    };

    try {
      await Branch.count();
      createData.branchId = b.branchId ? Number(b.branchId) : null;
    } catch {}
    try {
      await Shift.count();
      createData.shiftId = b.shiftId ? Number(b.shiftId) : null;
    } catch {}
    
    createData.pictureUrl = b.pictureUrl || null;
    createData.fingerprintId = b.fingerprintId || null;
    createData.gender = b.gender || 'male';
    createData.birthDate = b.birthDate || null;

    let emp;
    try {
      emp = await Employee.create(createData);
    } catch (err) {
      if (err.message.includes('does not exist') || err.message.includes('no such column') || err.message.includes('branchId') || err.message.includes('shiftId') || err.message.includes('pictureUrl') || err.message.includes('fingerprintId')) {
        console.warn('[employees] create fallback without new fields:', err.message);
        await tryMigrate();
        try {
          emp = await Employee.create(createData);
        } catch {
          delete createData.branchId;
          delete createData.shiftId;
          delete createData.pictureUrl;
          delete createData.fingerprintId;
          delete createData.gender;
          delete createData.birthDate;
          emp = await Employee.create(createData);
        }
      } else {
        throw err;
      }
    }

    const generatedPassword = b.password || Math.random().toString(36).slice(2, 10) + 'A1!';
    await User.create({
      email,
      passwordHash: hashPasswordSync(generatedPassword),
      role: b.role || 'employee',
      employeeId: emp.id,
    });

    await audit({ req, action: 'create', entity: 'Employee', entityId: emp.id, meta: { code, email, role: b.role } });
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
      'pictureUrl', 'fingerprintId', 'gender', 'birthDate',
    ];
    for (const f of stringFields) if (b[f] !== undefined) upd[f] = b[f];
    for (const f of ['basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances', 'hourlyRate', 'commissionRate']) {
      if (b[f] !== undefined) upd[f] = Number(b[f]);
    }
    if (b.managerId !== undefined) upd.managerId = b.managerId ? Number(b.managerId) : null;
    if (b.branchId !== undefined) {
      try {
        await Branch.count();
        upd.branchId = b.branchId ? Number(b.branchId) : null;
      } catch {}
    }
    if (b.shiftId !== undefined) {
      try {
        await Shift.count();
        upd.shiftId = b.shiftId ? Number(b.shiftId) : null;
      } catch {}
    }
    if (b.email !== undefined && b.email.toLowerCase().trim() !== emp.email) {
      const newEmail = b.email.toLowerCase().trim();
      if (await Employee.findOne({ where: { email: newEmail, id: { [Op.ne]: emp.id } } })) {
        return badRequest(res, 'Another employee already uses this email');
      }
      upd.email = newEmail;
      await User.update({ email: newEmail }, { where: { employeeId: emp.id } });
    }
    if (b.employeeCode !== undefined && b.employeeCode !== emp.employeeCode) {
      const dup = await Employee.findOne({ where: { employeeCode: b.employeeCode } });
      if (dup) return badRequest(res, 'This employee code is already in use.');
      upd.employeeCode = b.employeeCode;
    }
    if (b.role !== undefined && b.role !== emp.role) {
      if (b.role === 'admin' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admin can assign admin role', code: 'FORBIDDEN' });
      }
      upd.role = b.role;
      await User.update({ role: b.role }, { where: { employeeId: emp.id } });
    }
    
    try {
      await emp.update(upd);
    } catch (err) {
      if (err.message.includes('does not exist') || err.message.includes('no such column') || err.message.includes('branchId') || err.message.includes('shiftId') || err.message.includes('pictureUrl')) {
        await tryMigrate();
        try {
          await emp.update(upd);
        } catch {
          delete upd.branchId;
          delete upd.shiftId;
          delete upd.pictureUrl;
          delete upd.fingerprintId;
          delete upd.gender;
          delete upd.birthDate;
          await emp.update(upd);
        }
      } else {
        throw err;
      }
    }
    
    await audit({ req, action: 'update', entity: 'Employee', entityId: emp.id, meta: { fields: Object.keys(upd) } });
    res.json({ employee: safeEmployee(emp, { withFinance: true }) });
  })
);

router.put(
  '/:id/role',
  authRequired,
  HR,
  validate({ ':id': { number: true }, role: { required: true, oneOf: ROLES } }),
  ah(async (req, res) => {
    const emp = await Employee.findByPk(req.params.id);
    if (!emp) return notFound(res, 'Employee not found.');
    
    const newRole = req.body.role;
    if (newRole === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can assign admin role', code: 'FORBIDDEN' });
    }

    await emp.update({ role: newRole });
    await User.update({ role: newRole }, { where: { employeeId: emp.id } });
    await audit({ req, action: 'update', entity: 'Employee', entityId: emp.id, meta: { what: 'role change', from: emp.role, to: newRole } });
    
    res.json({ ok: true, message: `Role updated to ${newRole} for ${emp.employeeCode}`, employee: safeEmployee(emp, { withFinance: true }) });
  })
);

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

router.delete(
  '/:id',
  authRequired,
  HR,
  ah(async (req, res) => {
    const emp = await Employee.findByPk(req.params.id, { include: [User] });
    if (!emp) return notFound(res, 'Employee not found.');

    if (req.employee && req.employee.id === emp.id) {
      return badRequest(res, 'You cannot delete your own employee record');
    }

    if (emp.role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can delete admin employees', code: 'FORBIDDEN' });
    }

    const subordinates = await Employee.count({ where: { managerId: emp.id } });
    if (subordinates > 0) {
      return badRequest(res, `Cannot delete — this employee is manager of ${subordinates} other employee(s). Reassign them first.`);
    }

    const code = emp.employeeCode;
    const email = emp.email;

    const t = await sequelize.transaction();
    try {
      await Attendance.destroy({ where: { employeeId: emp.id }, transaction: t });
      await LeaveRequest.destroy({ where: { employeeId: emp.id }, transaction: t });
      await Loan.destroy({ where: { employeeId: emp.id }, transaction: t });
      await Payslip.destroy({ where: { employeeId: emp.id }, transaction: t });
      await SalesCommission.destroy({ where: { employeeId: emp.id }, transaction: t });
      await Asset.update({ assignedToId: null, status: 'available' }, { where: { assignedToId: emp.id }, transaction: t });
      await AuditLog.destroy({ where: { entity: 'Employee', entityId: emp.id }, transaction: t });
      await User.destroy({ where: { employeeId: emp.id }, transaction: t });
      await emp.destroy({ transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    await audit({ req, action: 'delete', entity: 'Employee', entityId: emp.id, meta: { code, email } });
    res.json({ ok: true, message: `Employee ${code} (${email}) deleted successfully` });
  })
);

router.post(
  '/bulk-delete',
  authRequired,
  ADMIN,
  validate({ ids: { required: true } }),
  ah(async (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'No employee IDs provided');
    if (ids.length > 50) return badRequest(res, 'Cannot delete more than 50 employees at once');

    if (req.employee && ids.includes(req.employee.id)) {
      return badRequest(res, 'You cannot delete your own record in bulk delete');
    }

    const employees = await Employee.findAll({ where: { id: { [Op.in]: ids } } });
    if (employees.length !== ids.length) return badRequest(res, 'Some employees not found');

    const hasAdmin = employees.some(e => e.role === 'admin');
    if (hasAdmin && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can delete admin employees' });
    }

    for (const emp of employees) {
      const subCount = await Employee.count({ where: { managerId: emp.id, id: { [Op.notIn]: ids } } });
      if (subCount > 0) {
        return badRequest(res, `Employee ${emp.employeeCode} is manager of ${subCount} employees outside selection. Reassign first.`);
      }
    }

    const t = await sequelize.transaction();
    try {
      for (const empId of ids) {
        await Attendance.destroy({ where: { employeeId: empId }, transaction: t });
        await LeaveRequest.destroy({ where: { employeeId: empId }, transaction: t });
        await Loan.destroy({ where: { employeeId: empId }, transaction: t });
        await Payslip.destroy({ where: { employeeId: empId }, transaction: t });
        await SalesCommission.destroy({ where: { employeeId: empId }, transaction: t });
        await Asset.update({ assignedToId: null, status: 'available' }, { where: { assignedToId: empId }, transaction: t });
        await User.destroy({ where: { employeeId: empId }, transaction: t });
      }
      await Employee.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    await audit({ req, action: 'delete', entity: 'Employee', meta: { bulk: true, count: ids.length, ids } });
    res.json({ ok: true, message: `${ids.length} employees deleted successfully` });
  })
);

module.exports = router;
