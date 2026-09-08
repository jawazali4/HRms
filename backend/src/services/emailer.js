/**
 * Email delivery for pay slips.
 *
 * Designed to never crash payroll when email is not configured: if
 * SMTP settings are empty the service reports { disabled: true } and
 * pay slips simply are not emailed (they remain visible in the
 * employee dashboard and downloadable as PDF).
 *
 * Free option used in the guide: a Gmail account + "App Password".
 */
'use strict';

const nodemailer = require('nodemailer');
const config = require('../../config');

let transporter = null;
let lastError = null;

function isConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

/**
 * Send an email. `opts`: { to, subject, text, html, attachments }
 * Returns { ok, disabled, error } — never throws.
 */
async function sendMail(opts) {
  if (!isConfigured()) {
    return { ok: false, disabled: true, message: 'Email is not configured (SMTP settings empty).' };
  }
  try {
    const info = await getTransporter().sendMail({
      from: config.smtp.from || `"${config.company.name}" <${config.smtp.user}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments || [],
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    lastError = err.message;
    return { ok: false, disabled: false, error: err.message };
  }
}

/** HTML body for a pay-slip email. */
function payslipEmailHtml({ employee, payslip, company, monthName }) {
  const rows = [
    ['Net salary', payslip.netPay],
    ['Basic salary', payslip.baseSalary],
    ['Housing allowance', payslip.housingAllowance],
    ['Transport allowance', payslip.transportAllowance],
    ['Overtime', payslip.overtimePay],
    ['Commission', payslip.commissionPay],
    ['GOSI (employee)', `- ${payslip.gosiEmployee}`],
    ['Loan repayment', `- ${payslip.loanRepayment}`],
  ];
  const rowHtml = rows
    .filter(([, v]) => Number(v) !== 0)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555">${label}</td>
         <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">SAR ${Number(value).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`
    )
    .join('');
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e3e3e3;border-radius:12px;overflow:hidden">
    <div style="background:#0f766e;color:#fff;padding:18px 22px">
      <div style="font-size:18px;font-weight:bold">${company.name}</div>
      <div style="font-size:12px;opacity:.9">Pay slip — ${monthName}</div>
    </div>
    <div style="padding:22px">
      <p style="margin:0 0 14px;color:#333">Assalamu alaikum ${employee.fullNameEn},</p>
      <p style="margin:0 0 14px;color:#333">Your salary for <b>${monthName}</b> has been processed. Your net salary of
        <b style="font-size:17px">SAR ${Number(payslip.netPay).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
        will be transferred to your registered bank account.</p>
      <table style="width:100%;border-collapse:collapse;margin:10px 0 16px;border:1px solid #eee;border-radius:8px">${rowHtml}</table>
      <p style="color:#777;font-size:12px">You can view and download this pay slip as PDF at any time from your HRMS dashboard.</p>
    </div>
    <div style="background:#f7f7f7;padding:10px 22px;font-size:11px;color:#999">This is an automated message — please do not reply.</div>
  </div>`;
}

module.exports = { sendMail, isConfigured, payslipEmailHtml };
