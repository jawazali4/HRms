'use strict';

module.exports = {
  user: {
    roles: ['employee', 'manager', 'hr', 'admin'],
  },
  employee: {
    payTypes: ['salaried', 'hourly', 'commission'],
    nationalityTypes: ['saudi', 'gcc', 'expat'],
    gosiSchemes: ['systemB', 'systemA', 'none'],
    statuses: ['active', 'on_leave', 'terminated', 'probation', 'resigned'],
    contracts: ['full_time', 'part_time', 'contract', 'temporary'],
    workDays: ['sun_thur', 'sun_fri', 'sat_fri', 'mon_fri', 'sat_thu', 'sun_sat', 'custom'],
    genders: ['male', 'female'],
  },
  branch: {
    types: ['branch', 'warehouse', 'factory', 'head_office'],
  },
  attendance: {
    sources: ['kiosk', 'mobile', 'web', 'manual', 'fingerprint', 'excel_import', 'zkteco'],
    statuses: ['open', 'closed'],
  },
  loan: {
    statuses: ['pending', 'approved', 'rejected', 'active', 'settled', 'cancelled'],
  },
  leave: {
    types: ['annual', 'sick', 'unpaid', 'maternity', 'hajj', 'paternity', 'bereavement', 'emergency'],
    statuses: ['pending', 'approved', 'rejected', 'cancelled'],
  },
  payroll: {
    statuses: ['draft', 'approved', 'paid'],
  },
  asset: {
    statuses: ['available', 'assigned', 'maintenance', 'retired', 'lost'],
  },
  audit: {
    actions: ['create', 'update', 'delete', 'approve', 'reject', 'login', 'logout', 'clock_in', 'clock_out', 'payroll_run', 'payslip_email', 'pdf_export', 'import', 'bulk_delete'],
  },
};
