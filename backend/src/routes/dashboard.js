'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const {
  Employee, Attendance, LeaveRequest, Loan, Payslip, Asset, Branch, Shift,
} = require('../models');
const { authRequired, ah, visibleEmployeeIds } = require('../middleware/auth');
const leaveSvc = require('../services/leaveService');
const { todayStr, currentMonthStr, previousMonthStr, formatClock } = require('../services/time');

/**
 * GET /api/dashboard — role-aware overview card data.
 * hr/admin → whole company · manager → team · employee → personal
 * Now resilient to missing tables (branches/shifts may not exist on old DB)
 */
router.get(
  '/',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req); // null = all
    const inScope = (field) => (ids === null ? {} : { [field]: { [Op.in]: ids } });
    const today = todayStr();

    // ---------- personal section (everyone) ----------
    const mine = {};
    if (req.employee) {
      try {
        const [attToday, balances] = await Promise.all([
          Attendance.findOne({ where: { employeeId: req.employee.id, date: today } }).catch(() => null),
          leaveSvc.leaveBalances(req.employee).catch(() => null),
        ]);
        const latestSlip = await Payslip.findOne({
          where: { employeeId: req.employee.id },
          order: [['period', 'DESC']],
        }).catch(() => null);
        const myAssets = await Asset.count({ where: { assignedToId: req.employee.id, status: 'assigned' } }).catch(() => 0);
        mine.attendanceToday = attToday
          ? { clockIn: formatClock(attToday.clockIn), clockOut: attToday.clockOut ? formatClock(attToday.clockOut) : null, status: attToday.clockOut ? 'out' : 'in' }
          : { status: 'none' };
        mine.balances = balances;
        mine.latestPayslip = latestSlip
          ? { id: latestSlip.id, period: latestSlip.period, netPay: Number(latestSlip.netPay), status: latestSlip.status, emailStatus: latestSlip.emailStatus }
          : null;
        mine.assetsCount = myAssets;
        mine.myRequestsPending = await LeaveRequest.count({ where: { employeeId: req.employee.id, status: 'pending' } }).catch(() => 0);
      } catch (e) {
        console.warn('[dashboard] personal section error:', e.message);
      }
    }

    const isHr = ['hr', 'admin'].includes(req.user.role);
    const isManager = req.user.role === 'manager';

    if (!isHr && !isManager) {
      return res.json({ role: req.user.role, scope: 'self', mine });
    }

    // ---------- hr / manager aggregate section ----------
    const empWhere = ids === null ? {} : { id: { [Op.in]: ids } };
    
    // Safe count that doesn't fail if table missing
    const safeCount = async (model, where) => {
      try {
        return await model.count({ where });
      } catch (e) {
        console.warn(`[dashboard] Count failed for ${model.name}:`, e.message);
        return 0;
      }
    };
    
    const [activeEmployees, presentToday, pendingLeave, pendingLoans, openAssets, branches, shifts] = await Promise.all([
      safeCount(Employee, { ...empWhere, status: { [Op.in]: ['active', 'on_leave'] } }),
      safeCount(Attendance, { ...inScope('employeeId'), date: today, clockIn: { [Op.ne]: null } }),
      safeCount(LeaveRequest, { ...inScope('employeeId'), status: 'pending' }),
      safeCount(Loan, { ...inScope('employeeId'), status: 'pending' }),
      safeCount(Asset, { status: 'available' }),
      safeCount(Branch, { isActive: true }),
      safeCount(Shift, { isActive: true }),
    ]);

    let period = previousMonthStr();
    let slips = [];
    try {
      const slipsWhere = { period, ...inScope('employeeId') };
      slips = await Payslip.findAll({ where: slipsWhere });
    } catch (e) {
      console.warn('[dashboard] payslip fetch failed:', e.message);
    }
    
    let closedTodayCount = 0;
    try {
      const closedRows = await Attendance.findAll({ where: { ...inScope('employeeId'), date: today } });
      closedTodayCount = closedRows.filter((r) => r.clockOut).length;
    } catch (e) {
      console.warn('[dashboard] closed count failed:', e.message);
    }

    res.json({
      role: req.user.role,
      scope: isHr ? 'all' : 'team',
      counts: {
        activeEmployees,
        presentToday,
        clockedOutToday: closedTodayCount,
        pendingLeave,
        pendingLoans,
        openAssets,
        branches,
        shifts,
      },
      payroll: {
        period,
        slipsCount: slips.length,
        netTotal: slips.reduce((s, x) => s + Number(x.netPay || 0), 0),
        employerCost: slips.reduce((s, x) => s + Number(x.employerTotalCost || 0), 0),
        gosiEmployer: slips.reduce((s, x) => s + Number(x.gosiEmployer || 0), 0),
      },
      mine,
    });
  })
);

module.exports = router;
