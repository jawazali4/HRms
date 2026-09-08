'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Loan, Employee } = require('../models');
const {
  authRequired, ah, visibleEmployeeIds, audit, badRequest, notFound, HR_ROLES,
} = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { currentMonthStr, monthLabel, addDays } = require('../services/time');

const STATUSES = ['pending', 'approved', 'rejected', 'active', 'settled', 'cancelled'];

function serialize(ln) {
  return {
    id: ln.id,
    employeeId: ln.employeeId,
    employee: ln.employee
      ? { id: ln.employee.id, employeeCode: ln.employee.employeeCode, fullNameEn: ln.employee.fullNameEn, department: ln.employee.department }
      : null,
    amount: Number(ln.amount),
    monthlyInstallment: Number(ln.monthlyInstallment),
    months: ln.months,
    interestRate: Number(ln.interestRate),
    reason: ln.reason,
    status: ln.status,
    requestedAt: ln.requestedAt,
    approvedAt: ln.approvedAt,
    startMonth: ln.startMonth,
    remainingAmount: Number(ln.remainingAmount || ln.amount),
    paidMonths: ln.paidMonths || 0,
    totalToRepay: Number(ln.monthlyInstallment) * (ln.months || 0),
  };
}

/** POST /api/loans/requests — apply for a company loan (self service; HR can file on behalf) */
router.post(
  '/requests',
  authRequired,
  validate({
    employeeId: { optional: true, number: true, min: 1 },
    amount: { required: true, number: true, min: 1, max: 5000000 },
    months: { required: true, number: true, min: 1, max: 60 },
    interestRate: { optional: true, number: true, min: 0, max: 100 },
    reason: { required: true, string: true, max: 500 },
  }),
  ah(async (req, res) => {
    const b = req.body;
    const isHr = HR_ROLES.includes(req.user.role);
    const targetId = isHr && b.employeeId ? Number(b.employeeId) : req.employee ? req.employee.id : null;
    if (!targetId) return badRequest(res, 'No employee context.');
    const emp = await Employee.findByPk(targetId);
    if (!emp) return notFound(res, 'Employee not found.');

    const interest = Number(b.interestRate || 0);
    if (interest > 0) {
      // kept informational — interest-bearing employee loans are uncommon
      // under Islamic HR practice; rate stored but repayments stay flat
    }
    const amount = Number(b.amount);
    const months = Number(b.months);
    const installment = Math.ceil((amount * (1 + interest / 100)) / months);

    // affordability: installment should not exceed ~33% of monthly wage
    const wage = Number(emp.basicSalary) + Number(emp.housingAllowance) + Number(emp.transportAllowance) + Number(emp.otherAllowances);
    if (wage > 0 && installment > wage * 0.33) {
      return badRequest(res, `Installment of SAR ${installment.toLocaleString('en')} exceeds 33% of monthly wage (SAR ${wage.toLocaleString('en')}). Reduce the amount or extend the months.`);
    }

    const record = await Loan.create({
      employeeId: targetId,
      amount,
      monthlyInstallment: installment,
      months,
      interestRate: interest,
      reason: b.reason,
      status: 'pending',
      remainingAmount: amount,
      paidMonths: 0,
      requestedAt: new Date(),
    });
    await audit({ req, action: 'create', entity: 'Loan', entityId: record.id, meta: { employeeId: targetId, amount } });
    res.status(201).json({ loan: serialize(record), message: 'Loan application submitted for approval.' });
  })
);

/** GET /api/loans — list (self / team / all), filters by status */
router.get(
  '/',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const where = {};
    if (ids !== null) where.employeeId = { [Op.in]: ids };
    if (req.query.status) where.status = req.query.status;
    if (req.query.employeeId && ids === null) where.employeeId = Number(req.query.employeeId);

    const rows = await Loan.findAll({
      where,
      include: [{ model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] }],
      order: [['requestedAt', 'DESC']],
      limit: Math.min(Number(req.query.limit) || 300, 2000),
    });
    res.json({ loans: rows.map(serialize) });
  })
);

/**
 * POST /api/loans/:id/decision — approve/reject
 * (manager for team only; HR/admin for anyone). Approval sets the first
 * repayment month to the next payroll period.
 */
router.post(
  '/:id/decision',
  authRequired,
  validate({ ':id': { number: true, min: 1 }, decision: { required: true, oneOf: ['approved', 'rejected'] }, note: { string: true, max: 300 } }),
  ah(async (req, res) => {
    const ln = await Loan.findByPk(req.params.id, { include: [{ model: Employee, as: 'employee' }] });
    if (!ln) return notFound(res, 'Loan not found.');
    if (!['pending', 'approved'].includes(ln.status)) {
      return badRequest(res, `Only pending loans can be decided. Current status: ${ln.status}.`);
    }
    const isHr = HR_ROLES.includes(req.user.role);
    if (!isHr && req.user.role === 'manager') {
      const reports = (await visibleEmployeeIds(req)) || [];
      if (!reports.includes(ln.employeeId)) {
        return res.status(403).json({ error: 'You can only decide on loans for your team members.', code: 'SCOPE' });
      }
    } else if (!isHr && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Only managers and HR can decide on loans.', code: 'FORBIDDEN' });
    }
    if (req.body.decision === 'approved') {
      // start deducting from the *next* payroll month
      const ym = currentMonthStr();
      const next = addDays(`${ym}-01`, 32).slice(0, 7);
      await ln.update({
        status: 'approved',
        approvedAt: new Date(),
        startMonth: next,
      });
    } else {
      await ln.update({ status: 'rejected', approvedAt: new Date() });
    }
    await audit({ req, action: req.body.decision, entity: 'Loan', entityId: ln.id, meta: { employeeId: ln.employeeId } });
    res.json({ loan: serialize(ln), message: `Loan ${req.body.decision}. Repayments will start ${ln.startMonth ? monthLabel(ln.startMonth) : '—'}.` });
  })
);

/** POST /api/loans/:id/cancel — HR can cancel before repayments start */
router.post(
  '/:id/cancel',
  authRequired,
  validate({ ':id': { number: true, min: 1 } }),
  ah(async (req, res) => {
    const isHr = HR_ROLES.includes(req.user.role);
    if (!isHr) return res.status(403).json({ error: 'Only HR can cancel loans.', code: 'FORBIDDEN' });
    const ln = await Loan.findByPk(req.params.id);
    if (!ln) return notFound(res, 'Loan not found.');
    if (ln.paidMonths > 0) return badRequest(res, 'Repayments already started — record an early settlement instead.');
    await ln.update({ status: 'cancelled' });
    await audit({ req, action: 'update', entity: 'Loan', entityId: ln.id, meta: { what: 'cancelled' } });
    res.json({ ok: true, message: 'Loan cancelled.' });
  })
);

module.exports = router;
