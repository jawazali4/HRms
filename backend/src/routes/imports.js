'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Op } = require('sequelize');
const { Employee, User, Attendance, Branch, Shift } = require('../models');
const { authRequired, ah, requireRole, audit, badRequest } = require('../middleware/auth');
const { hashPasswordSync, hashPin } = require('../services/passwords');

const HR = requireRole('hr', 'admin');

// Configure multer for file uploads - use memory storage for serverless compatibility
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) and CSV (.csv) are allowed'));
    }
  },
});

// Helper to parse Excel file from buffer
function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return data;
}

// Helper to convert Excel data to objects (first row as headers)
function excelToObjects(data) {
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0 || row.every(c => !String(c).trim())) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) obj[headers[j]] = row[j];
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * POST /api/imports/employees/excel - Import employees from Excel
 * Expected columns: employeeCode, fullNameEn, fullNameAr, email, phone, department, jobTitle, hireDate, basicSalary, etc.
 */
router.post(
  '/employees/excel',
  authRequired,
  HR,
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) return badRequest(res, 'No file uploaded');

    let data;
    try {
      data = parseExcelBuffer(req.file.buffer);
    } catch (e) {
      return badRequest(res, `Failed to parse Excel file: ${e.message}`);
    }

    const rows = excelToObjects(data);
    if (rows.length === 0) return badRequest(res, 'Excel file is empty or has no valid data');

    const results = { total: rows.length, created: 0, updated: 0, errors: [], imported: [] };
    const batchId = `import_${Date.now()}`;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel row number (1-indexed + header)
      try {
        // Map common column variations
        const getField = (...keys) => {
          for (const k of keys) {
            const lowerKeys = [k.toLowerCase(), k.toLowerCase().replace(/[^a-z0-9]/g, ''), k.toLowerCase().replace(/_/g, '')];
            for (const lk of lowerKeys) {
              if (row[lk] !== undefined && String(row[lk]).trim() !== '') return String(row[lk]).trim();
              // Also check with spaces
              const foundKey = Object.keys(row).find(rk => rk.replace(/[^a-z0-9]/g, '') === lk.replace(/[^a-z0-9]/g, ''));
              if (foundKey && String(row[foundKey]).trim() !== '') return String(row[foundKey]).trim();
            }
          }
          return null;
        };

        const employeeCode = getField('employeeCode', 'code', 'emp_code', 'employee_code', 'id');
        const fullNameEn = getField('fullNameEn', 'name_en', 'english_name', 'full_name_en', 'name', 'full_name');
        const fullNameAr = getField('fullNameAr', 'name_ar', 'arabic_name', 'full_name_ar') || fullNameEn;
        const email = getField('email', 'work_email', 'email_address');
        const phone = getField('phone', 'mobile', 'phone_number');
        const department = getField('department', 'dept', 'section');
        const jobTitle = getField('jobTitle', 'job_title', 'position', 'title');
        const hireDate = getField('hireDate', 'hire_date', 'joining_date', 'join_date');
        const basicSalary = getField('basicSalary', 'basic_salary', 'salary');
        const branchCode = getField('branch', 'branchCode', 'branch_code', 'location');
        const shiftCode = getField('shift', 'shiftCode', 'shift_code', 'timetable');
        const role = getField('role', 'user_role') || 'employee';
        const nationalId = getField('nationalId', 'national_id', 'iqama', 'id_number');
        const fingerprintId = getField('fingerprintId', 'fingerprint_id', 'fp_id', 'zk_id');

        if (!fullNameEn || !email) {
          results.errors.push({ row: rowNum, error: 'Missing required fields: fullNameEn and email', data: row });
          continue;
        }

        // Find branch and shift by code if provided
        let branchId = null;
        if (branchCode) {
          const branch = await Branch.findOne({ where: { code: branchCode.toUpperCase() } });
          if (branch) branchId = branch.id;
        }

        let shiftId = null;
        if (shiftCode) {
          const shift = await Shift.findOne({ where: { code: shiftCode.toUpperCase() } });
          if (shift) shiftId = shift.id;
        }

        // Check if employee exists
        let employee = null;
        if (employeeCode) {
          employee = await Employee.findOne({ where: { employeeCode: employeeCode.toUpperCase() } });
        }
        if (!employee && email) {
          employee = await Employee.findOne({ where: { email: email.toLowerCase() } });
        }

        const employeeData = {
          fullNameAr: fullNameAr || fullNameEn,
          fullNameEn,
          email: email.toLowerCase(),
          phone: phone || null,
          department: department || null,
          jobTitle: jobTitle || null,
          hireDate: hireDate || new Date().toISOString().slice(0, 10),
          basicSalary: basicSalary ? Number(basicSalary) : 0,
          role: ['employee', 'manager', 'hr', 'admin'].includes(role.toLowerCase()) ? role.toLowerCase() : 'employee',
          branchId,
          shiftId,
          nationalId: nationalId || null,
          fingerprintId: fingerprintId || null,
          importBatch: batchId,
          payType: 'salaried',
          status: 'active',
          nationality: 'saudi',
          gosiScheme: 'systemB',
          pinHash: hashPin('1234'),
        };

        if (employee) {
          await employee.update(employeeData);
          results.updated++;
          results.imported.push({ row: rowNum, action: 'updated', code: employee.employeeCode, name: employee.fullNameEn });
        } else {
          // Generate code if not provided
          if (!employeeCode) {
            const last = await Employee.findOne({ order: [['id', 'DESC']], attributes: ['employeeCode'] });
            const n = last ? parseInt(String(last.employeeCode).replace(/\D/g, ''), 10) || 1000 : 1000;
            employeeData.employeeCode = `EMP-${String(n + 1 + results.created).padStart(3, '0')}`;
          } else {
            employeeData.employeeCode = employeeCode.toUpperCase();
          }

          const newEmp = await Employee.create(employeeData);
          
          // Create user account
          const existingUser = await User.findOne({ where: { email: employeeData.email } });
          if (!existingUser) {
            await User.create({
              email: employeeData.email,
              passwordHash: hashPasswordSync('Demo@1234'),
              role: employeeData.role,
              employeeId: newEmp.id,
              isActive: true,
            });
          }

          results.created++;
          results.imported.push({ row: rowNum, action: 'created', code: newEmp.employeeCode, name: newEmp.fullNameEn });
        }
      } catch (err) {
        results.errors.push({ row: rowNum, error: err.message, data: row });
      }
    }

    await audit({ req, action: 'import', entity: 'Employee', meta: { batchId, ...results, file: req.file.originalname } });

    res.json({
      ok: true,
      message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`,
      results,
    });
  })
);

/**
 * POST /api/imports/attendance/zkteco - Import attendance from ZKTeco Excel
 * ZKTeco typical columns: Employee ID, Name, Date, Time, Check Type, Device, etc.
 * Supports various ZKTeco export formats
 */
router.post(
  '/attendance/zkteco',
  authRequired,
  HR,
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) return badRequest(res, 'No file uploaded');

    let data;
    try {
      data = parseExcelBuffer(req.file.buffer);
    } catch (e) {
      return badRequest(res, `Failed to parse Excel file: ${e.message}`);
    }

    const rows = excelToObjects(data);
    if (rows.length === 0) return badRequest(res, 'Excel file is empty');

    const results = { total: rows.length, imported: 0, updated: 0, errors: [], records: [] };
    const batchId = `zkteco_${Date.now()}`;

    // Group by employee and date to create clockIn/clockOut pairs
    const grouped = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const getField = (...keys) => {
          for (const k of keys) {
            const lowerKeys = [k.toLowerCase()];
            for (const lk of lowerKeys) {
              if (row[lk] !== undefined && String(row[lk]).trim() !== '') return String(row[lk]).trim();
              const foundKey = Object.keys(row).find(rk => rk.toLowerCase().replace(/[^a-z0-9]/g, '').includes(lk.replace(/[^a-z0-9]/g, '')));
              if (foundKey && String(row[foundKey]).trim() !== '') return String(row[foundKey]).trim();
            }
          }
          return null;
        };

        // Try various ZKTeco column names
        const empCode = getField('employee_id', 'emp_code', 'employee_code', 'id', 'userid', 'user_id', 'badgenumber', 'enrollnumber');
        const empName = getField('name', 'employee_name', 'full_name');
        const dateStr = getField('date', 'check_date', 'attendance_date', 'work_date');
        const timeStr = getField('time', 'check_time', 'clock_time', 'punch_time');
        const dateTimeStr = getField('datetime', 'check_datetime', 'punch_datetime', 'timestamp');
        const checkType = getField('check_type', 'type', 'state', 'punch_type', 'in_out', 'checktype');
        const deviceId = getField('device', 'device_id', 'terminal', 'machine');

        // Parse date and time
        let date, time;
        if (dateTimeStr) {
          // Combined datetime
          const dt = new Date(dateTimeStr);
          if (!isNaN(dt.getTime())) {
            date = dt.toISOString().slice(0, 10);
            time = dt.toTimeString().slice(0, 5);
          }
        } else if (dateStr) {
          date = dateStr;
          // Try to parse date
          if (date.includes('/')) {
            const parts = date.split('/');
            if (parts.length === 3) {
              // Assume MM/DD/YYYY or DD/MM/YYYY - try to detect
              if (parts[0].length === 4) date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
              else if (parts[2].length === 4) {
                // Check if first part >12, then DD/MM/YYYY
                const first = parseInt(parts[0]);
                if (first > 12) date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                else date = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
              }
            }
          }
          if (timeStr) time = timeStr;
          else time = '08:00'; // Default
        } else {
          results.errors.push({ row: rowNum, error: 'Missing date', data: row });
          continue;
        }

        if (!empCode) {
          results.errors.push({ row: rowNum, error: 'Missing employee ID', data: row });
          continue;
        }

        // Find employee by code or fingerprint ID
        let employee = await Employee.findOne({
          where: {
            [Op.or]: [
              { employeeCode: empCode.toUpperCase() },
              { fingerprintId: empCode },
              { email: { [Op.like]: `%${empCode}%` } },
            ],
          },
        });

        // If not found by code, try by name
        if (!employee && empName) {
          employee = await Employee.findOne({
            where: {
              [Op.or]: [
                { fullNameEn: { [Op.like]: `%${empName}%` } },
                { fullNameAr: { [Op.like]: `%${empName}%` } },
              ],
            },
          });
        }

        if (!employee) {
          results.errors.push({ row: rowNum, error: `Employee not found: ${empCode} (${empName || 'no name'})`, data: row });
          continue;
        }

        const key = `${employee.id}_${date}`;
        if (!grouped[key]) grouped[key] = { employeeId: employee.id, date, times: [], deviceId, raw: [] };
        grouped[key].times.push(time);
        grouped[key].raw.push(row);
        if (checkType) grouped[key].raw[0].checkType = checkType;
      } catch (err) {
        results.errors.push({ row: rowNum, error: err.message, data: row });
      }
    }

    // Now create attendance records from grouped data
    for (const key of Object.keys(grouped)) {
      const group = grouped[key];
      try {
        const sortedTimes = group.times.sort();
        const clockInTime = sortedTimes[0];
        const clockOutTime = sortedTimes.length > 1 ? sortedTimes[sortedTimes.length - 1] : null;

        // Convert to ISO datetime (Riyadh is UTC+3)
        const clockIn = clockInTime ? new Date(`${group.date}T${clockInTime}:00+03:00`).toISOString() : null;
        const clockOut = clockOutTime ? new Date(`${group.date}T${clockOutTime}:00+03:00`).toISOString() : null;

        // Find existing attendance
        let attendance = await Attendance.findOne({
          where: { employeeId: group.employeeId, date: group.date },
        });

        const attendanceData = {
          employeeId: group.employeeId,
          date: group.date,
          clockIn: clockIn || (attendance ? attendance.clockIn : null),
          clockOut: clockOut || (attendance ? attendance.clockOut : null),
          source: 'zkteco',
          note: `Imported from ZKTeco - ${group.times.length} punches`,
          importBatch: batchId,
          deviceId: group.deviceId || 'zkteco',
          fingerprintData: group.raw,
        };

        // Calculate late/early if employee has shift
        const employee = await Employee.findByPk(group.employeeId, { include: [{ model: Shift, as: 'shift' }] });
        if (employee && employee.shift && clockIn) {
          const shiftStart = employee.shift.startTime; // HH:mm
          const [shH, shM] = shiftStart.split(':').map(Number);
          const [clH, clM] = clockInTime.split(':').map(Number);
          const shiftMinutes = shH * 60 + shM;
          const clockMinutes = clH * 60 + clM;
          const diff = clockMinutes - shiftMinutes;
          if (diff > (employee.shift.graceIn || 15)) {
            attendanceData.isLate = true;
            attendanceData.lateMinutes = diff;
          }
        }

        if (attendance) {
          await attendance.update(attendanceData);
          results.updated++;
        } else {
          await Attendance.create(attendanceData);
          results.imported++;
        }

        results.records.push({ employeeId: group.employeeId, date: group.date, clockIn: clockInTime, clockOut: clockOutTime });
      } catch (err) {
        results.errors.push({ key, error: err.message, data: group });
      }
    }

    await audit({ req, action: 'import', entity: 'Attendance', meta: { batchId, type: 'zkteco', ...results, file: req.file.originalname } });

    res.json({
      ok: true,
      message: `ZKTeco import completed: ${results.imported} new, ${results.updated} updated, ${results.errors.length} errors`,
      results,
    });
  })
);

/**
 * GET /api/imports/template/employees - Download employee import template
 */
router.get(
  '/template/employees',
  authRequired,
  HR,
  ah(async (req, res) => {
    const template = [
      ['employeeCode', 'fullNameEn', 'fullNameAr', 'email', 'phone', 'department', 'jobTitle', 'hireDate', 'basicSalary', 'branchCode', 'shiftCode', 'role', 'nationalId', 'fingerprintId'],
      ['EMP-101', 'Ahmed Mohammed', 'أحمد محمد', 'ahmed@company.sa', '+966500000001', 'Sales', 'Sales Executive', '2023-01-15', '8000', 'BR-RUH-01', 'SHIFT-MORNING', 'employee', '1234567890', '1001'],
      ['EMP-102', 'Sara Ali', 'سارة علي', 'sara@company.sa', '+966500000002', 'HR', 'HR Specialist', '2022-03-10', '9000', 'BR-JED-01', 'SHIFT-MORNING', 'hr', '1234567891', '1002'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.xlsx"');
    res.send(buffer);
  })
);

/**
 * GET /api/imports/template/zkteco - Download ZKTeco import template
 */
router.get(
  '/template/zkteco',
  authRequired,
  HR,
  ah(async (req, res) => {
    const template = [
      ['Employee ID', 'Name', 'Date', 'Time', 'Check Type', 'Device'],
      ['EMP-001', 'Ahmed Mohammed', '2024-01-15', '08:05', 'Check In', 'Device-01'],
      ['EMP-001', 'Ahmed Mohammed', '2024-01-15', '17:30', 'Check Out', 'Device-01'],
      ['EMP-002', 'Sara Ali', '2024-01-15', '08:10', 'Check In', 'Device-01'],
      ['EMP-002', 'Sara Ali', '2024-01-15', '17:00', 'Check Out', 'Device-01'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ZKTeco Attendance');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="zkteco_import_template.xlsx"');
    res.send(buffer);
  })
);

module.exports = router;
