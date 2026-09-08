'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const {
  Employee, Attendance, LeaveRequest, Loan, Payslip,
} = require('../models');
const { authRequired, ah, requireRole, visibleEmployeeIds } = require('../middleware/auth');
const saudi = require('../services/saudiConfig');
const { currentMonthStr, monthLabel, isWeekend, listWorkingDays, daysInMonth } = require('../services/time');

const HR = requireRole('hr', 'admin');
const HR_ADMIN = ['hr', 'admin'];

/** rows → CSV when ?format=csv is requested */
function maybeCsv(res, rows, filename) {
  if (reqFormat(res) !== 'csv') return false;
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const escape = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
  const lines = [keys.join(',')];
  for (const r of rows) lines.push(keys.map((k) => escape(r[k])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  return res.send(lines.join('\r\n'));
}
function reqFormat(res) {
  return res.req.query.format;
}

/**
 * GET /api/reports/attendance — detailed daily log for a date range.
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD (&employeeId for HR)
 */
router.get(
  '/attendance',
  authRequired,
  ah(async (req, res) => {
    const from = req.query.from || `${currentMonthStr()}-01`;
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const ids = await visibleEmployeeIds(req);
    const where = { date: { [Op.gte]: from, [Op.lte]: to } };
    if (ids !== null) where.employeeId = { [Op.in]: ids };
    if (req.query.employeeId && ids === null) where.employeeId = Number(req.query.employeeId);

    const rows = await Attendance.findAll({
      where,
      include: [{ model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] }],
      order: [['date', 'ASC'], ['id', 'ASC']],
    });
    const data = rows.map((r) => ({
      date: r.date,
      employeeCode: r.employee ? r.employee.employeeCode : '',
      employee: r.employee ? r.employee.fullNameEn : '',
      department: r.employee ? r.employee.department : '',
      clockIn: r.clockIn ? new Date(r.clockIn).toISOString().slice(11, 16) : '',
      clockOut: r.clockOut ? new Date(r.clockOut).toISOString().slice(11, 16) : '',
      source: r.source,
      note: r.note || '',
    }));
    if (maybeCsv(res, data, 'attendance-log')) return null;
    res.json({ from, to, count: data.length, attendance: data });
  })
);

/**
 * GET /api/reports/attendance-summary?month=YYYY-MM — one row per employee:
 * present days, expected workdays, hours, overtime, absence notes.
 */
router.get(
  '/attendance-summary',
  authRequired,
  ah(async (req, res) => {
    const month = req.query.month || currentMonthStr();
    const [y, m] = month.split('-').map(Number);
    const last = daysInMonth(y, m);
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const ids = await visibleEmployeeIds(req);
    const empWhere = { status: { [Op.in]: ['active', 'on_leave'] } };
    if (ids !== null) empWhere.id = { [Op.in]: ids };
    const employees = await Employee.findAll({ where: empWhere });

    const attWhere = { date: { [Op.gte]: from, [Op.lte]: to } };
    if (ids !== null) attWhere.employeeId = { [Op.in]: ids };
    const records = await Attendance.findAll({ where: attWhere, raw: true });

    const byEmp = {};
    for (const r of records) {
      const b = (byEmp[r.employeeId] = byEmp[r.employeeId] || { present: 0, hours: 0, overtimeHrs: 0 });
      b.present += 1;
      if (r.clockIn) {
        const h = r.clockOut ? (new Date(r.clockOut) - new Date(r.clockIn)) / 3600000 : 0;
        b.hours += Math.max(0, h);
        if (!isWeekend(r.date) && h > saudi.STANDARD_HOURS_PER_DAY) b.overtimeHrs += h - saudi.STANDARD_HOURS_PER_DAY;
        if (isWeekend(r.date)) b.overtimeHrs += h;
      }
    }
    const data = employees.map((e) => {
      const st = byEmp[e.id] || { present: 0, hours: 0, overtimeHrs: 0 };
      const expected = listWorkingDays(month).length;
      return {
        employeeCode: e.employeeCode,
        employee: e.fullNameEn,
        department: e.department || '',
        presentDays: st.present,
        expectedWorkdays: expected,
        absentDays: Math.max(0, expected - st.present),
        hours: Math.round(st.hours * 100) / 100,
        overtimeHours: Math.round(st.overtimeHrs * 100) / 100,
      };
    });
    if (maybeCsv(res, data, `attendance-summary-${month}`)) return null;
    res.json({ month, monthLabel: monthLabel(month), attendance: data });
  })
);

/** GET /api/reports/payroll?period — totals by pay type / department */
router.get(
  '/payroll',
  authRequired,
  ah(async (req, res) => {
    const period = req.query.period || new Date().toISOString().slice(0, 7);
    const ids = await visibleEmployeeIds(req);
    const where = { period };
    if (ids !== null) where.employeeId = { [Op.in]: ids };
    const slips = await Payslip.findAll({
      where,
      include: [{ model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department', 'payType', 'nationality', 'gosiScheme'] }],
    });
    const data = slips.map((s) => ({
      period: s.period,
      employeeCode: s.employee ? s.employee.employeeCode : '',
      employee: s.employee ? s.employee.fullNameEn : '',
      department: s.employee ? s.employee.department : '',
      payType: s.employee ? s.employee.payType : '',
      nationality: s.employee ? s.employee.nationality : '',
      basic: Number(s.baseSalary),
      overtime: Number(s.overtimePay),
      commission: Number(s.commissionPay),
      gross: Number(s.grossPay),
      gosiEmployee: Number(s.gosiEmployee),
      gosiEmployer: Number(s.gosiEmployer),
      loan: Number(s.loanRepayment),
      net: Number(s.netPay),
      employerCost: Number(s.employerTotalCost),
      status: s.status,
    }));
    if (maybeCsv(res, data, `payroll-${period}`)) return null;
    res.json({ period, monthLabel: monthLabel(period), payroll: data });
  })
);

/** GET /api/reports/leave?month — leave requests report */
router.get(
  '/leave',
  authRequired,
  ah(async (req, res) => {
    const month = req.query.month || currentMonthStr();
    const [y, m] = month.split('-').map(Number);
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = daysInMonth(y, m);
    const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const ids = await visibleEmployeeIds(req);
    const where = { startDate: { [Op.lte]: to }, endDate: { [Op.gte]: from } };
    if (ids !== null) where.employeeId = { [Op.in]: ids };

    const rows = await LeaveRequest.findAll({
      where,
      include: [{ model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] }],
      order: [['startDate', 'ASC']],
    });
    const data = rows.map((r) => ({
      employeeCode: r.employee ? r.employee.employeeCode : '',
      employee: r.employee ? r.employee.fullNameEn : '',
      department: r.employee ? r.employee.department : '',
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      days: Number(r.days),
      status: r.status,
      reason: r.reason || '',
    }));
    if (maybeCsv(res, data, `leave-${month}`)) return null;
    res.json({ month, leave: data });
  })
);

/** GET /api/reports/loans?status — loan register */
router.get(
  '/loans',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const where = {};
    if (ids !== null) where.employeeId = { [Op.in]: ids };
    if (req.query.status) where.status = req.query.status;
    const rows = await Loan.findAll({
      where,
      include: [{ model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] }],
      order: [['requestedAt', 'DESC']],
    });
    const data = rows.map((r) => ({
      employeeCode: r.employee ? r.employee.employeeCode : '',
      employee: r.employee ? r.employee.fullNameEn : '',
      department: r.employee ? r.employee.department : '',
      amount: Number(r.amount),
      monthlyInstallment: Number(r.monthlyInstallment),
      remaining: Number(r.remainingAmount || r.amount),
      months: r.months,
      status: r.status,
      startMonth: r.startMonth || '',
    }));
    if (maybeCsv(res, data, 'loan-register')) return null;
    res.json({ loans: data });
  })
);

/** GET /api/reports/eosb — end-of-service benefit estimates (HR only) */
router.get(
  '/eosb',
  authRequired,
  HR,
  ah(async (req, res) => {
    const employees = await Employee.findAll({ where: { status: { [Op.in]: ['active', 'on_leave'] } } });
    const data = employees.map((e) => {
      const wage =
        Number(e.basicSalary) + Number(e.housingAllowance) +
        Number(e.transportAllowance) + Number(e.otherAllowances);
      const est = saudi.endOfServiceBenefit(e.hireDate, wage);
      return {
        employeeCode: e.employeeCode,
        employee: e.fullNameEn,
        hireDate: e.hireDate,
        monthlyWage: wage,
        serviceYears: est.serviceYears,
        estimatedWageMonths: est.wageMonths,
        estimatedEOSB: est.total,
        note: 'Estimate: half month per year (first 5 years) then 1 month per year, pro-rated. Confirm exact terms & reason for exit before payment.',
      };
    });
    if (maybeCsv(res, data, 'eosb-estimates')) return null;
    res.json({ eosb: data });
  })
);

module.exports = router;
