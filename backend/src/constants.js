'use strict';

module.exports = {
  user: {
    roles: ['employee', 'manager', 'hr', 'admin'],
  },
  employee: {
    payTypes: ['salaried', 'hourly', 'commission'],
    nationalityTypes: ['saudi', 'gcc', 'expat'],
    gosiSchemes: ['systemB', 'systemA', 'none'],
    statuses: ['active', 'on_leave', 'terminated'],
    contracts: ['full_time', 'part_time'],
    workDays: ['sun_thur', 'sun_fri', 'sat_fri', 'mon_fri'],
  },
  attendance: {
    sources: ['kiosk', 'mobile', 'web', 'manual'],
    statuses: ['open', 'closed'],
  },
  loan: {
    statuses: ['pending', 'approved', 'rejected', 'active', 'settled', 'cancelled'],
  },
  leave: {
    types: ['annual', 'sick', 'unpaid', 'maternity', 'hajj'],
    statuses: ['pending', 'approved', 'rejected', 'cancelled'],
  },
  payroll: {
    statuses: ['draft', 'approved', 'paid'],
  },
  asset: {
    statuses: ['available', 'assigned', 'maintenance', 'retired'],
  },
  audit: {
    actions: ['create', 'update', 'delete', 'approve', 'reject', 'login', 'logout', 'clock_in', 'clock_out', 'payroll_run', 'payslip_email', 'pdf_export'],
  },
};
