# HRMS API reference

Base URL: locally `http://localhost:4000/api` · on Netlify `https://<your-site>.netlify.app/api`

Authentication: `Authorization: Bearer <token>` (token from `POST /auth/login`).
Kiosk clock in/out is the exception — it authenticates with employee code + PIN.

Errors are always JSON: `{ "error": "human message", "code": "MACHINE_CODE" }` (HTTP 400/401/403/404/409/429/500).

## Roles
`employee` → own records · `manager` → own + direct reports · `hr` / `admin` → everything.

---

## Auth
| Method | Path | Body / notes | Access |
|---|---|---|---|
| POST | `/auth/login` | `{email, password}` → `{token, user}` | public |
| GET | `/auth/me` | current profile + leave balances | token |
| PUT | `/auth/password` | `{currentPassword, newPassword}` | token |
| PUT | `/auth/my-pin` | `{pin}` (4-digit kiosk PIN) | token (employee) |

## Employees
| Method | Path | Notes | Access |
|---|---|---|---|
| GET | `/employees` | filters: `department, status, payType, role, search, finance=1` | scoped |
| GET | `/employees/:id` | profile + leave balances; finance only for HR/self | scoped |
| POST | `/employees` | create + login account + kiosk PIN (`password`, `kioskPin` optional → generated & returned once) | hr/admin |
| PUT | `/employees/:id` | partial update; `role` change syncs the login account | hr/admin |
| PUT | `/employees/:id/pin` | `{pin}` | hr/admin |

## Attendance
| Method | Path | Notes | Access |
|---|---|---|---|
| GET | `/attendance/kiosk-employees` | minimal public kiosk directory | public |
| POST | `/attendance/clock` | `{action: in\|out}` — bearer token **or** `{employeeCode, pin, source}` (kiosk). `source`: `web\|mobile\|kiosk` | token / kiosk |
| GET | `/attendance/status` | today's own record | token |
| GET | `/attendance` | `from, to, source, employeeId(HR), limit` | scoped |
| POST | `/attendance` | manual day: `{employeeId, date, clockIn:'HH:mm', clockOut, source, note}` (upsert per day) | hr/admin |
| PATCH | `/attendance/:id` | correct times/note | hr/admin |
| DELETE | `/attendance/:id` | remove record | hr/admin |

## Leave
| Method | Path | Notes | Access |
|---|---|---|---|
| GET | `/leave/balances` | `employeeId` (HR) | scoped |
| GET | `/leave/requests` | `status, type, employeeId(HR), from, to` | scoped |
| POST | `/leave/requests` | `{type, startDate, endDate, reason, employeeId?(HR)}` — validates overlap & balance | token |
| POST | `/leave/requests/:id/decision` | `{decision: approved\|rejected, note}` | manager(team)/HR |
| DELETE | `/leave/requests/:id` | cancel pending (owner or HR) | token |

Leave types: `annual, sick, unpaid, maternity, hajj`. Balances follow Saudi Labour Law Art. 109/117.

## Loans
| Method | Path | Notes | Access |
|---|---|---|---|
| GET | `/loans` | `status, employeeId(HR)` | scoped |
| POST | `/loans/requests` | `{amount, months, reason, employeeId?(HR)}` — installment auto = amount/months; affordability check | token |
| POST | `/loans/:id/decision` | `{decision: approved\|rejected}` — sets `startMonth` to next payroll month | manager(team)/HR |
| POST | `/loans/:id/cancel` | cancel before repayments start | hr/admin |

## Payroll
| Method | Path | Notes | Access |
|---|---|---|---|
| GET | `/payroll/payslips` | `period, status, employeeId(HR)` | scoped (employees: own only) |
| GET | `/payroll/payslips/latest` | newest slip in scope | scoped |
| GET | `/payroll/payslips/:id` | full slip incl. `json` breakdown | scoped |
| GET | `/payroll/payslips/:id/pdf` | PDF (Content-Disposition attachment) | scoped |
| POST | `/payroll/payslips/:id/email` | (re)send slip email | hr/admin |
| POST | `/payroll/run` | `{period: 'YYYY-MM', employeeIds?}` → draft slips (paid ones locked) | hr/admin |
| POST | `/payroll/finalize` | `{period}` → mark paid + email all | hr/admin |
| POST | `/payroll/reset` | `{period}` → unlock (delete slips, restore loans) | hr/admin |
| GET | `/payroll/summary` | `period` → totals by pay type & department | scoped |
| GET | `/payroll/status` | `period` → per-employee `draft/paid/not_run` | hr/admin |

## Assets
| Method | Path | Notes | Access |
|---|---|---|---|
| GET | `/assets` | `status, category` — employees see own, managers team | scoped |
| GET | `/assets/mine` | assets assigned to the signed-in employee | token |
| POST | `/assets` | register asset | hr/admin |
| PATCH | `/assets/:id` | update | hr/admin |
| POST | `/assets/:id/assign` | `{assignedToId}` or `null` to return to pool | hr/admin |
| DELETE | `/assets/:id` | remove | hr/admin |

## Reports
All support `?format=csv` for Excel export.
| Method | Path | Access |
|---|---|---|
| GET | `/reports/attendance` | daily log (`from`, `to`) — scoped |
| GET | `/reports/attendance-summary?month=` | per-employee monthly summary — scoped |
| GET | `/reports/payroll?period=` | payroll register — HR/manager |
| GET | `/reports/leave?month=` | leave register — scoped |
| GET | `/reports/loans` | loan register — scoped |
| GET | `/reports/eosb` | end-of-service estimates (Art. 84/85) — hr/admin |

## Dashboard
| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | role-aware stats (HR = company, manager = team, employee = personal incl. today's attendance, balances, latest payslip) |

## System
| Method | Path |
|---|---|
| GET | `/health` | liveness check |
| GET | `/` (unknown `/api/*`) | `404 {error}` JSON |
