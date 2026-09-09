'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { User, Employee } = require('../models');
const { authRequired, ah, requireRole, audit, badRequest, notFound } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { hashPasswordSync } = require('../services/passwords');

const ADMIN = requireRole('admin');
const ROLES = ['employee', 'manager', 'hr', 'admin'];

/**
 * GET /api/users - List all users (admin only)
 */
router.get(
  '/',
  authRequired,
  ADMIN,
  ah(async (req, res) => {
    const where = {};
    if (req.query.search) {
      where[Op.or] = [
        { email: { [Op.like]: `%${req.query.search}%` } },
        { role: { [Op.like]: `%${req.query.search}%` } },
      ];
    }
    if (req.query.role) where.role = req.query.role;
    if (req.query.isActive !== undefined) where.isActive = req.query.isActive === 'true';

    const users = await User.findAll({
      where,
      include: [{ model: Employee, attributes: ['id', 'employeeCode', 'fullNameEn', 'fullNameAr', 'department', 'jobTitle'] }],
      order: [['id', 'ASC']],
    });

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        employeeId: u.employeeId,
        lastLoginAt: u.lastLoginAt,
        employee: u.Employee ? {
          id: u.Employee.id,
          employeeCode: u.Employee.employeeCode,
          fullNameEn: u.Employee.fullNameEn,
          fullNameAr: u.Employee.fullNameAr,
          department: u.Employee.department,
          jobTitle: u.Employee.jobTitle,
        } : null,
      })),
    });
  })
);

/**
 * GET /api/users/:id - Get single user
 */
router.get(
  '/:id',
  authRequired,
  ADMIN,
  ah(async (req, res) => {
    const user = await User.findByPk(req.params.id, {
      include: [{ model: Employee }],
    });
    if (!user) return notFound(res, 'User not found');
    res.json({ user });
  })
);

/**
 * POST /api/users - Create user (admin only)
 */
router.post(
  '/',
  authRequired,
  ADMIN,
  validate({
    email: { required: true, email: true },
    role: { required: true, oneOf: ROLES },
    password: { optional: true, minLen: 6, max: 200 },
    employeeId: { optional: true, number: true, min: 0 },
    isActive: { optional: true },
  }),
  ah(async (req, res) => {
    const { email, role, password, employeeId, isActive } = req.body;
    const lowerEmail = email.toLowerCase().trim();

    if (await User.findOne({ where: { email: lowerEmail } })) {
      return badRequest(res, 'A user with this email already exists');
    }

    if (employeeId) {
      const emp = await Employee.findByPk(employeeId);
      if (!emp) return badRequest(res, 'Employee not found');
      // Check if employee already has a user
      const existingUser = await User.findOne({ where: { employeeId } });
      if (existingUser) return badRequest(res, 'This employee already has a login account');
    }

    const generatedPassword = password || Math.random().toString(36).slice(2, 10) + 'A1!';
    
    const user = await User.create({
      email: lowerEmail,
      passwordHash: hashPasswordSync(generatedPassword),
      role,
      employeeId: employeeId || null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    await audit({ req, action: 'create', entity: 'User', entityId: user.id, meta: { email: lowerEmail, role } });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        employeeId: user.employeeId,
      },
      credentials: password ? undefined : {
        email: lowerEmail,
        password: generatedPassword,
        note: 'Temporary password generated',
      },
    });
  })
);

/**
 * PUT /api/users/:id - Update user (admin only)
 */
router.put(
  '/:id',
  authRequired,
  ADMIN,
  validate({
    role: { optional: true, oneOf: ROLES },
    isActive: { optional: true },
    employeeId: { optional: true, number: true, min: 0 },
  }),
  ah(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return notFound(res, 'User not found');

    // Prevent admin from deactivating themselves
    if (user.id === req.user.id && req.body.isActive === false) {
      return badRequest(res, 'You cannot deactivate your own account');
    }

    const updates = {};
    if (req.body.role !== undefined) {
      updates.role = req.body.role;
      // Also update linked employee role if exists
      if (user.employeeId) {
        await Employee.update({ role: req.body.role }, { where: { id: user.employeeId } });
      }
    }
    if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);
    if (req.body.employeeId !== undefined) {
      const empId = req.body.employeeId ? Number(req.body.employeeId) : null;
      if (empId) {
        const emp = await Employee.findByPk(empId);
        if (!emp) return badRequest(res, 'Employee not found');
      }
      updates.employeeId = empId;
    }

    await user.update(updates);
    await audit({ req, action: 'update', entity: 'User', entityId: user.id, meta: { fields: Object.keys(updates) } });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        employeeId: user.employeeId,
      },
    });
  })
);

/**
 * PUT /api/users/:id/password - Reset password (admin only)
 */
router.put(
  '/:id/password',
  authRequired,
  ADMIN,
  validate({
    newPassword: { required: true, minLen: 6, max: 200 },
  }),
  ah(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return notFound(res, 'User not found');

    await user.update({ passwordHash: hashPasswordSync(req.body.newPassword) });
    await audit({ req, action: 'update', entity: 'User', entityId: user.id, meta: { what: 'password reset by admin' } });

    res.json({ ok: true, message: `Password reset for ${user.email}` });
  })
);

/**
 * POST /api/users/clear-demo - Clear demo data (admin only)
 * Removes demo employees EMP-00x and related data, keeps branches/shifts
 */
router.post(
  '/clear-demo',
  authRequired,
  ADMIN,
  ah(async (req, res) => {
    const { Op } = require('sequelize');
    const { Employee, Attendance, LeaveRequest, Loan, Payslip, SalesCommission, Asset, AuditLog } = require('../models');
    const { sequelize } = require('../db');
    const t = await sequelize.transaction();
    try {
      // Delete demo attendance, leave, loans etc linked to demo employees
      const demoEmployees = await Employee.findAll({ where: { employeeCode: { [Op.like]: 'EMP-00%' } }, transaction: t });
      const demoIds = demoEmployees.map(e => e.id);
      
      if (demoIds.length > 0) {
        await Attendance.destroy({ where: { employeeId: { [Op.in]: demoIds } }, transaction: t });
        await LeaveRequest.destroy({ where: { employeeId: { [Op.in]: demoIds } }, transaction: t });
        await Loan.destroy({ where: { employeeId: { [Op.in]: demoIds } }, transaction: t });
        await Payslip.destroy({ where: { employeeId: { [Op.in]: demoIds } }, transaction: t });
        await SalesCommission.destroy({ where: { employeeId: { [Op.in]: demoIds } }, transaction: t });
        await Asset.update({ assignedToId: null, status: 'available' }, { where: { assignedToId: { [Op.in]: demoIds } }, transaction: t });
        await User.destroy({ where: { employeeId: { [Op.in]: demoIds } }, transaction: t });
        await Employee.destroy({ where: { id: { [Op.in]: demoIds } }, transaction: t });
      }
      
      // Also delete demo users with @alnoor.sa domain (except current admin)
      await User.destroy({ where: { email: { [Op.like]: '%@alnoor.sa' }, id: { [Op.ne]: req.user.id } }, transaction: t });
      
      await t.commit();
      
      // Ensure branches/shifts exist
      const { seedProductionAdmin } = require('../seed');
      await seedProductionAdmin();
      
      await audit({ req, action: 'clear', entity: 'DemoData', meta: { demoEmployees: demoIds.length } });
      res.json({ ok: true, message: `Demo data cleared: ${demoIds.length} demo employees removed. Production setup ready.` });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  })
);

/**
 * DELETE /api/users/:id - Delete user (admin only)
 */
router.delete(
  '/:id',
  authRequired,
  ADMIN,
  ah(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) return notFound(res, 'User not found');

    if (user.id === req.user.id) {
      return badRequest(res, 'You cannot delete your own account');
    }

    // Don't delete if it's the last admin
    if (user.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin', isActive: true } });
      if (adminCount <= 1) {
        return badRequest(res, 'Cannot delete the last admin account');
      }
    }

    await user.destroy();
    await audit({ req, action: 'delete', entity: 'User', entityId: user.id, meta: { email: user.email } });

    res.json({ ok: true, message: `User ${user.email} deleted` });
  })
);

module.exports = router;
