'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Asset, Employee } = require('../models');
const {
  authRequired, ah, requireRole, visibleEmployeeIds, audit, badRequest, notFound,
} = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { todayStr } = require('../services/time');

const HR = requireRole('hr', 'admin');

function serialize(a) {
  return {
    id: a.id,
    assetCode: a.assetCode,
    name: a.name,
    category: a.category,
    brand: a.brand,
    serialNumber: a.serialNumber,
    purchaseDate: a.purchaseDate,
    purchasePrice: Number(a.purchasePrice || 0),
    status: a.status,
    assignedToId: a.assignedToId,
    assignedTo: a.assignedTo
      ? { id: a.assignedTo.id, employeeCode: a.assignedTo.employeeCode, fullNameEn: a.assignedTo.fullNameEn, department: a.assignedTo.department }
      : null,
    assignedAt: a.assignedAt,
    notes: a.notes,
  };
}

/** GET /api/assets/mine — the assets assigned to the signed-in employee */
router.get(
  '/mine',
  authRequired,
  ah(async (req, res) => {
    if (!req.employee) return res.json({ assets: [] });
    const rows = await Asset.findAll({
      where: { assignedToId: req.employee.id, status: 'assigned' },
      include: [{ model: Employee, as: 'assignedTo', attributes: ['id', 'employeeCode', 'fullNameEn'] }],
    });
    res.json({ assets: rows.map(serialize) });
  })
);

/**
 * GET /api/assets — list.
 * hr/admin: all (+ filters) · manager: team + self · employee: own
 */
router.get(
  '/',
  authRequired,
  ah(async (req, res) => {
    const isHr = ['hr', 'admin'].includes(req.user.role);
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.category) where.category = req.query.category;

    if (!isHr) {
      const ids = await visibleEmployeeIds(req);
      where.assignedToId = ids !== null ? { [Op.in]: ids } : { [Op.ne]: null };
    }
    const rows = await Asset.findAll({
      where,
      include: [{ model: Employee, as: 'assignedTo', attributes: ['id', 'employeeCode', 'fullNameEn', 'department'] }],
      order: [['assetCode', 'ASC']],
    });
    res.json({ assets: rows.map(serialize) });
  })
);

/** POST /api/assets — create asset (HR) */
router.post(
  '/',
  authRequired,
  HR,
  validate({
    assetCode: { required: true, string: true, max: 30 },
    name: { required: true, string: true, max: 120 },
    category: { required: true, string: true, max: 80 },
    brand: { string: true, max: 60 },
    serialNumber: { string: true, max: 80 },
    purchaseDate: { optional: true, date: true },
    purchasePrice: { optional: true, number: true, min: 0, max: 10000000 },
    status: { oneOf: ['available', 'assigned', 'maintenance', 'retired'] },
    assignedToId: { optional: true, number: true, min: 1 },
    notes: { string: true, max: 500 },
  }),
  ah(async (req, res) => {
    const b = req.body;
    if (await Asset.findOne({ where: { assetCode: b.assetCode } })) {
      return badRequest(res, 'This asset code is already in use.');
    }
    const asset = await Asset.create({
      assetCode: b.assetCode,
      name: b.name,
      category: b.category,
      brand: b.brand || null,
      serialNumber: b.serialNumber || null,
      purchaseDate: b.purchaseDate || null,
      purchasePrice: Number(b.purchasePrice || 0),
      status: b.assignedToId ? 'assigned' : b.status || 'available',
      assignedToId: b.assignedToId ? Number(b.assignedToId) : null,
      assignedAt: b.assignedToId ? new Date() : null,
      notes: b.notes || null,
    });
    await audit({ req, action: 'create', entity: 'Asset', entityId: asset.id });
    res.status(201).json({ asset: serialize(asset) });
  })
);

/** PATCH /api/assets/:id — edit asset (HR) */
router.patch(
  '/:id',
  authRequired,
  HR,
  ah(async (req, res) => {
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) return notFound(res, 'Asset not found.');
    const b = req.body || {};
    const upd = {};
    for (const f of ['name', 'category', 'brand', 'serialNumber', 'notes', 'status']) {
      if (b[f] !== undefined) upd[f] = b[f];
    }
    if (b.purchaseDate !== undefined) upd.purchaseDate = b.purchaseDate || null;
    if (b.purchasePrice !== undefined) upd.purchasePrice = Number(b.purchasePrice);
    await asset.update(upd);
    await audit({ req, action: 'update', entity: 'Asset', entityId: asset.id, meta: { fields: Object.keys(upd) } });
    res.json({ asset: serialize(asset) });
  })
);

/** POST /api/assets/:id/assign — assign / unassign (HR) */
router.post(
  '/:id/assign',
  authRequired,
  HR,
  validate({ ':id': { number: true }, assignedToId: { optional: true, number: true, min: 1 } }),
  ah(async (req, res) => {
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) return notFound(res, 'Asset not found.');
    const toId = req.body.assignedToId ? Number(req.body.assignedToId) : null;
    if (toId) {
      const emp = await Employee.findByPk(toId);
      if (!emp) return notFound(res, 'Employee not found.');
    }
    await asset.update({
      assignedToId: toId,
      assignedAt: toId ? new Date() : null,
      status: toId ? 'assigned' : 'available',
    });
    await audit({ req, action: 'update', entity: 'Asset', entityId: asset.id, meta: { assignedToId: toId } });
    res.json({ asset: serialize(asset), message: toId ? 'Asset assigned.' : 'Asset returned to available.' });
  })
);

/** DELETE /api/assets/:id — remove asset record (HR) */
router.delete(
  '/:id',
  authRequired,
  HR,
  ah(async (req, res) => {
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) return notFound(res, 'Asset not found.');
    await asset.destroy();
    await audit({ req, action: 'delete', entity: 'Asset', entityId: asset.id });
    res.json({ ok: true, message: 'Asset removed.' });
  })
);

module.exports = router;
