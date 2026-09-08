'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { LeaveRequest, Employee, User } = require('../models');
const {
  authRequired, ah, requireRole, visibleEmployeeIds, audit, badRequest, notFound, HR_ROLES,
} = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const leaveSvc = require('../services/leaveService');
const { todayStr, daysInclusive, addDays } = require('../services/time');
const saudi = require('../services/saudiConfig');

const HR = requireRole('hr', 'admin');
const TYPES = ['annual', 'sick', 'unpaid', 'maternity', 'hajj'];

function serialize(lv) {
  return {
    id: lv.id,
    employeeId: lv.employeeId,
    employee: lv.employee
      ? { id: lv.employee.id, employeeCode: lv.employee.employeeCode, fullNameEn: lv.employee.fullNameEn, department: lv.employee.department }
      : null,
    type: lv.type,
    startDate: lv.startDate,
    endDate: lv.endDate,
    days: Number(lv.days),
    reason: lv.reason,
    status: lv.status,
    approvedById: lv.approvedById,
    approvedAt: lv.approvedAt,
    reviewedNote: lv.reviewedNote,
    createdAt: lv.createdAt,
  };
}

/**
 * POST /api/leave/requests — submit a request.
 * Employees request for themselves; HR can use employeeId to request on
 * behalf of someone (e.g., by phone).
 */
router.post(
  '/requests',
  authRequired,
  validate({
    employeeId: { optional: true, number: true, min: 1 },
    type: { required: true, oneOf: TYPES },
    startDate: { required: true, date: true },
    endDate: { required: true, date: true },
    reason: { required: true, string: true, max: 500 },
  }),
  ah(async (req, res) => {
    const b = req.body;
    const isHr = HR_ROLES.includes(req.user.role);
    const targetId = isHr && b.employeeId ? Number(b.employeeId) : req.employee ? req.employee.id : null;
    if (!targetId) return badRequest(res, 'No employee to request leave for.');
    if (b.startDate > b.endDate) return badRequest(res, 'Start date must be on or before the end date.');
    if (b.startDate < todayStr()) return badRequest(res, 'Leave cannot start in the past.');

    const emp = await Employee.findByPk(targetId);
    if (!emp) return notFound(res, 'Employee not found.');

    const days = leaveSvc.intersectionDays(b.startDate, b.endDate, b.startDate, b.endDate); // calendar days
    if (days > 365) return badRequest(res, 'Leave cannot be longer than one year.');

    // overlapping active request check
    const overlap = await LeaveRequest.findOne({
      where: {
        employeeId: targetId,
        status: { [Op.in]: ['pending', 'approved'] },
        startDate: { [Op.lte]: b.endDate },
        endDate: { [Op.gte]: b.startDate },
      },
    });
    if (overlap) {
      return badRequest(res, `This overlaps an existing ${overlap.status} ${overlap.type} leave (${overlap.startDate} → ${overlap.endDate}).`);
    }

    // balance checks per Saudi Labour Law
    const balances = await leaveSvc.leaveBalances(emp);
    if (b.type === 'annual' && days > balances.annualAvailable) {
      return badRequest(res, `Not enough annual leave. Available: ${balances.annualAvailable} day(s) of ${balances.annualEntitlement} (accrued) — requested ${days}.`);
    }
    if (b.type === 'sick' && days > balances.sickAvailable) {
      return badRequest(res, `Not enough sick leave. Remaining: ${balances.sickAvailable} of 120 statutory days this leave year.`);
    }
    if (b.type === 'unpaid' && days > balances.unpaidAvailable) {
      return badRequest(res, `Maximum ${saudi.UNPAID_LEAVE_MAX_DAYS_PER_YEAR} unpaid leave days per year. Remaining: ${balances.unpaidAvailable}.`);
    }
    if (b.type === 'maternity' && days > saudi.MATERNITY_LEAVE_WEEKS * 7) {
      return badRequest(res, `Company maternity policy is ${saudi.MATERNITY_LEAVE_WEEKS} weeks (${saudi.MATERNITY_LEAVE_WEEKS * 7} days).`);
    }

    const record = await LeaveRequest.create({
      employeeId: targetId,
      type: b.type,
      startDate: b.startDate,
      endDate: b.endDate,
      days,
      reason: b.reason,
      status: isHr ? 'approved' : 'pending',
      approvedById: isHr ? req.user.id : null,
      approvedAt: isHr ? new Date() : null,
      reviewedNote: isHr ? 'Approved by HR' : null,
    });
    await audit({ req, action: 'create', entity: 'LeaveRequest', entityId: record.id, meta: { type: b.type, days } });
    res.status(201).json({ request: serialize(record), message: isHr ? 'Leave approved.' : 'Leave request submitted for approval.' });
  })
);

/** GET /api/leave/requests — list (scope: self / team / all) + filters */
router.get(
  '/requests',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const where = {};
    if (ids !== null) where.employeeId = { [Op.in]: ids };
    if (req.query.status) where.status = req.query.status;
    if (req.query.type) where.type = req.query.type;
    if (req.query.employeeId && ids === null) where.employeeId = Number(req.query.employeeId);
    if (req.query.from) where.startDate = { ...(where.startDate || {}), [Op.gte]: req.query.from };
    if (req.query.to) where.endDate = { ...(where.endDate || {}), [Op.lte]: req.query.to };

    const rows = await LeaveRequest.findAll({
      where,
      include: [
        { model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: Math.min(Number(req.query.limit) || 300, 2000),
    });
    res.json({ requests: rows.map(serialize) });
  })
);

/** GET /api/leave/balances — leave balances (self; HR can pass employeeId) */
router.get(
  '/balances',
  authRequired,
  ah(async (req, res) => {
    const isHr = HR_ROLES.includes(req.user.role);
    const empId = isHr && req.query.employeeId ? Number(req.query.employeeId) : req.employee ? req.employee.id : null;
    if (!empId) return badRequest(res, 'No employee context.');
    const emp = await Employee.findByPk(empId);
    if (!emp) return notFound(res, 'Employee not found.');
    const balances = await leaveSvc.leaveBalances(emp);
    res.json({ balances, employee: { id: emp.id, employeeCode: emp.employeeCode, fullNameEn: emp.fullNameEn } });
  })
);

/**
 * POST /api/leave/requests/:id/decision — approve or reject
 * manager → their team only · hr/admin → anyone
 */
router.post(
  '/requests/:id/decision',
  authRequired,
  validate({ ':id': { number: true, min: 1 }, decision: { required: true, oneOf: ['approved', 'rejected'] }, note: { string: true, max: 300 } }),
  ah(async (req, res) => {
    const lv = await LeaveRequest.findByPk(req.params.id, { include: [{ model: Employee, as: 'employee' }] });
    if (!lv) return notFound(res, 'Leave request not found.');
    if (lv.status !== 'pending') return badRequest(res, `This request was already ${lv.status}.`);

    const isHr = HR_ROLES.includes(req.user.role);
    if (!isHr && req.user.role === 'manager') {
      const myReports = (await visibleEmployeeIds(req)) || [];
      if (!myReports.includes(lv.employeeId)) {
        return res.status(403).json({ error: 'You can only decide on leave for your team members.', code: 'SCOPE' });
      }
    } else if (!isHr && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Only managers and HR can approve leave.', code: 'FORBIDDEN' });
    }

    await lv.update({
      status: req.body.decision,
      approvedById: req.body.decision === 'approved' ? req.user.id : null,
      approvedAt: req.body.decision === 'approved' ? new Date() : null,
      reviewedNote: req.body.note || (req.body.decision === 'approved' ? 'Approved' : 'Rejected'),
    });
    await audit({ req, action: req.body.decision, entity: 'LeaveRequest', entityId: lv.id, meta: { employeeId: lv.employeeId } });
    res.json({ request: serialize(lv), message: `Leave request ${req.body.decision}.` });
  })
);

/** DELETE /api/leave/requests/:id — cancel a pending request (owner or HR) */
router.delete(
  '/requests/:id',
  authRequired,
  validate({ ':id': { number: true, min: 1 } }),
  ah(async (req, res) => {
    const lv = await LeaveRequest.findByPk(req.params.id);
    if (!lv) return notFound(res, 'Leave request not found.');
    const isHr = HR_ROLES.includes(req.user.role);
    const isOwner = req.employee && req.employee.id === lv.employeeId;
    if (!isHr && !isOwner) {
      return res.status(403).json({ error: 'You can only cancel your own requests.', code: 'SCOPE' });
    }
    if (lv.status !== 'pending' && !isHr) {
      return badRequest(res, 'Only pending requests can be cancelled.');
    }
    await lv.destroy();
    await audit({ req, action: 'delete', entity: 'LeaveRequest', entityId: lv.id });
    res.json({ ok: true, message: 'Leave request cancelled.' });
  })
);

module.exports = router;
