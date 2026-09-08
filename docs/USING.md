# 🧭 Using the HRMS — a guided tour

Everything here works on your deployed site. Demo password for every account: **`Demo@1234`**.
All times are Riyadh time (Asia/Riyadh, GMT+3).

---

## 1. The three roles (and what each one can see)

| | 👷 Employee | 👨‍💼 Manager | 👩‍💼 HR / Admin |
|---|---|---|---|
| **Employees page** | Only their own card | Their team + themselves | Everyone (incl. salaries) |
| **Attendance** | Own clock in/out history | Team's records | Everyone's + manual fixes |
| **Leave** | Request own leave, see own balance | Approve **team** requests | Approve anyone |
| **Loans** | Apply, follow own loan | Approve team loans | Approve anyone, cancel |
| **Payroll** | Only in **My Profile**: own pay slips + PDF | None (reports page shows team totals) | Run payroll, finalize, email, PDF |
| **Reports** | Attendance summary | Team attendance + payroll registers | Everything + EOSB estimates |
| **Assets** | Assets assigned to them | Team's assets | Register / assign anything |

The system also **enforces** these limits behind the scenes: an employee who tries to open
another employee's record gets a "403 — not allowed" error, and a manager cannot approve a
request from someone outside their team.

### Try this in 2 minutes (role test)
1. Sign in as **noura@alnoor.sa**. Employees ▸ she sees one card — herself.
   Try opening `…/employees/2` directly in the address bar → blocked.
2. Sign out. Sign in as **khalid@alnoor.sa** (manager). Employees ▸ he sees 5 people
   (himself + his team). Go to **Leave** — pending requests from his team show
   **Approve / Reject** buttons.
3. Sign out. Sign in as **ahlam@alnoor.sa** (HR). Employees ▸ she sees all 6 with monthly
   wages. **Payroll & Slips** appears in the menu — only for HR.

---

## 2. Attendance — clock in/out from three different places

The system accepts the **same** clock in/out from any device; everything lands in one place
and each employee has at most **one record per day**.

### a) Web browser (desktop or phone browser)
Dashboard ▸ **Clock in**. When you leave, press **Clock out**. A big green message confirms
with the exact time. The Attendance page then shows your full history.

### b) Mobile phone (as an "app")
Open your site link in Chrome/Safari on the phone, sign in, then:
- **Android:** menu ▸ *Add to Home screen* ▸ *Install app*.
- **iPhone:** *Share ▸ Add to Home Screen*.
The HRMS opens like a normal app (it is a PWA). Use Dashboard ▸ Clock in/out.
*(A custom mobile app for the App Store is not included — companies typically use the
browser app or the kiosk for the office.)*

### c) Physical kiosk machine at the office door
On any tablet/PC at reception, open your site link and choose the **Clock-In Kiosk**
screen (it does not need a login). An employee:
1. Taps their **name** on the screen.
2. Types their 4-digit **PIN** (demo: `1234`).
3. Presses the big **Clock IN** (arrival) or **Clock OUT** (leaving) button.

The screen confirms with their name and the time. Wrong PINs are limited — after several
mistakes the screen locks that employee out for 15 minutes (security).

### d) Manager / HR corrections
Attendance ▸ **Manual entry** (HR only): fix a forgotten clock-in, add a day, or delete a
wrong record. One entry per employee per day — entering twice simply updates it.

---

## 3. Leave — Saudi Labour Law built in

The balances follow Articles 109 & 117:
- **Annual:** 21 paid calendar days/year; 30 after 5 years of continuous service.
  Days accrue day by day within your "leave year".
- **Sick:** up to 120 days/year — first 30 fully paid, next 60 at 75%, last 30 unpaid.
- **Unpaid:** max 10 days/year with approval.
- **Maternity:** company policy (default 10 weeks, changeable in the code by HR admin).

**To request leave:** Leave ▸ **+ Request leave** ▸ pick type, dates, reason ▸ submit.
The system blocks overlapping requests and requests beyond your remaining balance, and
explains why in plain words. **Approvals:** pending requests appear to the employee's manager
and to HR with Approve/Reject buttons.

> 💡 HR can also file a request *on behalf of* an employee (dropdown "For employee") — handy
> when someone calls by phone.

---

## 4. Payroll — running salaries with GOSI

**Who:** HR only. **Where:** the **Payroll & Slips** page.

### The recommended monthly routine
1. **Before the 5th of the month** — make sure attendance and leaves for last month are
   complete (HR can correct them on the Attendance page).
2. Pick the month (top-right date box), e.g. **2026-08**.
3. Click **1 · Run payroll**. The engine calculates every employee in seconds:
   - *Salaried* — full monthly wage, minus unpaid leave days & unexcused absences,
     plus overtime at 150% (200% on rest days).
   - *Hourly* — clocked hours × hourly rate + paid leave days + overtime.
   - *Commission* — base + housing + sales commission % + overtime.
   - Everyone: **GOSI** deduction for Saudi employees (System A 9.75% / System B 10.75% in
     2026 of basic+housing, capped at SAR 45,000); expats pay no GOSI and the employer pays
     the 2% occupational-hazards charge. Loans deduct their monthly installment.
4. Review the table (Gross / GOSI / Loan / Net). Click a row for the full breakdown —
   attendance, leave days, employer GOSI, notes for that person.
5. Click **2 · Finalize & email slips**. Every employee's pay slip is now **final**
   (locked), **emailed** to them (if email is set up), and **visible** in their dashboard
   and profile as **PDF download**.

### The numbers you should see for August 2026 (sanity check)

| Employee | Type | Gross | GOSI (emp) | Loan | Net | What proves the logic |
|---|---|---|---|---|---|---|
| Ahlam EMP-001 | salaried, Saudi A | 14,500.00 | 1,365.00 | – | 13,135.00 | GOSI 9.75% of 14,000 |
| Khalid EMP-002 | salaried, Saudi A | 21,262.50 | 1,950.00 | – | 19,312.50 | 12 paid annual days + 6 h OT @150% |
| Sara EMP-003 | hourly, expat | 8,055.00 | 0 | – | 8,055.00 | 178 h × 45 + OT; no GOSI (expat) |
| Omar EMP-004 | commission, Saudi B | 10,075.00 | 645.00 | – | 9,430.00 | 50,000 sales × 8% + OT |
| Noura EMP-005 | salaried, Saudi B | 12,566.67 | 1,290.00 | 1,000 | 10,276.67 | 1 unpaid day deducted; loan starts |
| Fatima EMP-006 | salaried, Saudi B | 6,066.67 | 752.50 | – | 5,314.17 | sick days in the **75% band** (Art. 117) |

*(These assume the seeded data is untouched. Change any attendance or leave and the slip
recalculates accordingly.)*

**Try it:** Change something and re-run! E.g. HR adds 2 hours overtime for Noura on the
Attendance page (Manual entry on a past date with 08:00–18:00), opens Payroll for 2026-08,
**Reset period** ▸ **Run payroll** and watch her overtime line appear. Then finalize again.

---

## 5. Loans

**Apply:** Loans ▸ **+ Apply for a loan** ▸ amount + months + reason. The system checks
affordability (installment ≤ 33% of the monthly wage; total deductions ≤ 50% of gross —
a legal protection).
**Approve:** manager for own team, HR for anyone. On approval the first deduction is
scheduled for the **next** payroll month; each payroll run then deducts the installment
until the loan is settled. Loan status shows **active → settled** automatically.

---

## 6. Assets

HR registers assets (**+ Register asset**) and assigns them (**Assign ▸ pick employee**).
Employees see what is assigned to them on the Assets page and in **My Profile ▸ My assets**.
Return an asset to the pool with **Return to available**.

---

## 7. Reports (Excel-friendly)

**Reports** page:
- **Attendance summary** (per employee per month): present days, expected workdays,
  absences, hours, overtime. ⬇ CSV opens in Excel.
- **Payroll register**: gross/GOSI/net per employee for accountants.
- **End-of-service estimates** (HR): Article 84/85 gratuity forecast (½ month per year for
  the first 5 years, 1 month after — pro-rated).
- **Leave & loan registers**.

---

## 8. My Profile (self-service)

Every employee can:
- change their password,
- set the **4-digit kiosk PIN**,
- download every **pay slip PDF**,
- view their leave balances and assigned assets.

---

## 9. What the Saudi compliance engine does (for HR/accounting)

| Rule | Where it lives |
|---|---|
| GOSI employee/employer rates by **System A / System B** (incl. 2026–2028 escalations), SANED, expat 2% OH | `backend/src/services/saudiConfig.js` |
| SAR 45,000 monthly contributory-wage cap; basic+housing base | same file |
| Annual leave 21/30 days, sick 30/60/30 tiers, unpaid max 10 | same file + `leaveService.js` |
| Overtime 150% / 200% (rest days) | `payrollService.js` |
| End-of-service estimate Art. 84/85 | same file |
| WPS "pay by the 10th" note on every slip | PDF generator & compliance notes |
| Deduction protection (≤50% of gross) | `payrollService.js` |

All the percentages are in one config file so an accountant can update them once a year
without touching the rest of the code.
