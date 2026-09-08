'use strict';

const jwt = require('jsonwebtoken');
const config = require('../../config');
const { User, Employee, AuditLog } = require('../models');

/** Wrap async route handlers so thrown errors reach the error middleware. */
function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

function notFound(res, msg = 'Not found') {
  return res.status(404).json({ error: msg });
}

function badRequest(res, msg, fields) {
  const out = { error: msg };
  if (fields) out.fields = fields;
  return res.status(400).json(out);
}

/** Refresh the Employee record cached on req (helper for writes). */
async function loadEmployeeContext(user) {
  if (!user || !user.employeeId) return null;
  return Employee.findByPk(user.employeeId);
}

/**
 * Middleware: requires a valid JWT (Authorization: Bearer <token>).
 * Loads the current user (fresh) so disabled accounts are rejected and
 * role changes take effect immediately.
 */
async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    let token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token && req.query && req.query.token) token = req.query.token;
    if (!token) {
      return res.status(401).json({
        error: 'You are not signed in. Please log in first.',
        code: 'NO_TOKEN',
      });
    }
    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.', code: 'BAD_TOKEN' });
    }
    const user = await User.findByPk(payload.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'This account is disabled or no longer exists.', code: 'DISABLED' });
    }
    req.user = user;
    req.employee = await loadEmployeeContext(user);
    if (user.employeeId && !req.employee) {
      return res.status(401).json({ error: 'Your account is not linked to an employee record.', code: 'NO_EMPLOYEE' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Allow requests without a token through (used by the public kiosk). */
function authOptional(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  return authRequired(req, res, next);
}

/** Role gate. Usage: requireRole('hr', 'admin') */
function requireRole(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({
      error: `You do not have permission to do this. Your role (${req.user.role}) is not allowed here.`,
      code: 'FORBIDDEN',
    });
  };
}

/** Roles that may read/write beyond their own records. */
const HR_ROLES = ['hr', 'admin'];

/**
 * Return the list of employee ids this user may see.
 *   hr/admin → null (all employees)
 *   manager  → themselves + direct reports
 *   employee → themselves only
 */
async function visibleEmployeeIds(req, includeSelf = true) {
  const { role, employeeId } = req.user;
  if (HR_ROLES.includes(role)) return null;
  const me = req.employee ? req.employee.id : employeeId;
  if (role === 'manager') {
    const reports = await Employee.findAll({
      where: { managerId: me },
      attributes: ['id'],
      raw: true,
    });
    const ids = reports.map((r) => r.id);
    if (includeSelf && me) ids.push(me);
    return [...new Set(ids)];
  }
  return me ? [me] : [];
}

/** Middleware for record-level access: req.employeeId resolves to the
 *  employee the actor may act on, from ?employeeId=, body.employeeId or self. */
async function resolveTargetEmployee(req, res, next) {
  try {
    const ids = await visibleEmployeeIds(req);
    const candidate = Number(
      req.body && req.body.employeeId !== undefined
        ? req.body.employeeId
        : req.params.employeeId || req.query.employeeId
    ) || (req.employee ? req.employee.id : null);

    if (!candidate) {
      return res.status(403).json({ error: 'No employee context for this action.', code: 'FORBIDDEN' });
    }
    if (ids !== null && !ids.includes(candidate)) {
      return res.status(403).json({
        error: 'You may only access data for yourself or your team members.',
        code: 'SCOPE',
      });
    }
    req.targetEmployeeId = candidate;
    next();
  } catch (err) {
    next(err);
  }
}

/** Record audit entries. */
async function audit({ req, action, entity, entityId, meta }) {
  try {
    await AuditLog.create({
      userId: req.user ? req.user.id : null,
      actor: req.user ? req.user.email : req.kioskActor || 'anonymous',
      action,
      entity,
      entityId,
      meta: meta || {},
    });
  } catch {
    /* auditing must never break a request */
  }
}

/** Human-readable actor for display purposes */
function actorLabel(req) {
  if (req.user) return req.user.email;
  return req.kioskActor || 'anonymous';
}

module.exports = {
  ah,
  authRequired,
  authOptional,
  requireRole,
  visibleEmployeeIds,
  resolveTargetEmployee,
  signToken,
  audit,
  actorLabel,
  notFound,
  badRequest,
  HR_ROLES,
};
