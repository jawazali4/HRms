# 📧 Hostinger Email Setup - Step by Step

Your domain is on Hostinger. Follow these steps to configure email for payroll.

## Step 1: Create Email Account in Hostinger

1. Login to **hPanel**: https://hpanel.hostinger.com
2. Go to **Emails → Email Accounts**
3. Click **Create New Email Account**
4. Create email like: `payroll@yourdomain.com` or `hr@yourdomain.com` or `noreply@yourdomain.com`
5. Set a strong password and save it

## Step 2: Get SMTP Settings

Hostinger SMTP settings:
```
Host: smtp.hostinger.com
Port: 465 (SSL) or 587 (TLS) - Use 465 for best compatibility
Secure: true for 465, false for 587
```

## Step 3: Configure in Netlify (Production)

1. Go to **Netlify Dashboard** → Your Site → **Site Settings** → **Environment Variables**
2. Add these variables:

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=payroll@yourdomain.com
SMTP_PASS=your_email_password_here
SMTP_FROM=payroll@yourdomain.com
SMTP_SECURE=true
COMPANY_NAME=Your Company Name
COMPANY_EMAIL=payroll@yourdomain.com
JWT_SECRET=your-random-secret-key-min-32-chars
JWT_EXPIRES_IN=7d
PRODUCTION_MODE=true
REMOVE_DEMO_DATA=true
AUTO_SEED=false
DB_FORCE_MIGRATE=false
```

**Important:** For `JWT_SECRET`, generate a random string:
- Go to https://randomkeygen.com/ → use a CodeIgniter Encryption Key
- Or run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

3. Click **Save** and **Redeploy** site (Deploys → Trigger deploy → Deploy site)

## Step 4: Configure Locally (.env file)

Create `.env` file in project root:

```env
# Database (Supabase Transaction Pooler - FASTEST for multi-user)
DATABASE_URL=postgres://postgres.xxxxx:password@aws-0-xx.pooler.supabase.com:6543/postgres?pgbouncer=true

# JWT - Extended for multi-user (HR, Admin, Employee, Manager)
JWT_SECRET=your-super-secret-random-key-here-min-32-chars
JWT_EXPIRES_IN=7d

# Hostinger Email
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=payroll@yourdomain.com
SMTP_PASS=your_hostinger_email_password
SMTP_FROM=payroll@yourdomain.com
SMTP_SECURE=true

# Company
COMPANY_NAME=Your Company Name
COMPANY_EMAIL=payroll@yourdomain.com

# Production Mode - NO DEMO DATA, FASTEST
PRODUCTION_MODE=true
REMOVE_DEMO_DATA=true
AUTO_SEED=false
DB_FORCE_MIGRATE=false

# CORS
CORS_ORIGINS=*
```

## Step 5: Test Email

1. Login as HR/Admin
2. Go to Payroll → Generate payroll
3. Click "Email this pay slip" on any payslip
4. Check if email received

If fails, check:
- Hostinger email password is correct
- Port 465 with secure=true
- Email account is active in hPanel
- Check Netlify function logs: Netlify → Functions → api → Logs

## Step 6: For Gmail Alternative (if Hostinger fails)

If Hostinger SMTP has issues, use Gmail:

1. Create Gmail account
2. Enable 2FA: https://myaccount.google.com/security
3. Create App Password: https://myaccount.google.com/apppasswords
4. Use:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your_16_char_app_password
SMTP_SECURE=false
```

## Troubleshooting

**"Email is not configured"**
- Check SMTP_HOST, SMTP_USER, SMTP_PASS are set in Netlify env vars
- Redeploy after adding env vars

**"Authentication failed"**
- Wrong password - reset in Hostinger hPanel → Email Accounts
- Use full email as user: `payroll@yourdomain.com` not just `payroll`

**"Connection timeout"**
- Try port 587 with SMTP_SECURE=false
- Check if Hostinger email is active

**"Emails go to spam"**
- Add SPF record in Hostinger → DNS: `v=spf1 include:_spf.hostinger.com ~all`
- Use professional from address like `payroll@yourdomain.com`

## Speed Optimizations Applied

✅ **No Demo Data**: Production mode removes all demo employees, attendance, etc. - 10x faster
✅ **Pool max:1**: Avoids Supabase 15 client limit
✅ **Fast init**: Only authenticates, no heavy sync on every request
✅ **JWT 7 days**: No more session expire on payroll download
✅ **Health cache 10s**: Reduces DB load for multi-user
✅ **Auth download**: Payroll PDF uses token auth, not direct link
✅ **No background seeding**: Removed slow seeding

## Multi-User Performance

For HR, Admin, Employee, Manager concurrent use:
- Use **Transaction Pooler** (port 6543) not Session Pooler (5432)
- Transaction mode handles thousands of concurrent users
- Session mode limited to 15

Supabase → Connect → Transaction Pooler:
```
postgres://postgres.xxx:password@aws-0-xx.pooler.supabase.com:6543/postgres?pgbouncer=true
```

Add `?pgbouncer=true` at end!

## Clear Demo Data (If Already Have Demo Data)

If your DB already has demo data and you want to remove:

**Option 1: Via API (requires admin login)**
```bash
curl -X POST https://your-site.netlify.app/api/health/clear-demo \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Option 2: Via Supabase SQL**
Go to Supabase → SQL Editor → Run:
```sql
-- Delete demo data (EMP-00x)
DELETE FROM attendance WHERE employeeId IN (SELECT id FROM employees WHERE employeeCode LIKE 'EMP-00%');
DELETE FROM leave_requests WHERE employeeId IN (SELECT id FROM employees WHERE employeeCode LIKE 'EMP-00%');
DELETE FROM loans WHERE employeeId IN (SELECT id FROM employees WHERE employeeCode LIKE 'EMP-00%');
DELETE FROM payslips WHERE employeeId IN (SELECT id FROM employees WHERE employeeCode LIKE 'EMP-00%');
DELETE FROM assets WHERE assetCode LIKE 'AST-%';
DELETE FROM users WHERE email LIKE '%@alnoor.sa';
DELETE FROM employees WHERE employeeCode LIKE 'EMP-00%';
```

**Option 3: Set env and redeploy**
Set `REMOVE_DEMO_DATA=true` and `PRODUCTION_MODE=true` then redeploy - next time you call `/api/health/sync` it will clear demo data.

## Admin Credentials After Clean

After removing demo data, only admin remains:
- Email: `admin@company.sa` or your `ADMIN_EMAIL` env var
- Password: `Demo@1234` or your `DEMO_PASSWORD` env var

Change password after first login!

## Best UI/UX Tips

- **Mobile**: Login page now responsive, dashboard optimized
- **Payroll**: Download uses auth token, no more session expire
- **Multi-user**: Each role sees only relevant data for speed
- **Branches**: Each branch has own shift, faster queries
- **Excel Import**: Bulk employee import for fast setup
