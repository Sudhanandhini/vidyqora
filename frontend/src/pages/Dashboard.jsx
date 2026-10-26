import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFetch, Loading, PageHeader, Card, Stat, Badge, Empty, fmtDate, inr } from '../components/ui';

const EVENT_TONE = { holiday: 'sand', exam: 'red', event: 'blue', other: 'grey' };

function Events({ events }) {
  return (
    <Card title="Coming up" actions={<Link to="/calendar" className="text-sm font-medium text-primary-500 hover:underline">Calendar</Link>}>
      {!events?.length ? <Empty title="No upcoming events" /> : (
        <ul className="divide-y divide-primary-50">
          {events.map((e) => (
            <li key={e._id} className="flex items-start gap-4 py-2.5">
              <div className="w-12 shrink-0 text-center">
                <p className="font-serif text-xl font-semibold leading-none text-primary">{new Date(e.start).getDate()}</p>
                <p className="text-[11px] text-ink-faint">{new Date(e.start).toLocaleDateString('en-IN', { month: 'short' })}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{e.title}</p>
                {String(e.start) !== String(e.end) && <p className="text-xs text-ink-faint">until {fmtDate(e.end)}</p>}
              </div>
              <Badge tone={EVENT_TONE[e.type]}>{e.type[0].toUpperCase() + e.type.slice(1)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading } = useFetch('/dashboard');
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const head = <PageHeader title={`${greeting()}, ${user.name.replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '').split(' ')[0]}`} subtitle={today} />;
  if (loading || !data) return <>{head}<Loading /></>;
  const s = data.stats;

  if (data.role === 'student') {
    return (
      <>
        {head}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Attendance" value={s.attendance != null ? `${s.attendance}%` : '-'} tone={s.attendance != null && s.attendance < 75 ? 'warn' : ''} note={s.attendance != null && s.attendance < 75 ? 'Below 75% requirement' : 'All courses'} />
          <Stat label="Assignments to submit" value={s.pendingAssignments} />
          <Stat label="Fee due" value={inr(s.feeDue)} tone={s.feeDue ? 'warn' : ''} />
          <Stat label="Unread notifications" value={s.unread} />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Due soon" actions={<Link to="/assignments" className="text-sm font-medium text-primary-500 hover:underline">All assignments</Link>}>
            {!data.pending.length ? <Empty title="You are all caught up" hint="New assignments appear here when your faculty publish them." /> : (
              <ul className="divide-y divide-primary-50">
                {data.pending.map((a) => (
                  <li key={a._id} className="flex items-center justify-between gap-3 py-2.5">
                    <div><p className="font-medium">{a.title}</p><p className="text-xs text-ink-faint">{a.course?.code}</p></div>
                    <span className="whitespace-nowrap text-sm text-ink-soft">Due {fmtDate(a.extendedDate || a.dueDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Events events={data.events} />
          <Card title="Latest results" className="lg:col-span-2" actions={<Link to="/marks" className="text-sm font-medium text-primary-500 hover:underline">All results</Link>}>
            {!data.results.length ? <Empty title="No results published yet" /> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.results.map((r) => (
                  <div key={r._id} className="rounded-md border border-primary-100 px-4 py-3">
                    <p className="text-xs text-ink-faint">{r.course?.code}</p>
                    <p className="font-medium">{r.name}</p>
                    <p className="mt-1 font-serif text-xl font-semibold text-primary">{r.marks ?? 'AB'}<span className="text-sm text-ink-faint"> / {r.maxMarks}</span></p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </>
    );
  }

  if (data.role === 'faculty') {
    return (
      <>
        {head}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Courses" value={s.courses} note={`${s.students} students`} />
          <Stat label="Submissions to evaluate" value={s.pendingEvaluations} tone={s.pendingEvaluations ? 'warn' : ''} />
          <Stat label="Mark sheets in draft" value={s.draftMarks} />
          <Stat label="Class attendance" value={s.attendance != null ? `${s.attendance}%` : '-'} note="Across your courses" />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card title="My courses" pad={false}>
            {!data.courses.length ? <Empty title="No courses assigned" hint="The admin office assigns courses to faculty." /> : (
              <ul className="divide-y divide-primary-50">
                {data.courses.map((c) => (
                  <li key={c._id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.code} <span className="font-normal text-ink-soft">{c.name}</span></p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 w-32 rounded-full bg-primary-50"><div className="h-full rounded-full bg-sand-400" style={{ width: `${c.progress}%` }} /></div>
                        <span className="text-xs text-ink-faint">{c.progress}% syllabus</span>
                      </div>
                    </div>
                    {c.markedToday ? <Badge tone="green">Attendance marked</Badge>
                      : <Link to={`/attendance?course=${c._id}`} className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-white hover:bg-primary-600">Mark attendance</Link>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Events events={data.events} />
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Students" value={s.students} note={`${s.faculty} faculty, ${s.courses} courses`} />
        <Stat label="Attendance today" value={s.attendanceToday != null ? `${s.attendanceToday}%` : '-'} note={s.attendanceToday == null ? 'Not marked yet' : ''} />
        <Stat label="Fees collected" value={inr(s.feeCollected)} />
        <Stat label="Fees outstanding" value={inr(s.feeDue)} tone={s.feeDue ? 'warn' : ''} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={`Open requests (${s.pendingRequests})`} actions={<Link to="/requests" className="text-sm font-medium text-primary-500 hover:underline">Review</Link>}>
          {!data.recentRequests.length ? <Empty title="No open requests" /> : (
            <ul className="divide-y divide-primary-50">
              {data.recentRequests.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-3 py-2.5">
                  <div><p className="font-medium">{r.type}</p><p className="text-xs text-ink-faint">{r.student?.name} {r.student?.rollNo}</p></div>
                  <span className="text-sm text-ink-soft">{fmtDate(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Events events={data.events} />
      </div>
      <p className="mt-6 text-sm text-ink-faint">{s.messagesThisMonth} messages sent this month.</p>
    </>
  );
}
