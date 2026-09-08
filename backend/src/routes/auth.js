'use strict';

const express = require('express');
const router = express.Router();
const { User, Employee } = require('../models');
const { verifyPassword, hashPassword, verifyPin, hashPin } = require('../services/passwords');
const { signToken, authRequired, ah, audit, badRequest } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const leaveSvc = require('../services/leaveService');

/** serialize the user for the frontend */
async function publicUser(user) {
  const employee = user.employeeId ? await Employee.findByPk(user.employeeId) : null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    employeeId: user.employeeId,
    employee: employee
      ? {
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullNameEn: employee.fullNameEn,
          fullNameAr: employee.fullNameAr,
          department: employee.department,
          jobTitle: employee.jobTitle,
          managerId: employee.managerId,
          status: employee.status,
        }
      : null,
  };
}

/**
 * POST /api/auth/login  { email, password }
 * Open to everyone (no auth required) — validates credentials only.
 */
router.post(
  '/login',
  validate({ email: { required: true, email: true }, password: { required: true, minLen: 6, max: 200 } }),
  ah(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      await audit({ req: { user: null, kioskActor: email }, action: 'login', entity: 'User', meta: { ok: false } });
      return res.status(401).json({ error: 'Wrong email or password. Please try again.', code: 'BAD_CREDENTIALS' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'This account is disabled. Contact your HR administrator.', code: 'DISABLED' });
    }
    await user.update({ lastLoginAt: new Date() });
    await audit({ req: { user }, action: 'login', entity: 'User', entityId: user.id, meta: { ok: true } });
    const token = signToken(user);
    res.json({ token, user: await publicUser(user) });
  })
);

/** GET /api/auth/me — current user profile (with leave balances) */
router.get(
  '/me',
  authRequired,
  ah(async (req, res) => {
    const me = await publicUser(req.user);
    let balances = null;
    if (req.employee) {
      balances = await leaveSvc.leaveBalances(req.employee);
    }
    res.json({ user: me, balances });
  })
);

/** PUT /api/auth/password — change your own password */
router.put(
  '/password',
  authRequired,
  validate({
    currentPassword: { required: true },
    newPassword: { required: true, minLen: 8, max: 200 },
  }),
  ah(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!(await verifyPassword(currentPassword, req.user.passwordHash))) {
      return badRequest(res, 'Your current password is incorrect.');
    }
    if (currentPassword === newPassword) {
      return badRequest(res, 'The new password must be different from the current one.');
    }
    await req.user.update({ passwordHash: await hashPassword(newPassword) });
    await audit({ req, action: 'update', entity: 'User', entityId: req.user.id, meta: { what: 'password changed' } });
    res.json({ ok: true, message: 'Password updated successfully.' });
  })
);

/** PUT /api/auth/my-pin — employees can set the kiosk clock PIN they type at the kiosk */
router.put(
  '/my-pin',
  authRequired,
  validate({ pin: { required: true, number: true, min: 1000, max: 9999 } }),
  ah(async (req, res) => {
    if (!req.employee) return badRequest(res, 'Only employees can set a kiosk PIN.');
    const pin = String(req.body.pin);
    await Employee.update({ pinHash: hashPin(pin) }, { where: { id: req.employee.id } });
    await audit({ req, action: 'update', entity: 'Employee', entityId: req.employee.id, meta: { what: 'kiosk pin updated' } });
    res.json({ ok: true, message: 'Kiosk PIN updated.' });
  })
);

module.exports = router;
