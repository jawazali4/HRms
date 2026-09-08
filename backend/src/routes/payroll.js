'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Payslip, Employee, Loan } = require('../models');
const {
  authRequired, ah, requireRole, visibleEmployeeIds, audit, badRequest, notFound,
} = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const payrollSvc = require('../services/payrollService');
const { buildPayslipPdf } = require('../services/pdfService');
const emailer = require('../services/emailer');
const { currentMonthStr, previousMonthStr, monthLabel } = require('../services/time');

const HR = requireRole('hr', 'admin');
const HR_ADMIN = ['hr', 'admin'];

/** Who may view a given payslip? (owner, their manager, HR) */
async function canViewPayslip(req, slip) {
  if (HR_ADMIN.includes(req.user.role)) return true;
  if (req.employee && req.employee.id === slip.employeeId) return true;
  if (req.user.role === 'manager') {
    const ids = (await visibleEmployeeIds(req)) || [];
    return ids.includes(slip.employeeId);
  }
  return false;
}

function serialize(slip) {
  return {
    id: slip.id,
    employeeId: slip.employeeId,
    period: slip.period,
    employee: slip.employee
      ? { id: slip.employee.id, employeeCode: slip.employee.employeeCode, fullNameEn: slip.employee.fullNameEn, department: slip.employee.department }
      : null,
    baseSalary: Number(slip.baseSalary),
    housingAllowance: Number(slip.housingAllowance),
    transportAllowance: Number(slip.transportAllowance),
    otherAllowances: Number(slip.otherAllowances),
    overtimePay: Number(slip.overtimePay),
    commissionPay: Number(slip.commissionPay),
    grossPay: Number(slip.grossPay),
    gosiEmployee: Number(slip.gosiEmployee),
    loanRepayment: Number(slip.loanRepayment),
    otherDeductions: Number(slip.otherDeductions),
    totalDeductions: Number(slip.totalDeductions),
    netPay: Number(slip.netPay),
    gosiEmployer: Number(slip.gosiEmployer),
    employerTotalCost: Number(slip.employerTotalCost),
    workDaysAttended: slip.workDaysAttended,
    workDaysExpected: slip.workDaysExpected,
    paidLeaveDays: Number(slip.paidLeaveDays),
    unpaidLeaveDays: Number(slip.unpaidLeaveDays),
    hoursWorked: Number(slip.hoursWorked),
    status: slip.status,
    emailedAt: slip.emailedAt,
    emailStatus: slip.emailStatus,
    json: slip.json,
    createdAt: slip.createdAt,
  };
}

/** GET /api/payroll/payslips — list (own/team/all). ?period=YYYY-MM&status= */
router.get(
  '/payslips',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const where = {};
    if (ids !== null) where.employeeId = { [Op.in]: ids };
    if (req.query.period) where.period = req.query.period;
    if (req.query.status) where.status = req.query.status;
    if (req.query.employeeId && ids === null) where.employeeId = Number(req.query.employeeId);

    const rows = await Payslip.findAll({
      where,
      include: [{ model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] }],
      order: [['period', 'DESC'], ['id', 'DESC']],
      limit: Math.min(Number(req.query.limit) || 500, 2000),
    });
    res.json({ payslips: rows.map(serialize) });
  })
);

/** GET /api/payroll/payslips/latest — the newest payslip the caller may see */
router.get(
  '/payslips/latest',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const where = {};
    if (ids !== null) where.employeeId = { [Op.in]: ids };
    const slip = await Payslip.findOne({
      where,
      include: [{ model: Employee, as: 'employee' }],
      order: [['period', 'DESC'], ['id', 'DESC']],
    });
    if (!slip) return res.json({ payslip: null });
    if (!(await canViewPayslip(req, slip))) return res.status(403).json({ error: 'Not allowed.', code: 'FORBIDDEN' });
    res.json({ payslip: serialize(slip) });
  })
);

/** GET /api/payroll/payslips/:id */
router.get(
  '/payslips/:id',
  authRequired,
  ah(async (req, res) => {
    const slip = await Payslip.findByPk(req.params.id, {
      include: [{ model: Employee, as: 'employee' }],
    });
    if (!slip) return notFound(res, 'Pay slip not found.');
    if (!(await canViewPayslip(req, slip))) {
      return res.status(403).json({ error: 'You may only view your own pay slips.', code: 'SCOPE' });
    }
    res.json({ payslip: serialize(slip) });
  })
);

/** GET /api/payroll/payslips/:id/pdf — download as PDF */
router.get(
  '/payslips/:id/pdf',
  authRequired,
  ah(async (req, res) => {
    const slip = await Payslip.findByPk(req.params.id, {
      include: [{ model: Employee, as: 'employee' }],
    });
    if (!slip) return notFound(res, 'Pay slip not found.');
    if (!(await canViewPayslip(req, slip))) {
      return res.status(403).json({ error: 'You may only download your own pay slips.', code: 'SCOPE' });
    }
    const pdf = await buildPayslipPdf({ employee: slip.employee, payslip: slip });
    await audit({ req, action: 'pdf_export', entity: 'Payslip', entityId: slip.id, meta: { period: slip.period } });
    const fname = `payslip-${slip.employee.employeeCode}-${slip.period}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(pdf);
  })
);

/** POST /api/payroll/payslips/:id/email — (re)send one pay slip email */
router.post(
  '/payslips/:id/email',
  authRequired,
  HR,
  ah(async (req, res) => {
    const slip = await Payslip.findByPk(req.params.id, { include: [{ model: Employee, as: 'employee' }] });
    if (!slip) return notFound(res, 'Pay slip not found.');
    const emp = slip.employee;
    if (!emp || !emp.email) return badRequest(res, 'This employee has no email address on file.');

    const result = await emailer.sendMail({
      to: emp.email,
      subject: `Your salary pay slip — ${monthLabel(slip.period)}`,
      html: emailer.payslipEmailHtml({
        employee: emp,
        payslip: slip,
        company: require('../../config').company,
        monthName: monthLabel(slip.period),
      }),
    });
    if (result.ok) {
      await slip.update({ emailStatus: 'sent', emailedAt: new Date() });
      await audit({ req, action: 'payslip_email', entity: 'Payslip', entityId: slip.id, meta: { to: emp.email, ok: true } });
      return res.json({ ok: true, message: `Pay slip emailed to ${emp.email}.` });
    }
    if (result.disabled) {
      return badRequest(res, 'Email is not configured yet. See .env SMTP settings (guide: DEPLOYMENT.md).');
    }
    return res.status(502).json({ error: `Email failed: ${result.error}` });
  })
);

/* ---------------- run payroll (HR) ---------------- */

/** POST /api/payroll/run { period } — generate/refresh draft payslips */
router.post(
  '/run',
  authRequired,
  HR,
  validate({ period: { required: true, ym: true }, employeeIds: { optional: true } }),
  ah(async (req, res) => {
    const { period } = req.body;
    const today = currentMonthStr();
    if (period > today) return badRequest(res, 'Payroll can only be run for the current or past months.');
    if (period < '2020-01') return badRequest(res, 'Please use a period from January 2020 onwards.');

    const result = await payrollSvc.generatePayslips(period, {
      employeeIds: req.body.employeeIds ? req.body.employeeIds.map(Number) : undefined,
    });
    await audit({ req, action: 'payroll_run', entity: 'Payslip', meta: { period, ...result } });
    res.json({
      message: `Payroll for ${monthLabel(period)}: ${result.generated} pay slip(s) generated.`,
      result,
    });
  })
);

/** POST /api/payroll/finalize { period } — mark paid & email every employee */
router.post(
  '/finalize',
  authRequired,
  HR,
  validate({ period: { required: true, ym: true } }),
  ah(async (req, res) => {
    const { period } = req.body;
    const result = await payrollSvc.finalizePayslips(period);
    await audit({ req, action: 'payroll_run', entity: 'Payslip', meta: { period, finalize: true, ...result } });
    res.json({
      message: result.finalized
        ? `${result.finalized} pay slip(s) finalized for ${monthLabel(period)}. Emailed: ${result.emailed}.`
        : `No draft pay slips to finalize for ${monthLabel(period)} — run payroll first.`,
      result,
    });
  })
);

/** POST /api/payroll/reset { period } — unlock a final period so it can be re-run */
router.post(
  '/reset',
  authRequired,
  HR,
  validate({ period: { required: true, ym: true } }),
  ah(async (req, res) => {
    const { period } = req.body;
    const slips = await Payslip.findAll({ where: { period } });
    for (const slip of slips) {
      const applied = (slip.json && slip.json.loanDeductions) || [];
      for (const a of applied) {
        if (!a.loanId) continue;
        const ln = await Loan.findByPk(a.loanId);
        if (ln) {
          ln.paidMonths = Math.max(0, (ln.paidMonths || 0) - 1);
          ln.remainingAmount = Number(ln.remainingAmount) + Number(a.amount);
          await ln.save();
        }
      }
      await slip.destroy();
    }
    await audit({ req, action: 'update', entity: 'Payslip', meta: { period, what: 'reset/unlock' } });
    res.json({ ok: true, message: `Payroll for ${monthLabel(period)} unlocked (${slips.length} slip(s) removed). Run payroll again to regenerate.` });
  })
);

/** GET /api/payroll/summary?period=YYYY-MM — totals & breakdown (HR/manager scope) */
router.get(
  '/summary',
  authRequired,
  ah(async (req, res) => {
    const period = req.query.period || previousMonthStr();
    const ids = await visibleEmployeeIds(req);
    const where = { period };
    if (ids !== null) where.employeeId = { [Op.in]: ids };

    const slips = await Payslip.findAll({
      where,
      include: [{ model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department', 'payType'] }],
    });
    const sum = (k) => slips.reduce((s, x) => s + Number(x[k] || 0), 0);
    const byPayType = {};
    for (const s of slips) {
      const key = s.employee && s.employee.payType ? s.employee.payType : 'unknown';
      byPayType[key] = byPayType[key] || { count: 0, gross: 0, net: 0, gosiEmployee: 0, gosiEmployer: 0 };
      byPayType[key].count += 1;
      byPayType[key].gross += Number(s.grossPay);
      byPayType[key].net += Number(s.netPay);
      byPayType[key].gosiEmployee += Number(s.gosiEmployee);
      byPayType[key].gosiEmployer += Number(s.gosiEmployer);
    }
    const byDepartment = {};
    for (const s of slips) {
      const key = (s.employee && s.employee.department) || '—';
      byDepartment[key] = byDepartment[key] || { count: 0, gross: 0, net: 0 };
      byDepartment[key].count += 1;
      byDepartment[key].gross += Number(s.grossPay);
      byDepartment[key].net += Number(s.netPay);
    }
    res.json({
      period,
      monthLabel: monthLabel(period),
      totals: {
        count: slips.length,
        gross: sum('grossPay'),
        net: sum('netPay'),
        gosiEmployee: sum('gosiEmployee'),
        gosiEmployer: sum('gosiEmployer'),
        loanRepayments: sum('loanRepayment'),
        employerCost: sum('employerTotalCost'),
      },
      byPayType,
      byDepartment,
    });
  })
);

/** GET /api/payroll/status?period — which employees already have slips */
router.get(
  '/status',
  authRequired,
  HR,
  ah(async (req, res) => {
    const period = req.query.period || currentMonthStr();
    const employees = await Employee.findAll({ where: { status: { [Op.in]: ['active', 'on_leave'] } } });
    const slips = await Payslip.findAll({ where: { period } });
    const slipMap = {};
    for (const s of slips) slipMap[s.employeeId] = s.status;
    res.json({
      period,
      monthLabel: monthLabel(period),
      rows: employees.map((e) => ({
        employeeId: e.id,
        employeeCode: e.employeeCode,
        fullNameEn: e.fullNameEn,
        department: e.department,
        status: slipMap[e.id] || 'not_run',
      })),
    });
  })
);

module.exports = router;
