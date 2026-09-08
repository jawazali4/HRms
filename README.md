# Jawaz' HRMS — Human Resource Management System

A complete, production-ready HRMS for companies in **Saudi Arabia**, built for
**50–500 employees**, with role-based access (employee / manager / HR / admin) and
**GOSI + Saudi Labour Law** built into the payroll engine.

**Developed by Jawaz Ali** — IT Support Specialist at Derbn Trading (شركة دربن التجارية)
📧 Jawaz2013@gmail.com · 📱 +966 53 961 8563 · 📍 Saudi Arabia

**Deploy it live on Netlify in ~30 minutes — no coding needed.**
➡️ Start here: [`docs/DEPLOY_NETLIFY.md`](docs/DEPLOY_NETLIFY.md) (beginner step-by-step)
· [`docs/USING.md`](docs/USING.md) (guided tour) · [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) (API)

---

## Modules

| Module | What it does |
|---|---|
| **Employees** | Create/update/view records with GOSI profile, salary components, kiosk PIN, managers |
| **Attendance** | Clock in/out from **kiosk machines, mobile apps and web browsers**; manual HR corrections; reports |
| **Payroll** | Salaried, **hourly** and **commission-based** pay; GOSI (System A/B incl. 2026–2028 escalations, SANED, expat 2% occupational hazards); overtime 150%/200%; Saudi leave pay; **pay-slip PDFs**, **automatic email**, dashboard display |
| **Loans** | Employee applications, manager/HR approvals, automatic monthly repayment deduction |
| **Leave** | Requests & approvals; Saudi balances — annual 21/30 days, sick 30/60/30 (Art. 117), unpaid ≤10, maternity |
| **Assets** | Company asset register, assignment to employees, status tracking |
| **Reports** | Attendance/payroll/leave/loan/EOSB registers with CSV export |
| **Kiosk** | Public clock-in screen for physical kiosk devices (employee code + PIN) |

## Demo accounts (password for all: `Demo@1234`)

| Role | Email |
|---|---|
| Admin | `admin@alnoor.sa` |
| HR Manager | `ahlam@alnoor.sa` |
| Manager (team of 4) | `khalid@alnoor.sa` |
| Employee — hourly (expat) | `sara@alnoor.sa` |
| Employee — commission (Saudi, System B) | `omar@alnoor.sa` |
| Employee — salaried (Saudi, System B) | `noura@alnoor.sa` |
| Employee — salaried, sick-leave demo | `fatima@alnoor.sa` |

Demo kiosk PIN: **`1234`**. The database seeds automatically on first run (attendance
history for Aug–Sep 2026, leaves, loans, commissions, assets, and an **August 2026 payroll**
ready to inspect).

## Quick start (local, 2 minutes)

```bash
npm install        # install dependencies
npm run db:setup   # create database + demo data (local file — zero config)
npm run dev        # starts API (:4000) and web app (:5173)
```
Open http://localhost:5173 and sign in. (`npm start` runs the API alone.)

## Project layout

```
backend/            Express API (Node.js) + Sequelize models
  src/models.js     all database tables
  src/services/     saudiConfig.js (GOSI & Labour Law numbers),
                    payrollService.js (the engine), leaveService.js, emailer.js, pdfService.js
  src/routes/       auth, employees, attendance, leave, loans, payroll, assets, reports, dashboard
  scripts/          dbSetup.js (reset/seed)
  test/             payroll engine unit tests
frontend/           React SPA (Vite + React Router), mobile friendly, installable PWA
netlify/            Netlify function wrapper (the API runs as one serverless function)
docs/               deployment, usage and API guides
```

## Architecture & growth

- **Frontend:** React SPA (Vite). Static, cache-friendly, deployable anywhere.
- **Backend:** Express API with JWT auth, per-route **role middleware** and
  **record-level scoping** (`visibleEmployeeIds`) so employees/managers/HR only ever
  receive authorised data.
- **Database:** Sequelize over **SQLite (zero-config local demo)** or **Supabase/Postgres**
  (free, no SQL needed — set one env var: `DATABASE_URL`).
- **Scale:** stateless API + relational schema with foreign keys and indexes is ready for
  50–500 employees today; to grow, run the same API on more machines / a managed Postgres —
  **no auth or schema redesign required**.

## Saudi compliance (see `backend/src/services/saudiConfig.js`)

- GOSI rates by **System A** (fixed 9.75%/11.75% in 2026) and **System B**
  (10.75%/12.75% in 2026, escalating each July to 11.75%/13.75% by 2028) incl. SANED and
  the 2% occupational-hazards charge for expatriates; SAR 45,000 cap; basic+housing base.
- Leave pay per Labour Law Art. 109 (annual), Art. 117 (sick bands 30 full / 60 @75% /
  30 unpaid), unpaid ≤10 days; maternity policy configurable.
- Overtime at 150% of wage, 200% on rest days; absence/unpaid-day deductions on a
  30-day month basis; end-of-service estimate (Art. 84/85); salary-protection cap on
  deductions (≤50% of gross); WPS payment-by-the-10th note on pay slips.

## Security & testing

- Passwords hashed with **bcrypt**; kiosk PINs salted & hashed; JWT sessions; kiosk
  rate-limiting; validation on every write; central error handler; audit log table.
- Run tests: `npm test` (payroll/GOSI/leave engine — 9 unit tests).

## License

MIT — see [LICENSE](LICENSE).
