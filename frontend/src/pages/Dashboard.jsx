import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Stat, Badge, fmtMoney, fmtDate, fmtClock, monthName } from '../components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [clockBusy, setClockBusy] = useState(false);
  const [clockMsg, setClockMsg] = useState('');

  const load = useCallback(() => {
    api('GET', '/api/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

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

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="loading">Loading your dashboard…</div>;

  const isHR = ['hr', 'admin'].includes(user.role);
  const me = user.employee;
  const today = data.mine?.attendanceToday || { status: 'none' };

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>{isHR ? 'Company overview' : `Welcome back, ${me ? me.fullNameEn.split(' ')[0] : user.email.split('@')[0]} 👋`}</h1>
          <p>Jawaz' HRMS — Saudi Arabia · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        {!isHR && (
          <Link className="btn ghost" to="/attendance">View my attendance</Link>
        )}
      </div>

      {clockMsg && <div className={clockMsg.toLowerCase().includes('error') || clockMsg.toLowerCase().includes('not') ? 'form-error' : 'form-ok'}>{clockMsg}</div>}

      {!isHR && (
        <div className="grid2">
          <div className="card clockbox">
            <div>
              <h3>Today's attendance</h3>
              <div className="clockbig">
                {today.status === 'in' && <>Clocked in at {fmtClock(data.mine.attendanceToday.clockIn)}</>}
                {today.status === 'out' && <>Done ✓ (in {fmtClock(data.mine.attendanceToday.clockIn)}, out {fmtClock(data.mine.attendanceToday.clockOut)})</>}
                {today.status === 'none' && 'Not clocked in yet'}
              </div>
              <div className="note">Works from web browsers, mobile, or the office kiosk.</div>
            </div>
            <div className="flex" style={{ marginLeft: 'auto' }}>
              <button className="btn lg" disabled={clockBusy || today.status === 'in'} onClick={() => clock('in')}>Clock in</button>
              <button className="btn ghost lg" disabled={clockBusy || today.status !== 'in'} onClick={() => clock('out')}>Clock out</button>
            </div>
          </div>

          <div className="card">
            <h3>My leave balance</h3>
            {data.mine.balances ? (
              <>
                <div className="listitem"><span>Annual leave (accrued)</span><b>{data.mine.balances.annualAccrued} / {data.mine.balances.annualEntitlement} days</b></div>
                <div className="listitem"><span>Annual — available now</span><b>{data.mine.balances.annualAvailable} days</b></div>
                <div className="listitem"><span>Sick leave (statutory)</span><b>{data.mine.balances.sickAvailable} of 120 days</b></div>
                <div className="listitem"><span>Unpaid leave (max 10/yr)</span><b>{data.mine.balances.unpaidAvailable} left</b></div>
                <div className="note">Leave year: {data.mine.balances.leaveYear}</div>
              </>
            ) : <p className="muted">No employee record linked.</p>}
          </div>

          <div className="card">
            <h3>My latest pay slip</h3>
            {data.mine.latestPayslip ? (
              <div className="payslip-mini">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <small style={{ color: '#bbf7d0' }}>{monthName(data.mine.latestPayslip.period)}</small>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtMoney(data.mine.latestPayslip.netPay)}</div>
                    <div className="flex" style={{ marginTop: 6 }}>
                      <Badge value={data.mine.latestPayslip.status} />
                      {data.mine.latestPayslip.emailStatus === 'disabled' && <small style={{ color: '#bbf7d0' }}>email not configured</small>}
                      {data.mine.latestPayslip.emailStatus === 'sent' && <small style={{ color: '#bbf7d0' }}>emailed ✓</small>}
                    </div>
                  </div>
                  <a className="btn soft" target="_blank" rel="noreferrer" href={`/api/payroll/payslips/${data.mine.latestPayslip.id}/pdf`}>PDF ↓</a>
                </div>
              </div>
            ) : (
              <p className="muted">No pay slips yet — HR will run payroll at month end.</p>
            )}
            <Link to="/profile">Profile & payslips →</Link>
          </div>

          <div className="card">
            <h3>Quick actions</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <Link className="btn ghost" to="/leave">Request leave</Link>
              <Link className="btn ghost" to="/loans">Apply for a loan</Link>
              <Link className="btn ghost" to="/assets">My assets ({data.mine.assetsCount})</Link>
              <Link className="btn ghost" to="/kiosk">Open clock-in kiosk</Link>
            </div>
          </div>
        </div>
      )}

      {isHR && (
        <>
          <div className="statgrid">
            <Stat k="Active employees" v={data.counts.activeEmployees} />
            <Stat k="Present today" v={data.counts.presentToday} s={`${data.counts.clockedOutToday} clocked out`} />
            <Stat k="Pending leave" v={data.counts.pendingLeave} s="awaiting approval" />
            <Stat k="Pending loans" v={data.counts.pendingLoans} />
            <Stat k="Open assets" v={data.counts.openAssets} s="available to assign" />
          </div>
          <div className="grid2">
            <div className="card">
              <h3>Last payroll · {monthName(data.payroll.period)}</h3>
              <div className="listitem"><span>Pay slips</span><b>{data.payroll.slipsCount}</b></div>
              <div className="listitem"><span>Net salaries</span><b>{fmtMoney(data.payroll.netTotal)}</b></div>
              <div className="listitem"><span>Employer GOSI</span><b>{fmtMoney(data.payroll.gosiEmployer)}</b></div>
              <div className="listitem"><span>Total employer cost</span><b>{fmtMoney(data.payroll.employerCost)}</b></div>
              <div className="flex" style={{ marginTop: 12 }}>
                <Link className="btn sm" to="/payroll">Open payroll</Link>
                <Link className="btn sm ghost" to="/reports">Reports & CSV</Link>
              </div>
            </div>
            <div className="card">
              <h3>Needs attention</h3>
              {data.counts.pendingLeave === 0 && data.counts.pendingLoans === 0 ? (
                <p className="muted">Nothing waiting — all requests are handled. 🎉</p>
              ) : (
                <>
                  <div className="listitem"><span>Leave requests pending</span><Link to="/leave">{data.counts.pendingLeave}</Link></div>
                  <div className="listitem"><span>Loan applications pending</span><Link to="/loans">{data.counts.pendingLoans}</Link></div>
                  <div className="note">Managers can approve their own team; HR approves everything.</div>
                </>
              )}
              {me && (
                <div className="listitem" style={{ marginTop: 8 }}><span>My own record</span><Badge value={user.role} /></div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
