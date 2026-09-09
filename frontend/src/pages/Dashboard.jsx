import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Stat, Badge, fmtMoney, fmtDate, fmtClock, monthName } from '../components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [clockBusy, setClockBusy] = useState(false);
  const [clockMsg, setClockMsg] = useState('');
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api('GET', '/api/dashboard');
      setData(d);
    } catch (e) {
      console.error('Dashboard load failed:', e);
      setError(e.message || 'Failed to load dashboard');
      // If error is about missing tables, try to auto-fix via detailed health which triggers sync
      if (e.message.includes('branches') || e.message.includes('shifts') || e.message.includes('does not exist') || e.message.includes('relation')) {
        setRetrying(true);
        try {
          // Trigger DB sync via health detailed
          await fetch('/api/health/detailed');
          await new Promise(r => setTimeout(r, 2000));
          const d2 = await api('GET', '/api/dashboard');
          setData(d2);
          setError('');
        } catch (e2) {
          console.warn('Retry failed:', e2.message);
        } finally {
          setRetrying(false);
        }
      }
    }
  }, []);
  
  useEffect(() => { load(); }, [load]);

  const clock = async (action) => {
    setClockBusy(true);
    setClockMsg('');
    try {
      const r = await api('POST', '/api/attendance/clock', { action, source: 'web' });
      setClockMsg(r.message);
      load();
    } catch (e) {
      setClockMsg(e.message);
    } finally {
      setClockBusy(false);
    }
  };

  if (error) {
    return (
      <div>
        <div className="error-box" style={{ whiteSpace: 'pre-wrap' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ Dashboard Error</div>
            <div>{error}</div>
            {error.includes('branches') || error.includes('does not exist') ? (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--warning-bg)', borderRadius: 8, fontSize: 13 }}>
                <b>🔧 Auto-fix in progress:</b> New tables (branches, shifts) are being created. This happens once after update.<br/>
                Please wait 10 seconds and refresh. If still failing, go to <code>/api/health/detailed</code> to check DB status.
              </div>
            ) : null}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn sm" onClick={load} disabled={retrying}>{retrying ? 'Retrying...' : '🔄 Retry'}</button>
              <button className="btn sm ghost" onClick={() => window.location.reload()}>Refresh Page</button>
              <a className="btn sm ghost" href="/api/health/detailed" target="_blank">Check Health</a>
            </div>
          </div>
        </div>
        {retrying && <div className="loading">Attempting to auto-fix database tables...</div>}
      </div>
    );
  }
  
  if (!data) return <div className="loading">{t('common.loading')}{retrying ? ' (fixing tables...)' : ''}</div>;

  const isHR = ['hr', 'admin'].includes(user.role);
  const isAdmin = user.role === 'admin';
  const me = user.employee;
  const today = data.mine?.attendanceToday || { status: 'none' };

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>
            {isHR
              ? (isRTL ? 'نظرة عامة على الشركة' : t('dashboard.companyOverview'))
              : `${isRTL ? t('dashboard.welcome') : t('dashboard.welcome')}, ${me ? (isRTL ? me.fullNameAr : me.fullNameEn.split(' ')[0]) : user.email.split('@')[0]} 👋`}
          </h1>
          <p>
            Jawaz' HRMS — {isRTL ? 'المملكة العربية السعودية' : 'Saudi Arabia'} ·{' '}
            {new Date().toLocaleDateString(isRTL ? 'ar-SA' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex">
          {isAdmin && (
            <Link className="btn" to="/users">
              👑 {t('nav.users')}
            </Link>
          )}
          {isHR && (
            <>
              <Link className="btn soft" to="/branches">🏢 Branches</Link>
              <Link className="btn soft" to="/shifts">⏰ Shifts</Link>
            </>
          )}
          {!isHR && (
            <Link className="btn ghost" to="/attendance">
              {t('nav.attendance')}
            </Link>
          )}
        </div>
      </div>

      {clockMsg && (
        <div className={clockMsg.toLowerCase().includes('error') || clockMsg.toLowerCase().includes('not') ? 'form-error' : 'form-ok'}>
          {clockMsg}
        </div>
      )}

      {!isHR && (
        <div className="grid2">
          <div className="card clockbox" style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🕒</span> {t('dashboard.todayAttendance')}
              </h3>
              <div className="clockbig">
                {today.status === 'in' && (
                  <>
                    {isRTL ? 'سجلت حضورك في' : t('dashboard.clockedInAt')} {fmtClock(data.mine.attendanceToday.clockIn)}
                  </>
                )}
                {today.status === 'out' && (
                  <>
                    {t('dashboard.done')} ✓ ({isRTL ? 'حضور' : 'in'} {fmtClock(data.mine.attendanceToday.clockIn)}, {isRTL ? 'انصراف' : 'out'}{' '}
                    {fmtClock(data.mine.attendanceToday.clockOut)})
                  </>
                )}
                {today.status === 'none' && (isRTL ? 'لم تسجل حضورك بعد' : t('dashboard.notClockedIn'))}
              </div>
              <div className="note">{isRTL ? 'يعمل من المتصفح والجوال وجهاز الحضور' : 'Works from web browsers, mobile, or the office kiosk.'}</div>
            </div>
            <div className="flex" style={{ marginLeft: isRTL ? 0 : 'auto', marginRight: isRTL ? 'auto' : 0 }}>
              <button className="btn lg" disabled={clockBusy || today.status === 'in'} onClick={() => clock('in')}>
                {t('dashboard.clockIn')}
              </button>
              <button className="btn ghost lg" disabled={clockBusy || today.status !== 'in'} onClick={() => clock('out')}>
                {t('dashboard.clockOut')}
              </button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🏖️</span> {t('dashboard.leaveBalance')}
            </h3>
            {data.mine.balances ? (
              <>
                <div className="listitem">
                  <span>{t('dashboard.annualLeave')} ({isRTL ? 'مستحق' : 'accrued'})</span>
                  <b>
                    {data.mine.balances.annualAccrued} / {data.mine.balances.annualEntitlement} {isRTL ? 'يوم' : 'days'}
                  </b>
                </div>
                <div className="listitem">
                  <span>{t('dashboard.annualAvailable')}</span>
                  <b>
                    {data.mine.balances.annualAvailable} {isRTL ? 'يوم' : 'days'}
                  </b>
                </div>
                <div className="listitem">
                  <span>{t('dashboard.sickLeave')}</span>
                  <b>
                    {data.mine.balances.sickAvailable} {isRTL ? 'من 120 يوم' : 'of 120 days'}
                  </b>
                </div>
                <div className="listitem">
                  <span>{t('dashboard.unpaidLeave')}</span>
                  <b>
                    {data.mine.balances.unpaidAvailable} {isRTL ? 'متبقي' : 'left'}
                  </b>
                </div>
                <div className="note">
                  {isRTL ? 'سنة الإجازة' : 'Leave year'}: {data.mine.balances.leaveYear}
                </div>
              </>
            ) : (
              <p className="muted">{isRTL ? 'لا يوجد سجل موظف مرتبط' : 'No employee record linked.'}</p>
            )}
          </div>

          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>💵</span> {t('dashboard.latestPayslip')}
            </h3>
            {data.mine.latestPayslip ? (
              <div className="payslip-mini">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <small style={{ color: '#bbf7d0' }}>{monthName(data.mine.latestPayslip.period)}</small>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtMoney(data.mine.latestPayslip.netPay)}</div>
                    <div className="flex" style={{ marginTop: 8 }}>
                      <Badge value={data.mine.latestPayslip.status} />
                      {data.mine.latestPayslip.emailStatus === 'disabled' && (
                        <small style={{ color: '#bbf7d0' }}>{isRTL ? 'البريد غير مُعد' : 'email not configured'}</small>
                      )}
                      {data.mine.latestPayslip.emailStatus === 'sent' && <small style={{ color: '#bbf7d0' }}>✓ {isRTL ? 'تم الإرسال' : 'emailed'}</small>}
                    </div>
                  </div>
                  <a className="btn soft" target="_blank" rel="noreferrer" href={`/api/payroll/payslips/${data.mine.latestPayslip.id}/pdf`}>
                    PDF ↓
                  </a>
                </div>
              </div>
            ) : (
              <p className="muted">{t('dashboard.noPayslips')}</p>
            )}
            <div style={{ marginTop: 12 }}>
              <Link to="/profile" style={{ fontWeight: 600 }}>
                {isRTL ? 'الملف وكشوف الرواتب ←' : 'Profile & payslips →'}
              </Link>
            </div>
          </div>

          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚡</span> {t('dashboard.quickActions')}
            </h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <Link className="btn ghost" to="/leave">
                🏖️ {t('dashboard.requestLeave')}
              </Link>
              <Link className="btn ghost" to="/loans">
                💳 {t('dashboard.applyLoan')}
              </Link>
              <Link className="btn ghost" to="/assets">
                📦 {t('dashboard.myAssets')} ({data.mine.assetsCount})
              </Link>
              <Link className="btn ghost" to="/kiosk">
                🖥️ {t('dashboard.openKiosk')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {isHR && (
        <>
          <div className="statgrid">
            <Stat k={t('dashboard.activeEmployees')} v={data.counts.activeEmployees} />
            <Stat k={t('dashboard.presentToday')} v={data.counts.presentToday} s={`${data.counts.clockedOutToday} ${t('dashboard.clockedOutToday')}`} />
            <Stat k={t('dashboard.pendingLeave')} v={data.counts.pendingLeave} s={isRTL ? 'بانتظار الموافقة' : 'awaiting approval'} />
            <Stat k={t('dashboard.pendingLoans')} v={data.counts.pendingLoans} />
            <Stat k={t('dashboard.openAssets')} v={data.counts.openAssets} s={t('dashboard.availableToAssign')} />
            {data.counts.branches !== undefined && <Stat k="Branches" v={data.counts.branches} s="Active locations" />}
            {data.counts.shifts !== undefined && <Stat k="Shifts" v={data.counts.shifts} s="Time tables" />}
          </div>
          <div className="grid2">
            <div className="card">
              <h3>
                {t('dashboard.lastPayroll')} · {monthName(data.payroll.period)}
              </h3>
              <div className="listitem">
                <span>{t('dashboard.paySlips')}</span>
                <b>{data.payroll.slipsCount}</b>
              </div>
              <div className="listitem">
                <span>{t('dashboard.netSalaries')}</span>
                <b>{fmtMoney(data.payroll.netTotal)}</b>
              </div>
              <div className="listitem">
                <span>{t('dashboard.employerGosi')}</span>
                <b>{fmtMoney(data.payroll.gosiEmployer)}</b>
              </div>
              <div className="listitem">
                <span>{t('dashboard.totalEmployerCost')}</span>
                <b>{fmtMoney(data.payroll.employerCost)}</b>
              </div>
              <div className="flex" style={{ marginTop: 16 }}>
                <Link className="btn sm" to="/payroll">
                  {t('dashboard.openPayroll')}
                </Link>
                <Link className="btn sm ghost" to="/reports">
                  {t('dashboard.reportsCsv')}
                </Link>
              </div>
            </div>
            <div className="card">
              <h3>{t('dashboard.needsAttention')}</h3>
              {data.counts.pendingLeave === 0 && data.counts.pendingLoans === 0 ? (
                <p className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>
                  {t('dashboard.nothingWaiting')}
                </p>
              ) : (
                <>
                  <div className="listitem">
                    <span>{t('dashboard.leaveRequestsPending')}</span>
                    <Link to="/leave" style={{ fontWeight: 700, fontSize: 16 }}>
                      {data.counts.pendingLeave}
                    </Link>
                  </div>
                  <div className="listitem">
                    <span>{t('dashboard.loanApplicationsPending')}</span>
                    <Link to="/loans" style={{ fontWeight: 700, fontSize: 16 }}>
                      {data.counts.pendingLoans}
                    </Link>
                  </div>
                  <div className="note" style={{ marginTop: 12 }}>
                    {t('dashboard.managerNote')}
                  </div>
                </>
              )}
              {me && (
                <div className="listitem" style={{ marginTop: 12, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                  <span>{isRTL ? 'سجلي الخاص' : 'My own record'}</span>
                  <Badge value={user.role} />
                </div>
              )}
            </div>
          </div>

          <div className="grid2">
            <div className="card">
              <h3>🏢 Locations Overview</h3>
              <div className="listitem"><span>Total Branches/Warehouses/Factory</span><b>{data.counts.branches || 0}</b></div>
              <div className="listitem"><span>Time Tables</span><b>{data.counts.shifts || 0}</b></div>
              <div className="flex" style={{ marginTop: 12 }}>
                <Link className="btn sm" to="/branches">Manage Branches</Link>
                <Link className="btn sm ghost" to="/shifts">Manage Shifts</Link>
              </div>
            </div>

            {isAdmin && (
              <div className="card" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>👑</span> {isRTL ? 'صلاحيات المسؤول' : 'Admin Powers'}
                </h3>
                <p className="muted" style={{ marginBottom: 16 }}>
                  {isRTL ? 'كمسؤول، لديك صلاحيات كاملة لإدارة النظام' : 'As admin, you have full powers to manage the system'}
                </p>
                <div className="flex" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <Link className="btn sm" to="/employees">
                    👥 {isRTL ? 'إدارة الموظفين' : 'Manage Employees'}
                  </Link>
                  <Link className="btn sm ghost" to="/users">
                    👑 {isRTL ? 'إدارة المستخدمين' : 'User Management'}
                  </Link>
                  <Link className="btn sm ghost" to="/reports">
                    📈 {isRTL ? 'التقارير' : 'Reports'}
                  </Link>
                </div>
                <div style={{ marginTop: 16, padding: 12, background: 'var(--warning-bg)', borderRadius: 8, fontSize: 12 }}>
                  <b>🔧 DB Maintenance:</b> If you see "relation does not exist" errors, 
                  <a href="/api/health/detailed" target="_blank" style={{ marginLeft: 6 }}>check health</a> or 
                  <button className="btn ghost sm" style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11 }} onClick={async () => {
                    try {
                      const r = await fetch('/api/health/sync', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
                      const j = await r.json();
                      alert(JSON.stringify(j, null, 2));
                      window.location.reload();
                    } catch (e) { alert(e.message); }
                  }}>Force Sync DB</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
