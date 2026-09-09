'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Shift, Employee, Branch } = require('../models');
const { authRequired, ah, requireRole, audit, badRequest, notFound } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const HR = requireRole('hr', 'admin');
const ADMIN = requireRole('admin');

function isValidTime(t) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(t);
}

router.get(
  '/',
  authRequired,
  ah(async (req, res) => {
    try {
      const where = {};
      if (req.query.branchId) where.branchId = Number(req.query.branchId);
      if (req.query.isActive !== undefined) where.isActive = req.query.isActive === 'true';
      if (req.query.search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${req.query.search}%` } },
          { nameAr: { [Op.like]: `%${req.query.search}%` } },
          { code: { [Op.like]: `%${req.query.search}%` } },
        ];
      }

      const shifts = await Shift.findAll({
        where,
        include: [
          { model: Branch, as: 'branch', attributes: ['id', 'code', 'name', 'type'] },
        ],
        order: [['code', 'ASC']],
      });

      const result = await Promise.all(
        shifts.map(async (s) => {
          let employeeCount = 0;
          try {
            employeeCount = await Employee.count({ where: { shiftId: s.id } });
          } catch {}
          return {
            ...s.toJSON(),
            employeeCount,
          };
        })
      );

      res.json({ shifts: result });
    } catch (err) {
      if (err.message.includes('shifts') || err.message.includes('does not exist')) {
        console.warn('[shifts] table missing, creating...');
        try {
          await Shift.sync();
          const { seedProductionAdmin } = require('../seed');
          await seedProductionAdmin();
          const shifts = await Shift.findAll({ order: [['code', 'ASC']] });
          res.json({ shifts });
        } catch (e2) {
          console.error('[shifts] auto-create failed:', e2.message);
          res.json({ shifts: [], warning: 'Shifts table not ready, please refresh. ' + e2.message });
        }
      } else {
        throw err;
      }
    }
  })
);

router.get(
  '/:id',
  authRequired,
  ah(async (req, res) => {
    try {
      const shift = await Shift.findByPk(req.params.id, {
        include: [
          { model: Branch, as: 'branch' },
          { model: Employee, as: 'employees', attributes: ['id', 'employeeCode', 'fullNameEn', 'fullNameAr', 'department'] },
        ],
      });
      if (!shift) return notFound(res, 'Shift not found');
      res.json({ shift });
    } catch (err) {
      if (err.message.includes('does not exist')) {
        return res.status(503).json({ error: 'Shifts table is being created, please refresh', code: 'TABLE_CREATING' });
      }
      throw err;
    }
  })
);

router.post(
  '/',
  authRequired,
  HR,
  validate({
    code: { required: true, string: true, max: 20 },
    name: { required: true, string: true, max: 100 },
    nameAr: { string: true, max: 100 },
    startTime: { required: true, string: true, max: 10 },
    endTime: { required: true, string: true, max: 10 },
    breakStart: { string: true, max: 10 },
    breakEnd: { string: true, max: 10 },
    workDays: { oneOf: ['sun_thur', 'mon_fri', 'sat_fri', 'sun_fri', 'sat_thu'] },
    branchId: { number: true, min: 0 },
    color: { string: true, max: 20 },
    description: { string: true, max: 500 },
  }),
  ah(async (req, res) => {
    const { code, name, nameAr, startTime, endTime, breakStart, breakEnd, workDays, graceIn, graceOut, branchId, color, description, overtimeEnabled } = req.body;

    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      return badRequest(res, 'startTime and endTime must be in HH:mm format (e.g. 08:00)');
    }
    if (breakStart && !isValidTime(breakStart)) return badRequest(res, 'breakStart must be HH:mm');
    if (breakEnd && !isValidTime(breakEnd)) return badRequest(res, 'breakEnd must be HH:mm');

    try {
      if (await Shift.findOne({ where: { code: code.toUpperCase() } })) {
        return badRequest(res, 'Shift code already exists');
      }
    } catch (e) {
      if (e.message.includes('does not exist')) {
        await Shift.sync();
      }
    }

    const shift = await Shift.create({
      code: code.toUpperCase(),
      name,
      nameAr: nameAr || name,
      startTime,
      endTime,
      breakStart: breakStart || '12:00',
      breakEnd: breakEnd || '13:00',
      workDays: workDays || 'sun_thur',
      graceIn: graceIn !== undefined ? Number(graceIn) : 15,
      graceOut: graceOut !== undefined ? Number(graceOut) : 15,
      overtimeEnabled: overtimeEnabled !== undefined ? Boolean(overtimeEnabled) : true,
      branchId: branchId || null,
      color: color || '#0f766e',
      description: description || null,
      isActive: true,
    });

    await audit({ req, action: 'create', entity: 'Shift', entityId: shift.id, meta: { code, name, startTime, endTime } });
    res.status(201).json({ shift });
  })
);

router.put(
  '/:id',
  authRequired,
  HR,
  validate({
    code: { string: true, max: 20 },
    name: { string: true, max: 100 },
    nameAr: { string: true, max: 100 },
    startTime: { string: true, max: 10 },
    endTime: { string: true, max: 10 },
    breakStart: { string: true, max: 10 },
    breakEnd: { string: true, max: 10 },
    workDays: { oneOf: ['sun_thur', 'mon_fri', 'sat_fri', 'sun_fri', 'sat_thu'] },
    branchId: { number: true, min: 0 },
    color: { string: true, max: 20 },
    description: { string: true, max: 500 },
    isActive: {},
  }),
  ah(async (req, res) => {
    const shift = await Shift.findByPk(req.params.id);
    if (!shift) return notFound(res, 'Shift not found');

    const updates = {};
    const fields = ['name', 'nameAr', 'workDays', 'color', 'description', 'isActive'];
    for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];

    if (req.body.code !== undefined && req.body.code.toUpperCase() !== shift.code) {
      if (await Shift.findOne({ where: { code: req.body.code.toUpperCase(), id: { [Op.ne]: shift.id } } })) {
        return badRequest(res, 'Shift code already exists');
      }
      updates.code = req.body.code.toUpperCase();
    }

    for (const tf of ['startTime', 'endTime', 'breakStart', 'breakEnd']) {
      if (req.body[tf] !== undefined) {
        if (!isValidTime(req.body[tf])) return badRequest(res, `${tf} must be HH:mm`);
        updates[tf] = req.body[tf];
      }
    }

    if (req.body.graceIn !== undefined) updates.graceIn = Number(req.body.graceIn);
    if (req.body.graceOut !== undefined) updates.graceOut = Number(req.body.graceOut);
    if (req.body.overtimeEnabled !== undefined) updates.overtimeEnabled = Boolean(req.body.overtimeEnabled);
    if (req.body.branchId !== undefined) updates.branchId = req.body.branchId || null;

    await shift.update(updates);
    await audit({ req, action: 'update', entity: 'Shift', entityId: shift.id, meta: { fields: Object.keys(updates) } });
    res.json({ shift });
  })
);

router.delete(
  '/:id',
  authRequired,
  ADMIN,
  ah(async (req, res) => {
    const shift = await Shift.findByPk(req.params.id);
    if (!shift) return notFound(res, 'Shift not found');

    let employeeCount = 0;
    try {
      employeeCount = await Employee.count({ where: { shiftId: shift.id } });
    } catch {}
    if (employeeCount > 0) {
      return badRequest(res, `Cannot delete — ${employeeCount} employees use this shift. Reassign them first.`);
    }

    await shift.destroy();
    await audit({ req, action: 'delete', entity: 'Shift', entityId: shift.id, meta: { code: shift.code } });
    res.json({ ok: true, message: `Shift ${shift.code} deleted` });
  })
);

module.exports = router;
