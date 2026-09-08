/**
 * =====================================================================
 * SAUDI ARABIA — GOSI & LABOUR LAW COMPLIANCE SETTINGS
 * =====================================================================
 * Everything the payroll engine needs to stay compliant lives here in
 * one place, with the legal source for each number. To change company
 * policy, edit the numbers below — no other code needs to change.
 *
 * Primary sources (checked 2026):
 *  - GOSI (gosi.gov.sa) contribution schedules for Saudi nationals,
 *    the new "System B" escalations for members enrolled from 3 Jul
 *    2024, SANED unemployment insurance, and the 2% occupational
 *    hazards contribution for expatriates.
 *  - Saudi Labour Law (Royal Decree M/51): Articles 84-85 (end of
 *    service), 109 (annual leave), 117 (sick leave), maternity leave,
 *    overtime rules, and the SAR 45,000 monthly subscription cap.
 * =====================================================================
 */

const { monthLabel } = require('./time');

module.exports = {
  /** GOSI monthly subscription (contributory) wage cap: SAR 45,000 */
  GOSI_WAGE_CAP: 45000,

  /** Occupational hazards — paid by the EMPLOYER only, for every
   *  employee (Saudi and expatriate). */
  GOSI_EMPLOYER_OCCUPATIONAL_HAZARDS: 0.02,

  /** SANED unemployment insurance: 0.75% each side (included below). */
  SANED_EMPLOYEE: 0.0075,
  SANED_EMPLOYER: 0.0075,

  /**
   * Pension + SANED rates for SAUDI employees by enrollment scheme.
   *
   * "systemA" = enrolled with GOSI before 3 July 2024 → fixed rates.
   * "systemB" = enrolled on/after 3 July 2024 → pension escalates by
   *             0.5% per side every July until July 2028, then fixed.
   *
   * Rates below are the TOTAL employee share (pension + SANED) and the
   * TOTAL employer share (pension + SANED + 2% occupational hazards),
   * exactly as published by GOSI for each period.
   */
  RATE_SCHEDULES: {
    systemA: [
      // fixed forever
      { from: '0000-01', employee: 0.0975, employer: 0.1175 },
    ],
    systemB: [
      { from: '2024-07', employee: 0.0975, employer: 0.1175 },
      { from: '2025-07', employee: 0.1025, employer: 0.1225 },
      { from: '2026-07', employee: 0.1075, employer: 0.1275 }, // current
      { from: '2027-07', employee: 0.1125, employer: 0.1325 },
      { from: '2028-07', employee: 0.1175, employer: 0.1375 }, // final
    ],
  },

  /**
   * Should VARIABLE pay (sales commissions) be included in the GOSI
   * subscription wage? Official guidance counts the regular monthly
   * wage (basic + housing + fixed allowances). Many companies include
   * commissions too. Default here follows the conservative reading
   * (fixed wage only); flip to true to include commissions.
   */
  INCLUDE_COMMISSIONS_IN_GOSI_WAGE: false,

  /**
   * Saudi Labour Law — working time.
   * Standard week: 48h (Sun–Thu office days in the sample company).
   * Overtime premium: 150% of the wage (Labour Law Art. 107 & 133).
   * (A 100% premium applies to overtime on official holidays/weekends.)
   */
  STANDARD_HOURS_PER_DAY: 8,
  STANDARD_DAYS_PER_WEEK: 5,
  STANDARD_DAYS_PER_MONTH: 30, // used for daily-wage proration
  OVERTIME_MULTIPLIER: 1.5,
  HOLIDAY_OVERTIME_MULTIPLIER: 2.0,

  /**
   * Annual leave (Art. 109): 21 paid calendar days/year for the first
   * five years of continuous service; 30 days/year afterwards.
   * Days are counted as calendar days (assumption, adjustable below).
   */
  ANNUAL_LEAVE_DAYS_FIRST_5_YEARS: 21,
  ANNUAL_LEAVE_DAYS_AFTER_5_YEARS: 30,

  /**
   * Sick leave (Art. 117): up to 120 calendar days per year —
   * first 30 days full pay, next 60 days at 75%, last 30 unpaid.
   */
  SICK_LEAVE_FULL_PAY_DAYS: 30,
  SICK_LEAVE_THREE_QUARTER_PAY_DAYS: 60,
  SICK_LEAVE_THREE_QUARTER_RATE: 0.75,
  SICK_LEAVE_UNPAID_DAYS: 30,
  SICK_LEAVE_TOTAL_DAYS: 120,

  /**
   * Unpaid leave: an employee may take up to 10 additional unpaid
   * leave days per year with employer approval (common practice under
   * Art. 109; confirm with your labour office).
   */
  UNPAID_LEAVE_MAX_DAYS_PER_YEAR: 10,

  /** Maternity leave: 10 weeks paid (Labour Law Art. 151 — many
   *  companies voluntarily grant more; adjust below). */
  MATERNITY_LEAVE_WEEKS: 10,

  /**
   * End-of-service benefits (Art. 84-85): half a month's wage for each
   * of the first five years and one month's wage for each following
   * year, pro-rated for partial years, based on the last wage.
   */
  EOSB_PER_MONTH_FIRST_5_YEARS: 0.5 / 12,
  EOSB_PER_MONTH_AFTER_5_YEARS: 1 / 12,
  EOSB_SERVICE_YEARS_FOR_HALF_RATE: 5,

  /** Wage Protection System: salaries are due by the 10th of the next
   *  month (shown on reports). */
  WPS_PAYMENT_DAY: 10,
};

/**
 * Monthly payroll reference period 'YYYY-MM' for a given run, used to
 * pick the correct GOSI schedule.
 */
function gosiRates(periodYM, scheme = 'systemB') {
  const schedule = module.exports.RATE_SCHEDULES[scheme] || module.exports.RATE_SCHEDULES.systemB;
  let chosen = schedule[0];
  for (const row of schedule) {
    if (periodYM >= row.from) chosen = row;
    else break;
  }
  return { employeeRate: chosen.employee, employerRate: chosen.employer };
}

/** GOSI employee contribution for a contributory wage in a period. */
function gosiEmployeeShare(wage, periodYM, scheme) {
  if (!wage || wage <= 0) return 0;
  const { employeeRate } = gosiRates(periodYM, scheme);
  const base = Math.min(wage, module.exports.GOSI_WAGE_CAP);
  return round2(base * employeeRate);
}

/** GOSI employer contribution (incl. 2% occupational hazards). */
function gosiEmployerShare(wage, periodYM, scheme, isSaudiEligible) {
  if (!wage || wage <= 0) return 0;
  const base = Math.min(wage, module.exports.GOSI_WAGE_CAP);
  if (isSaudiEligible) {
    const { employerRate } = gosiRates(periodYM, scheme);
    return round2(base * employerRate);
  }
  // Expatriates: employer pays only the 2% occupational hazards branch.
  return round2(base * module.exports.GOSI_EMPLOYER_OCCUPATIONAL_HAZARDS);
}

/** Continuous service (years, incl. fractions) between hireDate and a date */
function yearsOfService(hireDate, asOf = new Date()) {
  const start = new Date(`${hireDate}T00:00:00Z`);
  const end = asOf instanceof Date ? asOf : new Date(asOf);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return ms / (365.25 * 24 * 3600 * 1000);
}

/** Statutory annual leave entitlement (days) given the hire date. */
function annualLeaveEntitlement(hireDate) {
  const years = yearsOfService(hireDate);
  return years < 5
    ? module.exports.ANNUAL_LEAVE_DAYS_FIRST_5_YEARS
    : module.exports.ANNUAL_LEAVE_DAYS_AFTER_5_YEARS;
}

/** End-of-service benefit estimate using the standard wage (incl. fixed
 *  allowances). Returns { months, years, total }. */
function endOfServiceBenefit(hireDate, monthlyWage, asOf = new Date()) {
  const start = new Date(`${hireDate}T00:00:00Z`);
  const end = asOf instanceof Date ? asOf : new Date(asOf);
  const totalMonths = Math.max(
    0,
    (end.getTime() - start.getTime()) / (30.4375 * 24 * 3600 * 1000)
  );
  const firstFiveMonths = Math.min(totalMonths, 60);
  const afterMonths = Math.max(0, totalMonths - 60);
  const wageMonths =
    firstFiveMonths * module.exports.EOSB_PER_MONTH_FIRST_5_YEARS +
    afterMonths * module.exports.EOSB_PER_MONTH_AFTER_5_YEARS;
  return {
    serviceYears: round2(totalMonths / 12),
    wageMonths: round2(wageMonths),
    total: round2(wageMonths * (monthlyWage || 0)),
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Human-readable note used on pay slips / reports. */
function complianceNotes(periodYM) {
  const { employeeRate, employerRate } = gosiRates(periodYM, 'systemB');
  const [y, m] = periodYM.split('-').map(Number);
  const rates = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return {
    period: monthLabel(periodYM),
    contributionsAsOf: rates,
    employeeRatePct: round2(employeeRate * 100),
    employerRatePct: round2(employerRate * 100),
    note: `GOSI rates shown are those in force for ${rates}. Salary must be paid by the 10th of the following month (Wage Protection System).`,
  };
}

module.exports.gosiRates = gosiRates;
module.exports.gosiEmployeeShare = gosiEmployeeShare;
module.exports.gosiEmployerShare = gosiEmployerShare;
module.exports.annualLeaveEntitlement = annualLeaveEntitlement;
module.exports.yearsOfService = yearsOfService;
module.exports.endOfServiceBenefit = endOfServiceBenefit;
module.exports.complianceNotes = complianceNotes;
module.exports.round2 = round2;
