'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const config = require('../../config');
const { Attendance, Employee } = require('../models');
const {
  authRequired, authOptional, ah, requireRole, visibleEmployeeIds, audit, badRequest, notFound, HR_ROLES,
} = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { verifyPin } = require('../services/passwords');
const { todayStr, riyadhTimeMs, formatClock, dayOf } = require('../services/time');

const HR = requireRole('hr', 'admin');

/* ------------------------------------------------------------------ */
/* Kiosk rate limiting (in-memory)                                     */
/* ------------------------------------------------------------------ */
const attempts = new Map(); // employeeCode → {count, lockedUntil}

function rateCheck(employeeCode) {
  const rec = attempts.get(employeeCode);
  if (rec && rec.lockedUntil && rec.lockedUntil > Date.now()) {
    const mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
    return { locked: true, mins };
  }
  if (rec && rec.lockedUntil && rec.lockedUntil <= Date.now()) attempts.delete(employeeCode);
  return { locked: false };
}
function registerFailure(employeeCode) {
  const rec = attempts.get(employeeCode) || { count: 0, lockedUntil: null };
  rec.count += 1;
  if (rec.count >= config.kiosk.maxAttempts) {
    rec.lockedUntil = Date.now() + config.kiosk.lockMinutes * 60000;
    rec.count = 0;
  }
  attempts.set(employeeCode, rec);
}
function registerSuccess(employeeCode) {
  attempts.delete(employeeCode);
}

/** GET /api/attendance/kiosk-employees — public directory used by the
 *  physical kiosk screen to select who is clocking in/out. */
router.get(
  '/kiosk-employees',
  ah(async (_req, res) => {
    const emps = await Employee.findAll({
      where: { status: { [Op.in]: ['active', 'on_leave'] } },
      attributes: ['employeeCode', 'fullNameEn', 'department'],
      order: [['employeeCode', 'ASC']],
      raw: true,
    });
    res.json({ employees: emps });
  })
);

/* ------------------------------------------------------------------ */
/* Clock in / out — works from:                                        */
/*   1. web/mobile  →  Authorization: Bearer <JWT>                     */
/*   2. kiosk       →  { employeeCode, pin }  (kiosk PIN from employee record) */
/*   3. HR/manual   →  auth token (self clock in/out too)              */
/* ------------------------------------------------------------------ */
router.post(
  '/clock',
  authOptional,
  ah(async (req, res) => {
    const { action, employeeCode, pin, source, note, lat, lng } = req.body || {};

    let employee = req.employee || null;
    let effectiveSource = 'web';
    const wantsKiosk = Boolean(employeeCode) && Boolean(pin);

    if (wantsKiosk) {
      // Physical kiosk machine / tablet at the office door
      effectiveSource = source || 'kiosk';
      const rl = rateCheck(String(employeeCode).toUpperCase());
      if (rl.locked) {
        return res.status(429).json({
          error: `Too many failed attempts for ${employeeCode}. Try again in ${rl.mins} minute(s).`,
          code: 'RATE_LIMITED',
        });
      }
      const found = await Employee.findOne({
        where: { employeeCode: String(employeeCode).toUpperCase(), status: { [Op.in]: ['active', 'on_leave'] } },
      });
      if (!found || !found.pinHash || !verifyPin(String(pin).trim(), found.pinHash)) {
        registerFailure(String(employeeCode).toUpperCase());
        await audit({ req: { user: null, kioskActor: `kiosk:${employeeCode}` }, action: 'clock_in', meta: { ok: false } });
        return res.status(401).json({ error: 'Employee code or PIN is not correct.', code: 'BAD_PIN' });
      }
      registerSuccess(String(employeeCode).toUpperCase());
      employee = found;
      req.kioskActor = `kiosk:${found.employeeCode}`;
    } else {
      if (!req.employee) {
        return res.status(401).json({
          error: 'Please sign in, or use your employee code + PIN (kiosk).',
          code: 'SIGN_IN_OR_KIOSK',
        });
      }
      if (source && ['kiosk', 'mobile', 'web'].includes(source)) effectiveSource = source;
      if (source === 'kiosk') effectiveSource = 'kiosk';
    }

    if (!['in', 'out'].includes(action)) {
      return badRequest(res, 'action must be "in" or "out".');
    }

    const today = todayStr();
    let record = await Attendance.findOne({ where: { employeeId: employee.id, date: today } });

    if (action === 'in') {
      if (record && record.clockIn && !record.clockOut) {
        return res.status(409).json({
          error: `${employee.employeeCode} already clocked in today at ${formatClock(record.clockIn)}.`,
          code: 'ALREADY_IN',
          record,
        });
      }
      if (record && record.clockIn && record.clockOut) {
        return res.status(409).json({
          error: `Today's shift is already complete (clocked out at ${formatClock(record.clockOut)}).`,
          code: 'ALREADY_OUT',
          record,
        });
      }
      const clockIn = new Date();
      record = await Attendance.create({
        employeeId: employee.id,
        date: today,
        clockIn,
        source: effectiveSource,
        note: note || `Clocked in from ${wantsKiosk ? 'kiosk device' : effectiveSource}${lat && lng ? ` (GPS ${lat},${lng})` : ''}`,
      });
      await audit({ req, action: 'clock_in', entity: 'Attendance', entityId: record.id, meta: { employee: employee.employeeCode, source: effectiveSource } });
      return res.status(201).json({
        ok: true,
        message: `${employee.fullNameEn} clocked IN at ${formatClock(record.clockIn)} (${effectiveSource}).`,
        record: { id: record.id, date: today, clockIn: record.clockIn, clockOut: record.clockOut, source: effectiveSource },
      });
    }

    // action === 'out'
    if (!record || !record.clockIn) {
      return res.status(409).json({
        error: `${employee.employeeCode} has no clock-in for today. Please clock in first.`,
        code: 'NOT_IN',
      });
    }
    if (record.clockOut) {
      return res.status(409).json({
        error: `Already clocked out today at ${formatClock(record.clockOut)}.`,
        code: 'ALREADY_OUT',
      });
    }
      const clockOut = new Date();
      await record.update({ clockOut, source: effectiveSource || record.source, note: record.note });
    await audit({ req, action: 'clock_out', entity: 'Attendance', entityId: record.id, meta: { employee: employee.employeeCode, source: effectiveSource } });
    return res.json({
      ok: true,
      message: `${employee.fullNameEn} clocked OUT at ${formatClock(clockOut)}. Have a good day!`,
      record,
    });
  })
);

/** GET /api/attendance/status — today's own record (dashboard / kiosk screen) */
router.get(
  '/status',
  authRequired,
  ah(async (req, res) => {
    if (!req.employee) return badRequest(res, 'No employee context.');
    const record = await Attendance.findOne({ where: { employeeId: req.employee.id, date: todayStr() } });
    res.json({ today: todayStr(), record });
  })
);

/**
 * GET /api/attendance — list of attendance records.
 * employee → own · manager → team · hr/admin → all
 * Params: from (YYYY-MM-DD), to, employeeId (hr only or team), source
 */
router.get(
  '/',
  authRequired,
  ah(async (req, res) => {
    const ids = await visibleEmployeeIds(req);
    const where = {};
    if (ids !== null) where.employeeId = { [Op.in]: ids };
    if (req.query.from) where.date = { ...(where.date || {}), [Op.gte]: req.query.from };
    if (req.query.to) where.date = { ...(where.date || {}), [Op.lte]: req.query.to };
    if (req.query.source) where.source = req.query.source;
    if (req.query.employeeId && ids === null) where.employeeId = Number(req.query.employeeId);

    const rows = await Attendance.findAll({
      where,
      include: [{ model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] }],
      order: [['date', 'DESC'], ['id', 'DESC']],
      limit: Math.min(Number(req.query.limit) || 200, 1000),
    });
    res.json({
      attendance: rows.map((r) => ({
        id: r.id,
        date: r.date,
        employee: r.employee,
        clockIn: r.clockIn,
        clockOut: r.clockOut,
        clockInTime: formatClock(r.clockIn),
        clockOutTime: r.clockOut ? formatClock(r.clockOut) : null,
        hours: r.clockIn ? Number((((r.clockOut ? new Date(r.clockOut) : new Date()).getTime() - new Date(r.clockIn).getTime()) / 3600000).toFixed(2)) : 0,
        source: r.source,
        note: r.note,
      })),
    });
  })
);

/* ---------------- HR manual corrections ---------------- */

/** POST /api/attendance — add or fix one day's attendance (HR) */
router.post(
  '/',
  authRequired,
  HR,
  validate({
    employeeId: { required: true, number: true, min: 1 },
    date: { required: true, date: true },
    clockIn: { optional: true, time: true },
    clockOut: { optional: true, time: true },
    source: { oneOf: ['kiosk', 'mobile', 'web', 'manual'] },
    note: { string: true, max: 200 },
  }),
  ah(async (req, res) => {
    const { employeeId, date, clockIn, clockOut, note } = req.body;
    const emp = await Employee.findByPk(employeeId);
    if (!emp) return notFound(res, 'Employee not found.');
    if (date > todayStr()) return badRequest(res, 'Cannot add attendance for a future date.');

    const existing = await Attendance.findOne({ where: { employeeId, date } });
    const toIso = (time) => new Date(riyadhTimeMs(date, time)).toISOString();
    const payload = {
      clockIn: clockIn ? toIso(clockIn) : null,
      clockOut: clockOut ? toIso(clockOut) : null,
      source: req.body.source || 'manual',
      note: note || null,
    };
    if (clockIn && clockOut && payload.clockOut < payload.clockIn) {
      return badRequest(res, 'Clock-out time must be after clock-in time.');
    }
    if (clockIn && clockOut) {
      const hours = (Date.parse(payload.clockOut) - Date.parse(payload.clockIn)) / 3600000;
      if (hours > 16) return badRequest(res, 'A single shift cannot be longer than 16 hours.');
    }
    const record = existing ? await existing.update(payload) : await Attendance.create({ employeeId, date, ...payload });
    await audit({ req, action: existing ? 'update' : 'create', entity: 'Attendance', entityId: record.id, meta: { employeeId, date } });
    res.status(existing ? 200 : 201).json({ ok: true, record });
  })
);

/** PATCH /api/attendance/:id — correct a record (HR) */
router.patch(
  '/:id',
  authRequired,
  HR,
  validate({ ':id': { number: true, min: 1 } }),
  ah(async (req, res) => {
    const record = await Attendance.findByPk(req.params.id);
    if (!record) return notFound(res, 'Attendance record not found.');
    const { clockIn, clockOut, note, source } = req.body || {};
    const payload = {};
    if (clockIn) payload.clockIn = new Date(riyadhTimeMs(dayOf(record.clockIn || record.date), clockIn)).toISOString();
    if (clockOut) payload.clockOut = new Date(riyadhTimeMs(dayOf(record.clockOut || record.date), clockOut)).toISOString();
    if (note !== undefined) payload.note = note;
    if (source) payload.source = source;
    if (payload.clockIn && payload.clockOut && payload.clockOut < payload.clockIn) {
      return badRequest(res, 'Clock-out time must be after clock-in time.');
    }
    await record.update(payload);
    await audit({ req, action: 'update', entity: 'Attendance', entityId: record.id });
    res.json({ ok: true, record });
  })
);

/** DELETE /api/attendance/:id — remove a wrong record (HR) */
router.delete(
  '/:id',
  authRequired,
  HR,
  validate({ ':id': { number: true, min: 1 } }),
  ah(async (req, res) => {
    const record = await Attendance.findByPk(req.params.id);
    if (!record) return notFound(res, 'Attendance record not found.');
    await record.destroy();
    await audit({ req, action: 'delete', entity: 'Attendance', entityId: req.params.id });
    res.json({ ok: true, message: 'Attendance record deleted.' });
  })
);

module.exports = router;
