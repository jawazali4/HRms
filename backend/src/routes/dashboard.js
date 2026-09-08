'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const {
  Employee, Attendance, LeaveRequest, Loan, Payslip, Asset,
} = require('../models');
const { authRequired, ah, visibleEmployeeIds } = require('../middleware/auth');
const leaveSvc = require('../services/leaveService');
const { todayStr, currentMonthStr, previousMonthStr, formatClock } = require('../services/time');

/**
 * GET /api/dashboard — role-aware overview card data.
 * hr/admin → whole company · manager → team · employee → personal
 */
router.get(
  '/',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req); // null = all
    const inScope = (field) => (ids === null ? {} : { [field]: { [Op.in]: ids } });
    const today = todayStr();
    const ym = currentMonthStr();

    // ---------- personal section (everyone) ----------
    const mine = {};
    if (req.employee) {
      const [attToday, balances] = await Promise.all([
        Attendance.findOne({ where: { employeeId: req.employee.id, date: today } }),
        leaveSvc.leaveBalances(req.employee),
      ]);
      const latestSlip = await Payslip.findOne({
        where: { employeeId: req.employee.id },
        order: [['period', 'DESC']],
      });
      const myAssets = await Asset.count({ where: { assignedToId: req.employee.id, status: 'assigned' } });
      mine.attendanceToday = attToday
        ? { clockIn: formatClock(attToday.clockIn), clockOut: attToday.clockOut ? formatClock(attToday.clockOut) : null, status: attToday.clockOut ? 'out' : 'in' }
        : { status: 'none' };
      mine.balances = balances;
      mine.latestPayslip = latestSlip
        ? { id: latestSlip.id, period: latestSlip.period, netPay: Number(latestSlip.netPay), status: latestSlip.status, emailStatus: latestSlip.emailStatus }
        : null;
      mine.assetsCount = myAssets;
      mine.myRequestsPending = await LeaveRequest.count({ where: { employeeId: req.employee.id, status: 'pending' } });
    }

    const isHr = ['hr', 'admin'].includes(req.user.role);
    const isManager = req.user.role === 'manager';

    if (!isHr && !isManager) {
      return res.json({ role: req.user.role, scope: 'self', mine });
    }

    // ---------- hr / manager aggregate section ----------
    const empWhere = ids === null ? {} : { id: { [Op.in]: ids } };
    const [activeEmployees, presentToday, pendingLeave, pendingLoans, openAssets] = await Promise.all([
      Employee.count({ where: { ...empWhere, status: { [Op.in]: ['active', 'on_leave'] } } }),
      Attendance.count({ where: { ...inScope('employeeId'), date: today, clockIn: { [Op.ne]: null } } }),
      LeaveRequest.count({ where: { ...inScope('employeeId'), status: 'pending' } }),
      Loan.count({ where: { ...inScope('employeeId'), status: 'pending' } }),
      Asset.count({ where: { status: 'available' } }),
    ]);

    const period = previousMonthStr();
    const slipsWhere = { period, ...inScope('employeeId') };
    const slips = await Payslip.findAll({ where: slipsWhere });
    let closedTodayCount = 0;
    const closedRows = await Attendance.findAll({ where: { ...inScope('employeeId'), date: today } });
    closedTodayCount = closedRows.filter((r) => r.clockOut).length;

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
