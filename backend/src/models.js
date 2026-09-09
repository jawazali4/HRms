'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');
const c = require('./constants');

const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'employee',
      validate: { isIn: [c.user.roles] },
    },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    employeeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Employees', key: 'id' },
    },
  },
  { tableName: 'users' }
);

// Branch / Warehouse / Factory
const Branch = sequelize.define(
  'Branch',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    nameAr: { type: DataTypes.STRING, allowNull: true },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'branch',
      validate: { isIn: [['branch', 'warehouse', 'factory', 'head_office']] },
    },
    city: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    managerId: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    // Default shift for this branch
    defaultShiftId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'branches' }
);

// Shift / Time Table
const Shift = sequelize.define(
  'Shift',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    nameAr: { type: DataTypes.STRING, allowNull: true },
    // Time in HH:mm format (Riyadh time)
    startTime: { type: DataTypes.STRING, allowNull: false, defaultValue: '08:00' }, // e.g. 08:00
    endTime: { type: DataTypes.STRING, allowNull: false, defaultValue: '17:00' }, // e.g. 17:00
    breakStart: { type: DataTypes.STRING, allowNull: true, defaultValue: '12:00' },
    breakEnd: { type: DataTypes.STRING, allowNull: true, defaultValue: '13:00' },
    workDays: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'sun_thur',
      validate: { isIn: [c.employee.workDays] },
    },
    // Grace periods in minutes
    graceIn: { type: DataTypes.INTEGER, defaultValue: 15 }, // Late grace
    graceOut: { type: DataTypes.INTEGER, defaultValue: 15 }, // Early out grace
    // Overtime
    overtimeEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    // Branch this shift belongs to
    branchId: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    color: { type: DataTypes.STRING, defaultValue: '#0f766e' },
    // Description
    description: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'shifts' }
);

const Employee = sequelize.define(
  'Employee',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employeeCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    fullNameAr: { type: DataTypes.STRING, allowNull: false },
    fullNameEn: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    phone: { type: DataTypes.STRING, allowNull: true },
    nationalId: { type: DataTypes.STRING, allowNull: true },
    nationality: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'expat',
      validate: { isIn: [c.employee.nationalityTypes] },
    },
    gosiScheme: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'systemB',
      validate: { isIn: [c.employee.gosiSchemes] },
    },
    gosiSubNo: { type: DataTypes.STRING, allowNull: true },
    hireDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'active',
      validate: { isIn: [c.employee.statuses] },
    },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'employee' },
    department: { type: DataTypes.STRING, allowNull: true },
    jobTitle: { type: DataTypes.STRING, allowNull: true },
    managerId: { type: DataTypes.INTEGER, allowNull: true },
    payType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [c.employee.payTypes] },
    },
    basicSalary: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    housingAllowance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    transportAllowance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    otherAllowances: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    hourlyRate: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    commissionRate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    iban: { type: DataTypes.STRING, allowNull: true },
    pinHash: { type: DataTypes.STRING, allowNull: true },
    workDays: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'sun_thur',
      validate: { isIn: [c.employee.workDays] },
    },
    contractType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'full_time',
      validate: { isIn: [c.employee.contracts] },
    },
    // New fields for real company use
    pictureUrl: { type: DataTypes.TEXT, allowNull: true }, // Base64 or URL
    branchId: { type: DataTypes.INTEGER, allowNull: true },
    shiftId: { type: DataTypes.INTEGER, allowNull: true },
    fingerprintId: { type: DataTypes.STRING, allowNull: true }, // ZKTeco fingerprint ID
    // Additional info
    birthDate: { type: DataTypes.DATEONLY, allowNull: true },
    gender: { type: DataTypes.STRING, allowNull: true, defaultValue: 'male' },
    maritalStatus: { type: DataTypes.STRING, allowNull: true },
    emergencyContact: { type: DataTypes.STRING, allowNull: true },
    emergencyPhone: { type: DataTypes.STRING, allowNull: true },
    // For Excel import tracking
    importBatch: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'employees' }
);

const Attendance = sequelize.define(
  'Attendance',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    clockIn: { type: DataTypes.DATE, allowNull: true },
    clockOut: { type: DataTypes.DATE, allowNull: true },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'web',
      validate: { isIn: [c.attendance.sources] },
    },
    note: { type: DataTypes.STRING, allowNull: true },
    // New fields for fingerprint and shifts
    shiftId: { type: DataTypes.INTEGER, allowNull: true },
    branchId: { type: DataTypes.INTEGER, allowNull: true },
    fingerprintData: { type: DataTypes.JSON, allowNull: true }, // Raw fingerprint data
    isLate: { type: DataTypes.BOOLEAN, defaultValue: false },
    isEarlyOut: { type: DataTypes.BOOLEAN, defaultValue: false },
    lateMinutes: { type: DataTypes.INTEGER, defaultValue: 0 },
    overtimeMinutes: { type: DataTypes.INTEGER, defaultValue: 0 },
    // For Excel import tracking
    importBatch: { type: DataTypes.STRING, allowNull: true },
    deviceId: { type: DataTypes.STRING, allowNull: true }, // ZKTeco device ID
  },
  { tableName: 'attendance', indexes: [{ unique: true, fields: ['employeeId', 'date'] }, { fields: ['date'] }, { fields: ['branchId'] }] }
);

const LeaveRequest = sequelize.define(
  'LeaveRequest',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [c.leave.types] } },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    days: { type: DataTypes.DECIMAL(6, 1), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
      validate: { isIn: [c.leave.statuses] },
    },
    approvedById: { type: DataTypes.INTEGER, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedNote: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'leave_requests' }
);

const Loan = sequelize.define(
  'Loan',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    monthlyInstallment: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    interestRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
      validate: { isIn: [c.loan.statuses] },
    },
    requestedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    approvedById: { type: DataTypes.INTEGER, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    startMonth: { type: DataTypes.STRING, allowNull: true },
    months: { type: DataTypes.INTEGER, allowNull: true },
    remainingAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    paidMonths: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: 'loans' }
);

const Payslip = sequelize.define(
  'Payslip',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.STRING, allowNull: false },
    baseSalary: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    housingAllowance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    transportAllowance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    otherAllowances: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    overtimePay: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    commissionPay: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    grossPay: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    gosiEmployee: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    loanRepayment: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    otherDeductions: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    totalDeductions: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    netPay: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    gosiEmployer: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    employerTotalCost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    workDaysAttended: { type: DataTypes.INTEGER, defaultValue: 0 },
    workDaysExpected: { type: DataTypes.INTEGER, defaultValue: 0 },
    paidLeaveDays: { type: DataTypes.DECIMAL(6, 1), defaultValue: 0 },
    unpaidLeaveDays: { type: DataTypes.DECIMAL(6, 1), defaultValue: 0 },
    hoursWorked: { type: DataTypes.DECIMAL(8, 1), defaultValue: 0 },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'draft',
      validate: { isIn: [c.payroll.statuses] },
    },
    emailedAt: { type: DataTypes.DATE, allowNull: true },
    emailStatus: { type: DataTypes.STRING, allowNull: true },
    pdfUrl: { type: DataTypes.STRING, allowNull: true },
    json: { type: DataTypes.JSON, allowNull: true },
  },
  { tableName: 'payslips', indexes: [{ unique: true, fields: ['employeeId', 'period'] }] }
);

const Asset = sequelize.define(
  'Asset',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    assetCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
    brand: { type: DataTypes.STRING, allowNull: true },
    serialNumber: { type: DataTypes.STRING, allowNull: true },
    purchaseDate: { type: DataTypes.DATEONLY, allowNull: true },
    purchasePrice: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'available',
      validate: { isIn: [c.asset.statuses] },
    },
    assignedToId: { type: DataTypes.INTEGER, allowNull: true },
    assignedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    branchId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'assets' }
);

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    actor: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING, allowNull: false },
    entity: { type: DataTypes.STRING, allowNull: true },
    entityId: { type: DataTypes.INTEGER, allowNull: true },
    meta: { type: DataTypes.JSON, allowNull: true },
  },
  { tableName: 'audit_logs' }
);

const SalesCommission = sequelize.define(
  'SalesCommission',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.STRING, allowNull: false },
    salesAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    commissionRate: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    description: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'sales_commissions' }
);

// Associations
Employee.belongsTo(Employee, { as: 'Manager', foreignKey: 'managerId' });
Employee.belongsTo(Branch, { as: 'branch', foreignKey: 'branchId' });
Employee.belongsTo(Shift, { as: 'shift', foreignKey: 'shiftId' });

Branch.belongsTo(Employee, { as: 'manager', foreignKey: 'managerId' });
Branch.belongsTo(Shift, { as: 'defaultShift', foreignKey: 'defaultShiftId' });
Branch.hasMany(Employee, { foreignKey: 'branchId', as: 'employees' });
Branch.hasMany(Shift, { foreignKey: 'branchId', as: 'shifts' });

Shift.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
Shift.hasMany(Employee, { foreignKey: 'shiftId', as: 'employees' });
Shift.hasMany(Attendance, { foreignKey: 'shiftId', as: 'attendances' });

User.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasOne(User, { foreignKey: 'employeeId' });

Payslip.belongsTo(Employee, { as: 'employee', foreignKey: 'employeeId' });
Loan.belongsTo(Employee, { as: 'employee', foreignKey: 'employeeId' });
Attendance.belongsTo(Employee, { as: 'employee', foreignKey: 'employeeId' });
Attendance.belongsTo(Shift, { as: 'shift', foreignKey: 'shiftId' });
Attendance.belongsTo(Branch, { as: 'branch', foreignKey: 'branchId' });
LeaveRequest.belongsTo(Employee, { as: 'employee', foreignKey: 'employeeId' });
Asset.belongsTo(Employee, { as: 'assignedTo', foreignKey: 'assignedToId' });
Asset.belongsTo(Branch, { as: 'branch', foreignKey: 'branchId' });
LeaveRequest.belongsTo(User, { as: 'approver', foreignKey: 'approvedById' });
Loan.belongsTo(User, { as: 'approver', foreignKey: 'approvedById' });

module.exports = {
  sequelize,
  User,
  Employee,
  Branch,
  Shift,
  Attendance,
  LeaveRequest,
  Loan,
  Payslip,
  Asset,
  AuditLog,
  SalesCommission,
};
