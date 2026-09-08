'use strict';

const saudi = require('./saudiConfig');
const { LeaveRequest } = require('../models');
const { addDays, daysInclusive, monthLabel } = require('./time');

const DAY = 86400000;

function dayMs(dayStr) {
  return Date.parse(`${dayStr}T00:00:00Z`);
}

/** 12-month leave window containing `dayStr`, anchored to the hire
 *  anniversary. E.g. hired 2021-03-15 → windows 2021-03-15..,
 *  2022-03-15.., 2023-03-15.., etc. */
function leaveWindow(dayStr, hireDate) {
  const t = dayMs(dayStr);
  const h = dayMs(hireDate);
  const k = Math.floor((t - h) / (365.25 * DAY));
  const start = addDays(hireDate, Math.round(k * 365.25));
  const end = addDays(start, 365); // exclusive bound
  return { start, end: addDays(end, -1), label: `${start} .. ${end}` };
}

function intersectionDays(winStart, winEnd, aStart, aEnd) {
  const s = Math.max(dayMs(winStart), dayMs(aStart));
  const e = Math.min(dayMs(winEnd), dayMs(aEnd));
  if (e < s) return 0;
  return Math.round((e - s) / DAY) + 1;
}

/** Approved/pending leave days of one type inside a window. */
async function leaveDaysUsed(employeeId, window, type, statuses = ['approved', 'pending']) {
  const rows = await LeaveRequest.findAll({
    where: { employeeId, type, status: statuses },
    raw: true,
  });
  let total = 0;
  for (const r of rows) {
    total += intersectionDays(window.start, window.end, r.startDate, r.endDate);
  }
  return total;
}

/** Round 1 decimal (days can be half) */
function r1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Leave balances for an employee:
 *  - annual: statutory accrual based on continuous service (21d/yr then
 *    30d/yr after 5 years), prorated over the current leave year.
 *  - sick: statutory pool of 120 days per leave year (30 full-pay,
 *    60 at 75%, 30 unpaid).
 */
async function leaveBalances(employee, asOf = new Date()) {
  const hire = employee.hireDate;
  const now = asOf.toISOString().slice(0, 10);
  const win = leaveWindow(now, hire);

  const entitlement = saudi.annualLeaveEntitlement(hire);
  const windowDays = daysInclusive(win.start, win.end);
  const elapsed = daysInclusive(win.start, now < win.end ? now : win.end);
  const accrued = Math.min(entitlement, (entitlement * elapsed) / windowDays);

  const [annualUsed, annualPending] = await Promise.all([
    leaveDaysUsed(employee.id, win, 'annual', ['approved']),
    leaveDaysUsed(employee.id, win, 'annual', ['pending']),
  ]);
  const sickUsed = await leaveDaysUsed(employee.id, win, 'sick', ['approved']);
  const sickPending = await leaveDaysUsed(employee.id, win, 'sick', ['pending']);
  const unpaidUsed = await leaveDaysUsed(employee.id, win, 'unpaid', ['approved']);
  const unpaidPending = await leaveDaysUsed(employee.id, win, 'unpaid', ['pending']);
  const maternityUsed = await leaveDaysUsed(employee.id, win, 'maternity', ['approved']);

  return {
    leaveYear: win.label,
    hireDate: hire,
    annualEntitlement: entitlement,
    annualAccrued: r1(accrued),
    annualUsed: annualUsed,
    annualPending: annualPending,
    annualAvailable: r1(Math.max(0, accrued - annualUsed - annualPending)),
    sickUsed,
    sickPending,
    sickAvailable: Math.max(0, saudi.SICK_LEAVE_TOTAL_DAYS - sickUsed - sickPending),
    unpaidUsed,
    unpaidPending,
    unpaidAvailable: Math.max(0, saudi.UNPAID_LEAVE_MAX_DAYS_PER_YEAR - unpaidUsed - unpaidPending),
    maternityUsed,
    monthLabel: monthLabel(now.slice(0, 7)),
  };
}

/**
 * Break a sick leave request into pay tiers per Saudi Labour Law Art. 117
 * given all approved sick leaves in the same window (chronological),
 * cumulating against the 30/60/30 day bands.
 * Returns { full, threeQuarter, unpaid } day counts and a payFactor
 * (fraction of the daily wage the employee receives).
 */
function sickPayTiers(allSick, targetId) {
  const sorted = [...allSick]
    .filter((s) => s.status === 'approved' || s.id === targetId)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  let cursor = 0; // cumulative sick days consumed before each leave
  for (const s of sorted) {
    const days = s.days;
    const isTarget = s.id === targetId;
    const fullCap = saudi.SICK_LEAVE_FULL_PAY_DAYS;
    const tqCap = fullCap + saudi.SICK_LEAVE_THREE_QUARTER_PAY_DAYS;
    const full = Math.max(0, Math.min(days, fullCap - cursor));
    const tq = Math.max(0, Math.min(days - full, tqCap - cursor - full));
    const unpaid = Math.max(0, days - full - tq);
    cursor += days;
    if (isTarget) {
      const payFactor = days > 0 ? (full + tq * saudi.SICK_LEAVE_THREE_QUARTER_RATE) / days : 1;
      return { full: r1(full), threeQuarter: r1(tq), unpaid: r1(unpaid), payFactor };
    }
  }
  return { full: 0, threeQuarter: 0, unpaid: 0, payFactor: 1 };
}

module.exports = { leaveWindow, intersectionDays, leaveDaysUsed, leaveBalances, sickPayTiers, r1 };
