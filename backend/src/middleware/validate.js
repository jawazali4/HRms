/**
 * Tiny dependency-free request validator.
 *
 * Usage:
 *   v({
 *     email:    { required: true, email: true },
 *     role:     { oneOf: ['employee','manager','hr'] },
 *     salary:   { number: true, min: 0, max: 1000000 },
 *     hireDate: { date: true },
 *     name:     { required: true, string: true, max: 120 },
 *   })
 *
 * Validates req.body (and req.params/query where a field name starts
 * with ':' e.g. ':id'). Responds 400 with a friendly Arabic/English
 * style message listing the first problem found per field.
 */
'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function val(value, rules, field) {
  const errs = [];

  if (rules.optional && (value === undefined || value === null || value === '')) {
    return { skip: true };
  }

  if (rules.required && (value === undefined || value === null || value === '')) {
    return { errs: [`"${field}" is required`] };
  }
  if (value === undefined || value === null || value === '') return { skip: true };

  if (rules.email && typeof value === 'string' && !EMAIL_RE.test(value)) {
    errs.push(`"${field}" must be a valid email address`);
  }
  if (rules.date && (typeof value !== 'string' || !DATE_RE.test(value))) {
    errs.push(`"${field}" must be a date in the format YYYY-MM-DD`);
  }
  if (rules.ym && (typeof value !== 'string' || !YM_RE.test(value))) {
    errs.push(`"${field}" must be a month in the format YYYY-MM`);
  }
  if (rules.time && (typeof value !== 'string' || !TIME_RE.test(value))) {
    errs.push(`"${field}" must be a time in the format HH:mm`);
  }
  if (rules.oneOf && !rules.oneOf.includes(value)) {
    errs.push(`"${field}" must be one of: ${rules.oneOf.join(', ')}`);
  }
  if (rules.string && typeof value !== 'string') {
    errs.push(`"${field}" must be text`);
  } else if (typeof value === 'string') {
    if (rules.max && value.length > rules.max) {
      errs.push(`"${field}" must be at most ${rules.max} characters`);
    }
    if (rules.minLen && value.length < rules.minLen) {
      errs.push(`"${field}" must be at least ${rules.minLen} characters`);
    }
  }
  if (rules.number !== undefined) {
    const n = Number(value);
    if (value === true || value === false || value === '' || Number.isNaN(n)) {
      errs.push(`"${field}" must be a number`);
    } else {
      if (rules.min !== undefined && n < rules.min) errs.push(`"${field}" must be at least ${rules.min}`);
      if (rules.max !== undefined && n > rules.max) errs.push(`"${field}" must be at most ${rules.max}`);
    }
  }
  if (rules.bool !== undefined && !['true', 'false', true, false, 1, 0].includes(value)) {
    errs.push(`"${field}" must be true or false`);
  }
  return { errs };
}

function validate(schema, { source } = { source: 'body' }) {
  return (req, res, next) => {
    const all = [];
    for (const [field, rules] of Object.entries(schema || {})) {
      let value;
      if (field.startsWith(':')) {
        value = req.params[field.slice(1)];
      } else if (source === 'query') {
        value = req.query[field];
      } else {
        value = req.body ? req.body[field] : undefined;
      }
      const { errs } = val(value, rules, field);
      if (errs && errs.length) all.push(...errs);
    }
    if (all.length) {
      return res.status(400).json({ error: all[0], code: 'VALIDATION', fields: all });
    }
    next();
  };
}

module.exports = { validate, EMAIL_RE };
