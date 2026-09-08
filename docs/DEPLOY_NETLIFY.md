# 🚀 Deploy your HRMS live on Netlify (step by step — no coding needed)

This guide takes you from **nothing** to a **working HRMS on the internet in about 30 minutes**.
If you get stuck at any step, skip ahead to **Section 10 — Troubleshooting**.

> A **website host** is like a landlord that shows your website to visitors. This guide uses
> **Netlify**, which is free for small companies and does most of the work automatically.
> The whole project (website + your "office database") gets uploaded to Netlify in one step.

---

## 1. What you need before you start (Prerequisites)

All of these are **free**. Nothing on this list costs money.

| # | You need | What it is | Free? | Where to get it |
|---|----------|-----------|-------|-----------------|
| 1 | The HRMS project folder on your computer | All the code files, neatly packaged | ✅ | This repository — click **Code ▸ Download ZIP**, then unzip. Remember the folder name (e.g. `HRms-main`) |
| 2 | A GitHub account | A free "cloud folder" that Netlify reads from | ✅ | https://github.com/signup — email + password |
| 3 | A Netlify account | The free host for your website | ✅ | https://app.netlify.com/signup — you can "Sign up with GitHub" |
| 4 | *(Optional)* A Gmail address | Used only for **emailing pay slips** | ✅ | https://accounts.google.com |
| 5 | *(Optional)* A Supabase account | A free **cloud database** so your data is never lost | ✅ | https://supabase.com — "Start your project" |

> ⚠️ **Do you need the optional items?** No! You can be live in ~15 minutes using only items
> 1–3. Your data is then kept in Netlify's temporary storage, which is **fine for trying the
> system** but **not for real use** (data can reset if Netlify restarts the function). For real
> company use, add the free Supabase database (Section 4) and Gmail email (Section 5).

### Technical terms used in this guide (simple definitions)
- **Upload / deploy** = sending your project files to Netlify so the world can see them.
- **URL / link** = your website's internet address, e.g. `https://your-company-hr.netlify.app`.
- **Database** = the digital filing cabinet that stores employees, attendance, pay slips…
- **Login / account** = one person's email + password for signing into the HRMS.

---

## 2. Put the project on GitHub

1. Go to https://github.com and **sign in**.
2. Click the **+** button (top-right corner) ▸ **New repository**.
3. Give it a name, e.g. `hrms`. Leave everything else as it is.
4. Click the green button **Create repository**.
5. Now upload your unzipped project folder:
   - Click **"uploading an existing file"** (the link under *"…or push an existing repository from the command line"*).
   - Drag the **contents of the unzipped project folder** into the page. ⚠️ Drag the files
     *inside* the folder (package.json, backend, frontend, etc.), not the folder itself.
   - Click **Commit changes**.

> ✅ Finished? You now have a cloud copy. If GitHub's drag-and-drop ever fails, use the free
> desktop app instead: https://desktop.github.com — *File ▸ Add local repository*, then
> *Publish repository*.

---

## 3. Connect Netlify and go live (the exciting part)

1. Go to https://app.netlify.com and sign in (use **Sign up with GitHub** if you can).
2. Click the blue button **Add new site** ▸ **Import an existing project**.
3. Netlify asks *"Connect to a Git provider?"* — click **GitHub**. (Authorize Netlify if asked.
   This is safe — Netlify is an official GitHub partner.)
4. A list of your repositories appears. Click **hrms** (the one you just made).
5. Netlify shows **Site settings**. Leave every box exactly as it is — Netlify read the
   instructions we already wrote for it. Scroll down and click **Deploy hrms**.
6. Wait about **2 minutes** while Netlify builds. You will see a yellow circle turning into a
   green **"Published"** badge.
7. Click **Domain settings ▸ (your site) ▸ Domain overview** — or simply click the link that
   says `https://hrms.netlify.app` (Netlify gives you a random name like `benevolent-biscuit-…`).

> 🎉 **You are LIVE!** Open your link and go to the login page (Section 6 below) to sign in.
> If the page shows "Database is still starting", wait 10 seconds and press **F5 / refresh** —
> the first visit creates the database, later visits are instant.

---

## 4. (Recommended) Connect the free Supabase database

Netlify's own temporary storage resets sometimes. Supabase keeps your data forever, is free,
and requires **zero SQL knowledge** — you only copy one line of text.

1. Go to https://supabase.com and click **Start your project** (free plan). Sign in with GitHub.
2. Click **New project**.
   - **Name**: anything, e.g. `hrms-db`.
   - **Database password**: click **Generate a password**, copy it somewhere safe (Notes app).
   - **Region**: choose **Southeast Asia (Singapore)** — closest to Saudi Arabia.
   - Click **Create new project**. Wait ~2 minutes for it to be ready.
3. On the left menu click **Project Settings** (gear icon) ▸ **Database**.
4. Scroll to **Connection string**. Make sure the type says **URI**. Click **Copy**.
   (It starts with `postgresql://postgres.…` — that long line is your database address.)
5. In another tab, open your **Netlify** site ▸ **Site configuration** (or **Site settings**)
   ▸ **Environment variables** ▸ **Add a variable**:
   - **Key** (first box): `DATABASE_URL`
   - **Value** (second box): paste the long line you copied
   - Click **Save**.
6. Go to **Deploys** tab ▸ click **Trigger deploy ▸ Deploy site**. Wait for green **Published**.
7. Open your site again and refresh. The system now permanently stores everything in Supabase.
   It creates all the tables and demo data automatically on the first visit after connecting.

> 🛡️ Your database is protected by the password Netlify knows. Only your site can read it.

---

## 5. (Optional) Turn on automatic pay-slip emails with a free Gmail account

1. Create a Gmail address for the company (or use an existing one), e.g. `hr.noreply@gmail.com`.
2. Turn on **2-Step Verification** at https://myaccount.google.com (required once).
3. Go to https://myaccount.google.com/apppasswords
   - App name: `HRMS` ▸ **Create** ▸ copy the **16-character password** it shows
   (it looks like `abcd efgh ijkl mnop`).
4. In **Netlify** (your site) ▸ **Site configuration ▸ Environment variables ▸ Add a variable**
   for each of these (press **Save** after each one):

   | Key (left box) | Value (right box) |
   |---|---|
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | your full Gmail address, e.g. `hr.noreply@gmail.com` |
   | `SMTP_PASS` | the 16-character app password (spaces are fine) |
   | `SMTP_FROM` | `hr.noreply@gmail.com` |
   | `COMPANY_NAME` | your company name, e.g. `Al Noor Trading Company` |

5. **Trigger deploy** again (Deploys tab ▸ Trigger deploy ▸ Deploy site), wait for green, refresh.
6. Test: sign in as HR → **Payroll & Slips** → click a pay slip → **Email this pay slip**.

> Without this step nothing breaks — the system simply shows "email not configured" on pay
> slips and you can always download the PDF instead.

---

## 6. Sign in for the first time (demo accounts)

Open your site link and sign in with one of these ready-made accounts
(password for **all** of them is `Demo@1234`):

| Role | Email | What this person can do |
|---|---|---|
| 👑 Admin (owner) | `admin@alnoor.sa` | Everything, plus manage the system |
| 👩‍💼 HR Manager | `ahlam@alnoor.sa` | Every employee, payroll, approvals — the main HR user |
| 👨‍💼 Manager | `khalid@alnoor.sa` | Sees & approves only **his own team** |
| 👷 Employee (hourly) | `sara@alnoor.sa` | Only her own data |
| 💼 Employee (commission) | `omar@alnoor.sa` | Only his own data |
| 👩 Employee (salaried) | `noura@alnoor.sa` | Only her own data |

Each account already has realistic data: attendance history, leave, a loan, pay slips
for August 2026, and assets. See **USING.md** for a full walk-through of every module.

---

## 7. Changing from the demo company to yours

Demo data exists so you can explore. When you are ready to go real:

1. Sign in as **admin@alnoor.sa** (or HR) and add your real employees on the
   **Employees** page (button **+ Add employee**). Each new employee automatically gets a
   login (a temporary password is shown once — share it with them).
2. Later, you may want a clean slate:
   - **Option A (keep demo):** simply ignore demo people and add yours; delete demo records
     one by one as you replace them.
   - **Option B (fresh start):** contact whoever manages your database, or re-deploy after
     **disconnecting Supabase** and creating a new database project, and run the **reset**
     described in `backend/scripts/dbSetup.js`. Demo data is only created once per database.

---

## 8. Making changes later (updates)

If you or a developer change the code in the GitHub `hrms` repository, Netlify
**automatically rebuilds your site** within a minute — you do not need to do anything.

To force a rebuild now: **Deploys ▸ Trigger deploy ▸ Deploy site**.

---

## 9. Running the same system on your own computer (optional)

1. Install **Node.js** from https://nodejs.org (free) — click the big green button.
2. Open the project folder, then open a terminal there:
   - Windows: right-click inside the folder ▸ **Open in Terminal**.
   - Mac: right-click the folder ▸ **New Terminal at Folder**.
3. Type these two commands, pressing Enter after each:
   ```
   npm install
   npm run dev
   ```
4. Open `http://localhost:4000` in your browser for the API or
   `http://localhost:5173` for the website. Sign in with the demo accounts above.
5. Press **Ctrl + C** in the terminal when you want to stop.

---

## 10. Troubleshooting (read this before panicking 😊)

| Problem | Fix |
|---|---|
| Page says *"Database is still starting. Please refresh"* | The very first visit builds the database. Wait ~15 seconds, press **F5**. |
| Login says *"Wrong email or password"* | Check the exact email and the password `Demo@1234`. Passwords are case-sensitive. |
| Attendance / pay slips disappear later | You are on Netlify's temporary storage. Connect the free Supabase database (Section 4). |
| Pay slip email button says *"Email is not configured"* | Complete Section 5 (Gmail + app password), then trigger a deploy. |
| Site shows a **404** after deploy | Wait for the green **Published** badge, then refresh. |
| Clock-in kiosk says *"PIN not correct"* | Demo PIN is `1234`. HR can set/reset a PIN via **Employees ▸ PIN**; employees can change their own in **My Profile**. |
| You changed code but the site looks the same | Netlify auto-builds from GitHub. Check **Deploys** for a red build and read the error, or **Trigger deploy**. |
| I want my own nice domain like `hr.company.com` | In Netlify: **Domain settings ▸ Add a domain**, then change DNS at your domain provider. (Buy a domain at any registrar; ~$10/year.) |

---

## 11. Security & backup notes for a real rollout

- Change the demo passwords before real use (My Profile ▸ Change password).
- The demo company uses the Saudi national **GOSI** contribution schedules built into the
  payroll engine (System A / System B, SANED, occupational hazards) — always verify the
  current GOSI percentages once a year (July) in `backend/src/services/saudiConfig.js`.
- Export monthly backups from the **Reports** page (CSV) — they open in Excel.
- Pay slips are **emailed** on finalize, **shown** in each employee's dashboard, and
  **downloadable as PDF** — satisfying the Wage Protection System's payment-by-the-10th habit.

*Ready? Turn to **USING.md** for the guided tour.*
