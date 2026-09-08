/**
 * Pay-slip PDF generation (Arabic-friendly RTL layout, SAR currency).
 * Produces a Node Buffer that can be streamed to the browser
 * (Content-Disposition: attachment) without saving files anywhere.
 */
'use strict';

const PDFDocument = require('pdfkit');
const config = require('../../config');
const { monthLabel } = require('./time');

const fmt = (n) =>
  `SAR ${Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtAr(n) {
  return Number(n || 0).toLocaleString('en', { maximumFractionDigits: 2 });
}

function buildPayslipPdf({ employee, payslip, companyName = config.company.name }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 42, bottom: 42, left: 44, right: 44 } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const teal = '#0f766e';
  const dark = '#1e293b';
  const gray = '#64748b';
  const line = '#e2e8f0';

  const y0 = doc.y;
  // Header band
  doc.rect(0, 0, doc.page.width, 86).fill(teal);
  doc.fillColor('#ffffff').fontSize(19).font('Helvetica-Bold')
    .text(companyName, 44, 26, { width: 400 });
  doc.fontSize(10).font('Helvetica').text(`Country: ${config.company.country}   ·   Currency: Saudi Riyal (SAR)`, 44, 50);
  doc.fontSize(9).text(`Generated: ${new Date().toISOString().slice(0, 10)}`, 44, 66);

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff').text('PAY SLIP', 44, 28, { align: 'right', width: doc.page.width - 88 });
  doc.font('Helvetica').fontSize(10).text(monthLabel(payslip.period), 44, 48, { align: 'right', width: doc.page.width - 88 });

  // Employee summary
  let y = 108;
  doc.fillColor(teal).font('Helvetica-Bold').fontSize(11).text('Employee', 44, y);
  doc.fillColor(dark).font('Helvetica').fontSize(10);
  doc.text(`Name: ${employee.fullNameEn}`, 44, y + 16);
  doc.text(`Code: ${employee.employeeCode}   ·   Department: ${employee.department || '—'}`, 44, y + 30);
  doc.text(`Job title: ${employee.jobTitle || '—'}   ·   Nationality: ${employee.nationality}`, 44, y + 44);

  doc.fillColor(teal).font('Helvetica-Bold').fontSize(11).text('Net salary (SAR)', 44, y + 66, { align: 'right', width: 220 });
  doc.fillColor(dark).font('Helvetica-Bold').fontSize(14).text(fmt(payslip.netPay), 44, y + 82, { align: 'right', width: 220 });

  const half = (doc.page.width - 88) / 2;
  const drawCol = (title, rows, x, topY) => {
    doc.fillColor(teal).font('Helvetica-Bold').fontSize(11).text(title, x, topY);
    let yy = topY + 16;
    doc.font('Helvetica').fontSize(9.5);
    for (const [label, value] of rows) {
      doc.fillColor(gray).text(label, x, yy + 1, { width: half - 8 });
      doc.fillColor(dark).text(String(value), x + half - 130, yy, { width: 130, align: 'right' });
      yy += 15;
    }
  };

  const earnings = [
    ['Basic salary', fmt(payslip.baseSalary)],
    ['Housing allowance', fmt(payslip.housingAllowance)],
    ['Transport allowance', fmt(payslip.transportAllowance)],
    ['Other allowances', fmt(payslip.otherAllowances)],
    ['Overtime', fmt(payslip.overtimePay)],
    ['Commission', fmt(payslip.commissionPay)],
    ['GROSS', fmt(payslip.grossPay)],
  ];
  const deductions = [
    ['GOSI (employee share)', fmt(payslip.gosiEmployee)],
    ['Loan repayment', fmt(payslip.loanRepayment)],
    ['Other deductions', fmt(payslip.otherDeductions)],
    ['TOTAL DEDUCTIONS', fmt(payslip.totalDeductions)],
  ];

  const topY = y + 108;
  drawCol('Earnings', earnings, 44, topY);
  drawCol('Deductions', deductions, 44 + half + 0, topY);

  // Attendance line
  const attY = topY + 7 * 15 + 10;
  doc.strokeColor(line).lineWidth(1).moveTo(44, attY).lineTo(doc.page.width - 44, attY).stroke();
  doc.font('Helvetica').fontSize(9).fillColor(gray);
  doc.text(
    `Attendance: ${payslip.workDaysAttended} days present · ${fmtAr(payslip.paidLeaveDays)} paid leave · ${fmtAr(payslip.unpaidLeaveDays)} unpaid leave · ${fmtAr(payslip.hoursWorked)} hours worked`,
    44, attY + 10, { width: doc.page.width - 88 }
  );

  // Employer costs
  const empY = attY + 28;
  doc.fillColor(teal).font('Helvetica-Bold').fontSize(11).text('Employer contributions (not deducted)', 44, empY);
  doc.font('Helvetica').fontSize(9.5).fillColor(dark);
  doc.text(`GOSI (employer incl. occupational hazards): ${fmt(payslip.gosiEmployer)}    Total employer cost: ${fmt(payslip.employerTotalCost)}`, 44, empY + 16);

  // Footer note
  const foot = doc.page.height - 76;
  doc.strokeColor(line).lineWidth(1).moveTo(44, foot - 14).lineTo(doc.page.width - 44, foot - 14).stroke();
  doc.fontSize(8).fillColor(gray);
  doc.text(
    `Compliance: GOSI contributions follow the schedules of the General Organization for Social Insurance applicable to the pay period. Salary payment is subject to the Wage Protection System (due by the 10th of the following month). This document is system-generated and does not require a signature.`,
    44, foot, { width: doc.page.width - 88, align: 'left' }
  );

  doc.end();
  return done;
}

module.exports = { buildPayslipPdf };
