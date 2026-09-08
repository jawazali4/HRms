'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');
const c = require('./constants');

/** Encrypted-password holder. Employee/User records created from the
 *  same person share one login account via `authUserId`. */
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

const Employee = sequelize.define(
  'Employee',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employeeCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    fullNameAr: { type: DataTypes.STRING, allowNull: false },
    fullNameEn: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    phone: { type: DataTypes.STRING, allowNull: true },
    nationalId: { type: DataTypes.STRING, allowNull: true }, // Saudi national ID / Iqama
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
    gosiSubNo: { type: DataTypes.STRING, allowNull: true }, // GOSI subscription number
    hireDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'active',
      validate: { isIn: [c.employee.statuses] },
    },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'employee' }, // access role
    department: { type: DataTypes.STRING, allowNull: true },
    jobTitle: { type: DataTypes.STRING, allowNull: true },
    managerId: { type: DataTypes.INTEGER, allowNull: true }, // who this person reports to
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
    commissionRate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 }, // % of sales
    iban: { type: DataTypes.STRING, allowNull: true },
    pinHash: { type: DataTypes.STRING, allowNull: true }, // kiosk clock in/out PIN (employee code + PIN)
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
  },
  { tableName: 'employees' }
);

const Attendance = sequelize.define(
  'Attendance',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false }, // Riyadh date
    clockIn: { type: DataTypes.DATE, allowNull: true },
    clockOut: { type: DataTypes.DATE, allowNull: true },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'web',
      validate: { isIn: [c.attendance.sources] },
    },
    note: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'attendance', indexes: [{ unique: true, fields: ['employeeId', 'date'] }] }
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
    interestRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 }, // % — Islamic companies use 0
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
    startMonth: { type: DataTypes.STRING, allowNull: true }, // 'YYYY-MM' first deduction
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
    period: { type: DataTypes.STRING, allowNull: false }, // 'YYYY-MM'
    // earnings
    baseSalary: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    housingAllowance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    transportAllowance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    otherAllowances: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    overtimePay: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    commissionPay: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    grossPay: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    // deductions
    gosiEmployee: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    loanRepayment: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    otherDeductions: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    totalDeductions: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    netPay: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    // employer costs (reporting)
    gosiEmployer: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    employerTotalCost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    // context
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
    emailStatus: { type: DataTypes.STRING, allowNull: true }, // sent | failed | disabled
    pdfUrl: { type: DataTypes.STRING, allowNull: true },
    json: { type: DataTypes.JSON, allowNull: true }, // full breakdown snapshot
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
  },
  { tableName: 'assets' }
);

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    actor: { type: DataTypes.STRING, allowNull: true }, // email or 'kiosk:EMP-001'
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
    period: { type: DataTypes.STRING, allowNull: false }, // 'YYYY-MM'
    salesAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    commissionRate: { type: DataTypes.DECIMAL(5, 2), allowNull: true }, // override % if set
    description: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'sales_commissions' }
);

// ---------------- associations (must come after all definitions) ----------------
Employee.belongsTo(Employee, { as: 'Manager', foreignKey: 'managerId' });
User.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasOne(User, { foreignKey: 'employeeId' });
Payslip.belongsTo(Employee, { as: 'employee', foreignKey: 'employeeId' });
Loan.belongsTo(Employee, { as: 'employee', foreignKey: 'employeeId' });
Attendance.belongsTo(Employee, { as: 'employee', foreignKey: 'employeeId' });
LeaveRequest.belongsTo(Employee, { as: 'employee', foreignKey: 'employeeId' });
Asset.belongsTo(Employee, { as: 'assignedTo', foreignKey: 'assignedToId' });
LeaveRequest.belongsTo(User, { as: 'approver', foreignKey: 'approvedById' });
Loan.belongsTo(User, { as: 'approver', foreignKey: 'approvedById' });

module.exports = {
  sequelize,
  User,
  Employee,
  Attendance,
  LeaveRequest,
  Loan,
  Payslip,
  Asset,
  AuditLog,
  SalesCommission,
};
