/**
 * =====================================================================
 * PAYROLL ENGINE — Saudi Arabia
 * =====================================================================
 * Computes monthly pay slips for salaried, hourly and commission-based
 * employees, with:
 *
 *  • GOSI contributions (Saudi System A / System B schedules incl. the
 *    2026–2028 escalations, SANED, and the 2% occupational-hazards
 *    charge for expatriates) — on the contributory wage (basic +
 *    housing, capped at SAR 45,000).
 *  • Saudi Labour Law leave pay: paid annual leave, unpaid leave, and
 *    the Art. 117 sick-leave bands (30 days full pay → 60 days at 75%
 *    → 30 days unpaid) resolved against each employee's own leave year.
 *  • Attendance-based absence deduction, overtime at 150% (200% on
 *    rest days), unpaid-leave day deductions on a 30-day month basis.
 *  • Loan repayment deduction and full employer-cost reporting.
 *
 * Conventions (adjust in saudiConfig.js):
 *  - daily wage = monthly standard wage / 30
 *  - overtime counts any clocked time beyond 8 h on a working day at
 *    150%; all hours worked on a rest day at 200%
 *  - salaried employees are paid their full monthly wage; unpaid
 *    leave/sick days and unexcused absences are deducted day by day
 *  - hourly employees are paid strictly for clocked hours + paid leave
 *    days at 8 h/day
 * =====================================================================
 */
'use strict';

const { Op } = require('sequelize');
const {
  Payslip,
  Employee,
  Attendance,
  LeaveRequest,
  Loan,
  SalesCommission,
} = require('../models');
const saudi = require('./saudiConfig');
const {
  daysInMonth,
  listDays,
  todayStr,
  currentMonthStr,
  addDays,
  pad,
} = require('./time');
const leaveSvc = require('./leaveService');

const r2 = saudi.round2;

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

function workdaySet(emp) {
  // Date.UTC parse → Sunday = 0
  if (emp.workDays === 'mon_fri') return [1, 2, 3, 4, 5];
  return [0, 1, 2, 3, 4]; // sun_thur — Saudi work week
}

function isWorkday(emp, dayStr) {
  const dow = new Date(`${dayStr}T00:00:00Z`).getUTCDay();
  return workdaySet(emp).includes(dow);
}

function standardMonthlyWage(emp) {
  return (
    Number(emp.basicSalary) +
    Number(emp.housingAllowance) +
    Number(emp.transportAllowance) +
    Number(emp.otherAllowances)
  );
}

/** GOSI contributory wage = basic + housing (+ commissions if opted
 *  in), capped at SAR 45,000/month. */
function gosiWage(emp, commissionPay) {
  let wage = Number(emp.basicSalary) + Number(emp.housingAllowance);
  if (saudi.INCLUDE_COMMISSIONS_IN_GOSI_WAGE) wage += Number(commissionPay || 0);
  return Math.min(wage, saudi.GOSI_WAGE_CAP);
}

/**
 * Payroll period bounds:
 *  - past month: the whole month
 *  - current month: everything strictly before today (a month is only
 *    "worked through" once today is over; today's attendance is still
 *    open when payroll is previewed mid-month)
 */
function periodBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = `${y}-${pad(m)}-01`;
  const last = daysInMonth(y, m);
  const monthEnd = `${y}-${pad(m)}-${pad(last)}`;
  const isCurrent = ym === currentMonthStr();
  const assessEnd = isCurrent
    ? (todayStr() > start ? addDays(todayStr(), -1) : start)
    : monthEnd;
  return { start, monthEnd, assessEnd, isCurrent };
}

function countWorkdays(emp, from, to) {
  let n = 0;
  if (from > to) return 0;
  for (const d of listDays(from, to)) if (isWorkday(emp, d)) n += 1;
  return n;
}

/* ------------------------------------------------------------------ */
/* per-employee computation (pure — no DB writes)                      */
/* ------------------------------------------------------------------ */

async function computeEmployee(emp, period) {
  const { start, assessEnd } = periodBounds(period);
  const isCurrent = period === currentMonthStr();

  // ---------- attendance (clocked, completed or still open today) ----------
  const attRows = await Attendance.findAll({
    where: { employeeId: emp.id, date: { [Op.between]: [start, assessEnd] } },
    order: [['date', 'ASC']],
    raw: true,
  });
  const nowMs = Date.now();
  const hoursByDay = {};
  const presentDays = [];
  let totalHours = 0;
  for (const a of attRows) {
    if (!a.clockIn) continue;
    const endMs = a.clockOut ? new Date(a.clockOut).getTime() : nowMs;
    const h = Math.max(0, Math.min(16, (endMs - new Date(a.clockIn).getTime()) / 3600000));
    hoursByDay[a.date] = Math.max(hoursByDay[a.date] || 0, h);
    if (!presentDays.includes(a.date)) presentDays.push(a.date);
    totalHours += h;
  }

  // ---------- approved leave overlapping the assessed window ----------
  const leaves = await LeaveRequest.findAll({
    where: {
      employeeId: emp.id,
      status: 'approved',
      startDate: { [Op.lte]: assessEnd },
      endDate: { [Op.gte]: start },
    },
    raw: true,
  });
  const winAnchor = assessEnd; // leave year containing the period
  const win = leaveSvc.leaveWindow(winAnchor, emp.hireDate);
  const sickAll = await LeaveRequest.findAll({
    where: {
      employeeId: emp.id,
      type: 'sick',
      status: 'approved',
      startDate: { [Op.gte]: win.start, [Op.lte]: win.end },
    },
    order: [['startDate', 'ASC']],
    raw: true,
  });

  let paidLeaveDays = 0;   // days paid (full or tiered)
  let unpaidLeaveDays = 0; // days the employee is not paid for
  for (const lv of leaves) {
    const ov = leaveSvc.intersectionDays(start, assessEnd, lv.startDate, lv.endDate);
    if (ov <= 0) continue;
    let factor = 1;
    if (lv.type === 'unpaid') factor = 0;
    else if (lv.type === 'sick') {
      factor = leaveSvc.sickPayTiers(sickAll, lv.id).payFactor;
    }
    paidLeaveDays += ov * factor;
    unpaidLeaveDays += ov * (1 - factor);
  }

  // ---------- expected attendance & absence ----------
  const employedFrom = emp.hireDate > start ? emp.hireDate : start;
  const expectedHired = countWorkdays(emp, employedFrom, assessEnd);
  const expectedFull = countWorkdays(emp, start, assessEnd);
  const presentCount = presentDays.filter(
    (d) => d >= employedFrom && d <= assessEnd && isWorkday(emp, d)
  ).length;
  const leaveCredit = Math.min(paidLeaveDays + unpaidLeaveDays, Math.max(0, expectedHired));
  const absentDays = Math.max(0, expectedHired - presentCount - leaveCredit);

  const baseFactor =
    emp.hireDate > start && expectedFull > 0
      ? r2(expectedHired / expectedFull)
      : 1;

  // ---------- overtime (extra over the base 1×) ----------
  const hourlyEq =
    emp.payType === 'hourly'
      ? Number(emp.hourlyRate)
      : standardMonthlyWage(emp) / (saudi.STANDARD_DAYS_PER_MONTH * saudi.STANDARD_HOURS_PER_DAY);
  let stdOvertimeHrs = 0;
  let restDayHrs = 0;
  for (const d of presentDays) {
    if (d < start || d > assessEnd) continue;
    const h = hoursByDay[d] || 0;
    if (!isWorkday(emp, d)) restDayHrs += h;
    else stdOvertimeHrs += Math.max(0, h - saudi.STANDARD_HOURS_PER_DAY);
  }
  const overtimeExtra =
    stdOvertimeHrs * (saudi.OVERTIME_MULTIPLIER - 1) * hourlyEq +
    restDayHrs * (saudi.HOLIDAY_OVERTIME_MULTIPLIER - 1) * hourlyEq;

  // ---------- commissions ----------
  const sales = await SalesCommission.findAll({
    where: { employeeId: emp.id, period },
    raw: true,
  });
  let commissionPay = 0;
  for (const s of sales) {
    const rate =
      s.commissionRate !== null && s.commissionRate !== undefined && Number(s.commissionRate) > 0
        ? Number(s.commissionRate) / 100
        : Number(emp.commissionRate) / 100;
    commissionPay += Number(s.salesAmount) * rate;
  }

  // ---------- earnings ----------
  const grossMonthly = standardMonthlyWage(emp);
  const dailyWage = grossMonthly / saudi.STANDARD_DAYS_PER_MONTH;
  const hourlyRate = Number(emp.hourlyRate) || 0;
  const leaveDayPay = emp.payType === 'hourly' ? hourlyRate * saudi.STANDARD_HOURS_PER_DAY : dailyWage;

  let baseSalary;
  if (emp.payType === 'hourly') {
    baseSalary = r2(totalHours * hourlyRate + paidLeaveDays * leaveDayPay);
  } else {
    baseSalary = r2(grossMonthly * baseFactor);
  }
  const unpaidDeduction =
    emp.payType === 'hourly' ? 0 : r2(unpaidLeaveDays * dailyWage);
  const absenceDeduction =
    emp.payType === 'hourly' ? 0 : absentDays * dailyWage;
  const overtimePay = r2(overtimeExtra);
  const grossPay = r2(
    Math.max(0, baseSalary + overtimePay + commissionPay - unpaidDeduction - absenceDeduction)
  );

  // ---------- GOSI (per Saudi schedule & nationality) ----------
  const pensionEligible = emp.nationality === 'saudi' && emp.gosiScheme !== 'none';
  const schemeKey = emp.gosiScheme === 'systemA' ? 'systemA' : 'systemB';
  const gosibase = gosiWage(emp, commissionPay);
  const gosiEmployee = pensionEligible
    ? saudi.gosiEmployeeShare(gosibase, period, schemeKey)
    : 0;
  const gosiEmployer = saudi.gosiEmployerShare(gosibase, period, schemeKey, pensionEligible);

  // ---------- loan repayment (order: oldest first) ----------
  const loans = await Loan.findAll({
    where: { employeeId: emp.id, status: { [Op.in]: ['approved', 'active'] } },
    order: [['id', 'ASC']],
    raw: true,
  });
  const loanDeductions = [];
  for (const ln of loans) {
    if (!ln.startMonth || ln.startMonth > period) continue;
    const remaining = Number(ln.remainingAmount);
    if (remaining <= 0) continue;
    const take = Math.min(Number(ln.monthlyInstallment), remaining);
    loanDeductions.push({ loanId: ln.id, amount: r2(take) });
  }
  let loanRepayment = r2(loanDeductions.reduce((s, x) => s + x.amount, 0));

  // salary protection: total deductions may not exceed 50% of gross;
  // GOSI is statutory and stays, loan installments are reduced if needed
  const otherDeductions = r2(0);
  let totalDeductions = r2(gosiEmployee + loanRepayment + otherDeductions);
  const cap = r2(grossPay * 0.5);
  if (totalDeductions > cap && grossPay > 0) {
    let allowance = Math.max(0, cap - gosiEmployee);
    loanRepayment = 0;
    for (const ld of loanDeductions) {
      const take = Math.min(ld.amount, allowance);
      ld.amount = r2(take);
      loanRepayment = r2(loanRepayment + take);
      allowance = r2(allowance - take);
    }
    totalDeductions = r2(gosiEmployee + loanRepayment + otherDeductions);
  }
  const netPay = r2(Math.max(0, grossPay - totalDeductions));
  const employerTotalCost = r2(grossPay + gosiEmployer);
  const compliance = saudi.complianceNotes(period);

  const notes = [];
  if (emp.hireDate > start) {
    notes.push(`Hired mid-month (${emp.hireDate}) — salary prorated to ${Math.round(baseFactor * 100)}% (working days).`);
  }
  if (emp.payType === 'hourly') {
    notes.push('Hourly wage — paid for clocked hours plus paid leave days at 8 h/day.');
  }
  if (emp.payType === 'commission') {
    notes.push('Commission pay from recorded sales × agreed commission rate.');
  }
  if (emp.nationality !== 'saudi') {
    notes.push('Non-Saudi employee — no pension/SANED deduction; employer pays the 2% occupational-hazards contribution.');
  }
  if (absentDays > 0) {
    notes.push(`${absentDays} unexcused absence day(s) deducted at the daily wage.`);
  }
  if (unpaidLeaveDays > 0) {
    notes.push(`${r2(unpaidLeaveDays)} unpaid leave/sick day(s) deducted at the daily wage.`);
  }
  if (isCurrent) {
    notes.push('Mid-month preview: attendance assessed through yesterday; run again at month end for the final payslip.');
  }

  return {
    employeeId: emp.id,
    period,
    baseSalary,
    housingAllowance: emp.payType === 'hourly' ? 0 : Number(emp.housingAllowance),
    transportAllowance: emp.payType === 'hourly' ? 0 : Number(emp.transportAllowance),
    otherAllowances: emp.payType === 'hourly' ? 0 : Number(emp.otherAllowances),
    overtimePay,
    commissionPay: r2(commissionPay),
    grossPay,
    gosiEmployee,
    loanRepayment,
    otherDeductions,
    totalDeductions,
    netPay,
    gosiEmployer,
    employerTotalCost,
    workDaysAttended: presentCount,
    workDaysExpected: expectedHired,
    paidLeaveDays: r2(paidLeaveDays),
    unpaidLeaveDays: r2(unpaidLeaveDays),
    hoursWorked: r2(totalHours),
    status: 'draft',
    json: {
      employeeCode: emp.employeeCode,
      employeeName: emp.fullNameEn,
      payType: emp.payType,
      nationality: emp.nationality,
      gosiScheme: emp.gosiScheme,
      hireDate: emp.hireDate,
      workDays: emp.workDays,
      periodBounds: { start, assessEnd },
      attendance: {
        presentDays: presentCount,
        expectedWorkdays: expectedHired,
        absentDays,
        hoursWorked: r2(totalHours),
        stdOvertimeHrs: r2(stdOvertimeHrs),
        restDayHrs: r2(restDayHrs),
      },
      leave: { paidLeaveDays: r2(paidLeaveDays), unpaidLeaveDays: r2(unpaidLeaveDays) },
      gosi: {
        contributoryWage: r2(gosibase),
        employeeShare: gosiEmployee,
        employerShare: gosiEmployer,
        pensionEligible,
      },
      loanDeductions,
      commissions: sales.map((s) => ({
        description: s.description,
        salesAmount: Number(s.salesAmount),
        commission: r2(Number(s.salesAmount) * (Number(s.commissionRate) > 0 ? Number(s.commissionRate) / 100 : Number(emp.commissionRate) / 100)),
      })),
      compliance,
      notes,
    },
  };
}

/* ------------------------------------------------------------------ */
/* payroll run / finalize                                              */
/* ------------------------------------------------------------------ */

async function revertLoanEffects(prev) {
  const applied = (prev.json && prev.json.loanDeductions) || [];
  for (const a of applied) {
    if (!a.loanId) continue;
    const ln = await Loan.findByPk(a.loanId);
    if (ln) {
      ln.paidMonths = Math.max(0, (ln.paidMonths || 0) - 1);
      ln.remainingAmount = r2(Number(ln.remainingAmount) + Number(a.amount));
      if (ln.status === 'settled' && Number(ln.remainingAmount) > 0) ln.status = 'active';
      await ln.save();
    }
  }
}

async function applyLoanEffects(loanDeductions) {
  for (const a of loanDeductions) {
    if (!a.loanId || Number(a.amount) <= 0) continue;
    const ln = await Loan.findByPk(a.loanId);
    if (ln) {
      ln.paidMonths = (ln.paidMonths || 0) + 1;
      ln.remainingAmount = r2(Math.max(0, Number(ln.remainingAmount) - Number(a.amount)));
      if (Number(ln.remainingAmount) <= 0) ln.status = 'settled';
      await ln.save();
    }
  }
}

/**
 * Generate (or regenerate) draft payslips for a period.
 * Payslips already marked approved/paid are never overwritten.
 * Returns { generated, skippedLocked, errors, period }.
 */
async function generatePayslips(period, { employeeIds } = {}) {
  const empWhere = { status: { [Op.in]: ['active', 'on_leave'] } };
  if (employeeIds && employeeIds.length) empWhere.id = { [Op.in]: employeeIds };
  const employees = await Employee.findAll({ where: empWhere });

  const results = { generated: 0, skippedLocked: 0, errors: [], period };
  for (const emp of employees) {
    try {
      const prev = await Payslip.findOne({ where: { employeeId: emp.id, period } });
      if (prev && ['approved', 'paid'].includes(prev.status)) {
        results.skippedLocked += 1;
        continue;
      }
      if (prev) await revertLoanEffects(prev);
      const calc = await computeEmployee(emp, period);
      if (prev) await prev.update(calc);
      else await Payslip.create(calc);
      await applyLoanEffects(calc.json.loanDeductions);
      results.generated += 1;
    } catch (err) {
      results.errors.push({ employee: emp.employeeCode, message: err.message });
    }
  }
  return results;
}

/**
 * Mark draft payslips of a period as paid and email each employee
 * their payslip (skips gracefully when SMTP is not configured).
 */
async function finalizePayslips(period, { employeeIds } = {}) {
  const { sendMail, isConfigured, payslipEmailHtml } = require('./emailer');
  const config = require('../../config');
  const { monthLabel } = require('./time');

  const where = { period, status: 'draft' };
  if (employeeIds && employeeIds.length) where.employeeId = { [Op.in]: employeeIds };
  const slips = await Payslip.findAll({ where, include: [{ model: Employee, as: 'employee' }] });

  const out = {
    finalized: 0,
    emailed: 0,
    failed: [],
    emailDisabled: !isConfigured(),
    period,
  };
  for (const slip of slips) {
    slip.status = 'paid';
    await slip.save();
    out.finalized += 1;

    const emp = slip.employee;
    if (!emp || !emp.email) continue;
    const result = await sendMail({
      to: emp.email,
      subject: `Your salary pay slip — ${monthLabel(period)} | ${config.company.name}`,
      html: payslipEmailHtml({
        employee: emp,
        payslip: slip,
        company: config.company,
        monthName: monthLabel(period),
      }),
    });
    if (result.ok) {
      slip.emailStatus = 'sent';
      slip.emailedAt = new Date();
      await slip.save();
      out.emailed += 1;
    } else if (result.disabled) {
      slip.emailStatus = 'disabled';
      await slip.save();
    } else {
      slip.emailStatus = 'failed';
      await slip.save();
      out.failed.push({ employee: emp.employeeCode, error: result.error });
    }
  }
  return out;
}

module.exports = {
  generatePayslips,
  finalizePayslips,
  computeEmployee,
  gosiWage,
  standardMonthlyWage,
};
