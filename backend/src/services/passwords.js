'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ROUNDS = 10;

async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

function hashPasswordSync(plain) {
  return bcrypt.hashSync(plain, ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Kiosk PIN: stored as a salted SHA-256 (not reversible, fast enough
 *  for kiosk validation; the PIN is an extra factor on top of the
 *  employee code, and kiosks run behind rate limiting). */
function hashPin(pin, salt) {
  const s = salt || crypto.randomBytes(8).toString('hex');
  const digest = crypto.createHash('sha256').update(`${s}:${pin}`).digest('hex');
  return `${s}$${digest}`;
}

function verifyPin(pin, stored) {
  if (!stored || !pin) return false;
  const [salt] = String(stored).split('$');
  return crypto.timingSafeEqual(Buffer.from(hashPin(String(pin), salt)), Buffer.from(String(stored)));
}

module.exports = { hashPassword, hashPasswordSync, verifyPassword, hashPin, verifyPin };
