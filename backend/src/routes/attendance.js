'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const config = require('../../config');
const { Attendance, Employee, Branch, Shift } = require('../models');
const {
  authRequired, authOptional, ah, requireRole, visibleEmployeeIds, audit, badRequest, notFound, HR_ROLES,
} = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { verifyPin } = require('../services/passwords');
const { todayStr, riyadhTimeMs, formatClock, dayOf } = require('../services/time');

const HR = requireRole('hr', 'admin');

const attempts = new Map();

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

router.get(
  '/kiosk-employees',
  ah(async (_req, res) => {
    try {
      const emps = await Employee.findAll({
        where: { status: { [Op.in]: ['active', 'on_leave'] } },
        attributes: ['employeeCode', 'fullNameEn', 'department'],
        order: [['employeeCode', 'ASC']],
        raw: true,
      });
      res.json({ employees: emps });
    } catch (err) {
      console.error('[kiosk-employees] error:', err.message);
      res.json({ employees: [] });
    }
  })
);

router.post(
  '/clock',
  authOptional,
  ah(async (req, res) => {
    const { action, employeeCode, pin, source, note, lat, lng } = req.body || {};

    let employee = req.employee || null;
    let effectiveSource = 'web';
    const wantsKiosk = Boolean(employeeCode) && Boolean(pin);

    if (wantsKiosk) {
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
      if (source && ['kiosk', 'mobile', 'web', 'fingerprint', 'zkteco', 'excel_import', 'manual'].includes(source)) effectiveSource = source;
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
      const createData = {
        employeeId: employee.id,
        date: today,
        clockIn,
        source: effectiveSource,
        note: note || `Clocked in from ${wantsKiosk ? 'kiosk device' : effectiveSource}${lat && lng ? ` (GPS ${lat},${lng})` : ''}`,
      };
      // Try to add branch/shift if available
      try {
        if (employee.branchId) createData.branchId = employee.branchId;
        if (employee.shiftId) createData.shiftId = employee.shiftId;
      } catch {}
      
      try {
        record = await Attendance.create(createData);
      } catch (err) {
        if (err.message.includes('branchId') || err.message.includes('shiftId') || err.message.includes('isLate')) {
          delete createData.branchId;
          delete createData.shiftId;
          record = await Attendance.create(createData);
        } else {
          throw err;
        }
      }
      
      await audit({ req, action: 'clock_in', entity: 'Attendance', entityId: record.id, meta: { employee: employee.employeeCode, source: effectiveSource } });
      return res.status(201).json({
        ok: true,
        message: `${employee.fullNameEn} clocked IN at ${formatClock(record.clockIn)} (${effectiveSource}).`,
        record: { id: record.id, date: today, clockIn: record.clockIn, clockOut: record.clockOut, source: effectiveSource },
      });
    }

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

router.get(
  '/status',
  authRequired,
  ah(async (req, res) => {
    if (!req.employee) return badRequest(res, 'No employee context.');
    try {
      const record = await Attendance.findOne({ where: { employeeId: req.employee.id, date: todayStr() } });
      res.json({ today: todayStr(), record });
    } catch (err) {
      console.warn('[attendance/status] error:', err.message);
      res.json({ today: todayStr(), record: null });
    }
  })
);

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

    let rows;
    try {
      rows = await Attendance.findAll({
        where,
        include: [
          { model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] },
          { model: Branch, as: 'branch', attributes: ['id', 'name', 'code'] },
          { model: Shift, as: 'shift', attributes: ['id', 'name', 'code', 'startTime', 'endTime'] },
        ],
        order: [['date', 'DESC'], ['id', 'DESC']],
        limit: Math.min(Number(req.query.limit) || 200, 1000),
      });
    } catch (err) {
      console.warn('[attendance] fallback without branch/shift:', err.message);
      rows = await Attendance.findAll({
        where,
        include: [{ model: Employee, as: 'employee', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] }],
        order: [['date', 'DESC'], ['id', 'DESC']],
        limit: Math.min(Number(req.query.limit) || 200, 1000),
      });
    }
    
    res.json({
      attendance: rows.map((r) => ({
        id: r.id,
        date: r.date,
        employee: r.employee,
        employeeId: r.employeeId,
        clockIn: r.clockIn,
        clockOut: r.clockOut,
        clockInTime: formatClock(r.clockIn),
        clockOutTime: r.clockOut ? formatClock(r.clockOut) : null,
        hours: r.clockIn ? Number((((r.clockOut ? new Date(r.clockOut) : new Date()).getTime() - new Date(r.clockIn).getTime()) / 3600000).toFixed(2)) : 0,
        source: r.source,
        note: r.note,
        isLate: r.isLate || false,
        lateMinutes: r.lateMinutes || 0,
        branch: r.branch || null,
        shift: r.shift || null,
        deviceId: r.deviceId || null,
        importBatch: r.importBatch || null,
      })),
    });
  })
);

router.post(
  '/',
  authRequired,
  HR,
  validate({
    employeeId: { required: true, number: true, min: 1 },
    date: { required: true, date: true },
    clockIn: { optional: true, time: true },
    clockOut: { optional: true, time: true },
    source: { oneOf: ['kiosk', 'mobile', 'web', 'manual', 'fingerprint', 'zkteco', 'excel_import'] },
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
    
    try {
      if (emp.branchId) payload.branchId = emp.branchId;
      if (emp.shiftId) payload.shiftId = emp.shiftId;
    } catch {}
    
    let record;
    try {
      record = existing ? await existing.update(payload) : await Attendance.create({ employeeId, date, ...payload });
    } catch (err) {
      if (err.message.includes('branchId') || err.message.includes('shiftId')) {
        delete payload.branchId;
        delete payload.shiftId;
        record = existing ? await existing.update(payload) : await Attendance.create({ employeeId, date, ...payload });
      } else {
        throw err;
      }
    }
    
    await audit({ req, action: existing ? 'update' : 'create', entity: 'Attendance', entityId: record.id, meta: { employeeId, date } });
    res.status(existing ? 200 : 201).json({ ok: true, record });
  })
);

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
