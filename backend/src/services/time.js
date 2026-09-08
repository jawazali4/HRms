/**
 * Time helpers. All times in this app are treated as Asia/Riyadh
 * (Saudi Arabia, UTC+3) so attendance days and payroll periods match
 * what happens in the office, no matter which country the server runs in.
 */
'use strict';

const TIMEZONE = 'Asia/Riyadh';

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Riyadh wall-clock date parts {year, month (1-12), day} for a Date/now */
function riyadhParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, day] = fmt.format(d).split('-');
  return { year: parseInt(y, 10), month: parseInt(m, 10), day: parseInt(day, 10) };
}

/** Today's date in Riyadh as 'YYYY-MM-DD' */
function todayStr(date = new Date()) {
  const { year, month, day } = riyadhParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Current period 'YYYY-MM' in Riyadh */
function currentMonthStr(date = new Date()) {
  const { year, month } = riyadhParts(date);
  return `${year}-${pad(month)}`;
}

/** 'YYYY-MM' of the month n months before (default 1) the given period */
function previousMonthStr(ym = currentMonthStr(), back = 1) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Absolute time (ms epoch) of a Riyadh local clock time, e.g. riyadhTime('2026-09-08','09:00') */
function riyadhTimeMs(dayStr, hhmm = '00:00') {
  const ms = Date.parse(`${dayStr}T${hhmm}:00Z`); // pretend it is UTC...
  return ms - 3 * 60 * 60 * 1000; // ...then subtract the +03:00 offset = Riyadh local
}

/** 'HH:mm' of an ISO timestamp, expressed in Riyadh time */
function formatClock(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** 'YYYY-MM-DD' (Riyadh) of an ISO timestamp */
function dayOf(iso) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(iso));
}

/** Whole hours between two ISO timestamps (>=0) */
function hoursBetween(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) return 0;
  const ms = new Date(isoEnd).getTime() - new Date(isoStart).getTime();
  return Math.max(0, ms / 3600000);
}

/** Is 'YYYY-MM-DD' a Friday or Saturday (the Saudi weekend)? */
function isWeekend(dayStr) {
  const dow = new Date(`${dayStr}T00:00:00Z`).getUTCDay();
  return dow === 5 || dow === 6; // Friday=5, Saturday=6
}

/** Number of days in month (year, month 1-12) */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Add n days to 'YYYY-MM-DD' and return 'YYYY-MM-DD' */
function addDays(dayStr, n) {
  const d = new Date(`${dayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** All Riyadh calendar days 'YYYY-MM-DD' in [from, to] inclusive */
function listDays(fromStr, toStr) {
  const out = [];
  let cur = fromStr;
  let guard = 0;
  while (cur <= toStr && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

/** Calendar days between two day strings, inclusive */
function daysInclusive(fromStr, toStr) {
  const ms = Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

/**
 * Working days (Sun–Thu) of a period 'YYYY-MM'. `onlyPast` limits to
 * days strictly before today when run against the current month.
 */
function listWorkingDays(ym, onlyPast = false) {
  const [y, m] = ym.split('-').map(Number);
  const out = [];
  const total = daysInMonth(y, m);
  const today = todayStr();
  for (let d = 1; d <= total; d += 1) {
    const day = `${y}-${pad(m)}-${pad(d)}`;
    if (isWeekend(day)) continue;
    if (onlyPast && day >= today) continue;
    out.push(day);
  }
  return out;
}

/** 1-based index of day of week for 'YYYY-MM-DD' (1=Mon..7=Sun) */
function weekday(dayStr) {
  return new Date(`${dayStr}T00:00:00Z`).getUTCDay(); // 0=Sun
}

module.exports = {
  TIMEZONE,
  pad,
  riyadhParts,
  todayStr,
  currentMonthStr,
  previousMonthStr,
  monthLabel,
  riyadhTimeMs,
  formatClock,
  dayOf,
  hoursBetween,
  isWeekend,
  daysInMonth,
  addDays,
  listDays,
  daysInclusive,
  listWorkingDays,
  weekday,
};
