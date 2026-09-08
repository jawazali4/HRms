'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// Pure engine math does not need a database.
const saudi = require('../src/services/saudiConfig');
const leaveSvc = require('../src/services/leaveService');

test('GOSI 2026 rates: Saudi System B (10.75% employee, 12.75% employer incl. 2% hazards)', () => {
  const r = saudi.gosiRates('2026-08', 'systemB');
  assert.strictEqual(r.employeeRate, 0.1075);
  assert.strictEqual(r.employerRate, 0.1275);
});

test('GOSI 2026 rates: Saudi System A stays 9.75% / 11.75%', () => {
  const r = saudi.gosiRates('2026-08', 'systemA');
  assert.strictEqual(r.employeeRate, 0.0975);
  assert.strictEqual(r.employerRate, 0.1175);
});

test('GOSI employee share respects the SAR 45,000 wage cap', () => {
  const onCap = saudi.gosiEmployeeShare(90000, '2026-08', 'systemB');
  assert.strictEqual(onCap, Math.round(45000 * 0.1075 * 100) / 100);
});

test('Expat employee: employer pays 2% occupational hazards only', () => {
  const employer = saudi.gosiEmployerShare(10000, '2026-08', 'systemB', false);
  assert.strictEqual(employer, 200);
  // employee share only exists for Saudi/GCC pension participants — the
  // payroll engine passes pensionEligible=false for expats, so nothing
  // is deducted from an expat salary.
});

test('Saudi employer share includes pension + SANED + 2% hazards', () => {
  const employer = saudi.gosiEmployerShare(20000, '2026-08', 'systemB', true);
  assert.strictEqual(employer, Math.round(20000 * 0.1275 * 100) / 100);
});

test('Annual leave entitlement: 21 days under 5 years, 30 days at/after 5', () => {
  assert.strictEqual(saudi.annualLeaveEntitlement('2024-01-01'), 21);
  assert.strictEqual(saudi.annualLeaveEntitlement('2021-01-01'), 30);
});

test('Sick leave pay tiers follow Art. 117 bands (30 full / 60 @75% / 30 unpaid)', () => {
  const leaves = [
    { id: 1, startDate: '2026-03-01', endDate: '2026-03-29', days: 29, status: 'approved' },
    { id: 2, startDate: '2026-06-10', endDate: '2026-06-30', days: 21, status: 'approved' },
  ];
  // second leave starts with 1 day left in the full-pay band
  const t = leaveSvc.sickPayTiers(leaves, 2);
  assert.strictEqual(t.full, 1);
  assert.strictEqual(t.threeQuarter, 20);
  assert.strictEqual(t.unpaid, 0);
  assert.ok(Math.abs(t.payFactor - (1 + 20 * 0.75) / 21) < 0.001);
});

test('EOSB: half month per year for first 5 years, one month after', () => {
  // hire 2020-06-01 → as of 2026-09-01 ≈ 6.25 years
  // expected wage months ≈ 5 × 0.5 + 1.25 × 1 = 3.75
  const est = saudi.endOfServiceBenefit('2020-06-01', 12000, new Date('2026-09-01T00:00:00Z'));
  assert.ok(est.wageMonths > 3.6 && est.wageMonths < 3.9, `wage months ${est.wageMonths}`);
  assert.ok(Math.abs(est.total - 45000) < 3000, `total ${est.total}`);
});

test('Leave windows are anchored to the hire anniversary', () => {
  const win = leaveSvc.leaveWindow('2026-08-15', '2021-03-15');
  assert.strictEqual(win.start, '2026-03-15');
  assert.strictEqual(win.end, '2027-03-14');
});
