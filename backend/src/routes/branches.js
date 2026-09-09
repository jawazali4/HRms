'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Branch, Employee, Shift } = require('../models');
const { authRequired, ah, requireRole, audit, badRequest, notFound } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const HR = requireRole('hr', 'admin');
const ADMIN = requireRole('admin');

router.get(
  '/',
  authRequired,
  ah(async (req, res) => {
    try {
      const where = {};
      if (req.query.type) where.type = req.query.type;
      if (req.query.isActive !== undefined) where.isActive = req.query.isActive === 'true';
      if (req.query.search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${req.query.search}%` } },
          { nameAr: { [Op.like]: `%${req.query.search}%` } },
          { code: { [Op.like]: `%${req.query.search}%` } },
          { city: { [Op.like]: `%${req.query.search}%` } },
        ];
      }

      const branches = await Branch.findAll({
        where,
        include: [
          { model: Employee, as: 'manager', attributes: ['id', 'fullNameEn', 'fullNameAr', 'employeeCode'] },
          { model: Shift, as: 'defaultShift', attributes: ['id', 'code', 'name', 'startTime', 'endTime'] },
        ],
        order: [['code', 'ASC']],
      });

      const result = await Promise.all(
        branches.map(async (b) => {
          let employeeCount = 0;
          try {
            employeeCount = await Employee.count({ where: { branchId: b.id, status: { [Op.in]: ['active', 'on_leave', 'probation'] } } });
          } catch (e) {
            try {
              employeeCount = await Employee.count({ where: { branchId: b.id } });
            } catch {}
          }
          return {
            ...b.toJSON(),
            employeeCount,
          };
        })
      );

      res.json({ branches: result });
    } catch (err) {
      if (err.message.includes('branches') || err.message.includes('does not exist')) {
        console.warn('[branches] table missing, creating...');
        try {
          await Branch.sync();
          const { seedProductionAdmin } = require('../seed');
          await seedProductionAdmin();
          // Retry
          const branches = await Branch.findAll({ order: [['code', 'ASC']] });
          res.json({ branches });
        } catch (e2) {
          console.error('[branches] auto-create failed:', e2.message);
          res.json({ branches: [], warning: 'Branches table not ready, please refresh in a moment. ' + e2.message });
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
      const branch = await Branch.findByPk(req.params.id, {
        include: [
          { model: Employee, as: 'manager' },
          { model: Shift, as: 'defaultShift' },
          { model: Employee, as: 'employees', attributes: ['id', 'employeeCode', 'fullNameEn', 'fullNameAr', 'department', 'status'] },
          { model: Shift, as: 'shifts' },
        ],
      });
      if (!branch) return notFound(res, 'Branch not found');
      res.json({ branch });
    } catch (err) {
      if (err.message.includes('does not exist')) {
        return res.status(503).json({ error: 'Branches table is being created, please refresh in a few seconds', code: 'TABLE_CREATING' });
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
    type: { required: true, oneOf: ['branch', 'warehouse', 'factory', 'head_office'] },
    city: { string: true, max: 100 },
    address: { string: true, max: 500 },
    phone: { string: true, max: 30 },
    managerId: { number: true, min: 0 },
    defaultShiftId: { number: true, min: 0 },
  }),
  ah(async (req, res) => {
    const { code, name, nameAr, type, city, address, phone, managerId, defaultShiftId } = req.body;

    try {
      if (await Branch.findOne({ where: { code: code.toUpperCase() } })) {
        return badRequest(res, 'Branch code already exists');
      }
    } catch (e) {
      if (e.message.includes('does not exist')) {
        await Branch.sync();
      }
    }

    const branch = await Branch.create({
      code: code.toUpperCase(),
      name,
      nameAr: nameAr || name,
      type,
      city: city || null,
      address: address || null,
      phone: phone || null,
      managerId: managerId || null,
      defaultShiftId: defaultShiftId || null,
      isActive: true,
    });

    await audit({ req, action: 'create', entity: 'Branch', entityId: branch.id, meta: { code, name, type } });
    res.status(201).json({ branch });
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
    type: { oneOf: ['branch', 'warehouse', 'factory', 'head_office'] },
    city: { string: true, max: 100 },
    address: { string: true, max: 500 },
    phone: { string: true, max: 30 },
    managerId: { number: true, min: 0 },
    defaultShiftId: { number: true, min: 0 },
    isActive: { },
  }),
  ah(async (req, res) => {
    const branch = await Branch.findByPk(req.params.id);
    if (!branch) return notFound(res, 'Branch not found');

    const updates = {};
    const fields = ['name', 'nameAr', 'type', 'city', 'address', 'phone', 'isActive'];
    for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
    
    if (req.body.code !== undefined && req.body.code !== branch.code) {
      if (await Branch.findOne({ where: { code: req.body.code.toUpperCase(), id: { [Op.ne]: branch.id } } })) {
        return badRequest(res, 'Branch code already exists');
      }
      updates.code = req.body.code.toUpperCase();
    }
    if (req.body.managerId !== undefined) updates.managerId = req.body.managerId || null;
    if (req.body.defaultShiftId !== undefined) updates.defaultShiftId = req.body.defaultShiftId || null;

    await branch.update(updates);
    await audit({ req, action: 'update', entity: 'Branch', entityId: branch.id, meta: { fields: Object.keys(updates) } });
    res.json({ branch });
  })
);

router.delete(
  '/:id',
  authRequired,
  ADMIN,
  ah(async (req, res) => {
    const branch = await Branch.findByPk(req.params.id);
    if (!branch) return notFound(res, 'Branch not found');

    let employeeCount = 0;
    try {
      employeeCount = await Employee.count({ where: { branchId: branch.id } });
    } catch {}
    if (employeeCount > 0) {
      return badRequest(res, `Cannot delete — ${employeeCount} employees are assigned to this branch. Reassign them first.`);
    }

    let shiftCount = 0;
    try {
      shiftCount = await Shift.count({ where: { branchId: branch.id } });
    } catch {}
    if (shiftCount > 0) {
      return badRequest(res, `Cannot delete — ${shiftCount} shifts are linked to this branch. Delete or reassign them first.`);
    }

    await branch.destroy();
    await audit({ req, action: 'delete', entity: 'Branch', entityId: branch.id, meta: { code: branch.code } });
    res.json({ ok: true, message: `Branch ${branch.code} deleted` });
  })
);

module.exports = router;
