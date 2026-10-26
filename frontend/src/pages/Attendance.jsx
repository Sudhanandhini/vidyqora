import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, usePaged, Pagination, PageHeader, Card, Table, Button, Field, Input, Select, Loading, Empty, Badge, Modal, Tabs, fmtDate, isoDate, toast, errMsg } from '../components/ui';

// `present` mirrors PRESENT_CODES in backend/src/models/Attendance.js
const CODES = [
  { v: 'P', label: 'Present', cls: 'bg-emerald-600 text-white', present: true, desc: 'Attended the class.' },
  { v: 'A', label: 'Absent', cls: 'bg-red-600 text-white', present: false, desc: 'Did not attend, without approved leave.' },
  { v: 'L', label: 'Leave', cls: 'bg-amber-500 text-white', present: false, desc: 'Did not attend, with approved leave (medical, personal).' },
  { v: 'OD', label: 'On duty', cls: 'bg-primary-500 text-white', present: true, desc: 'Away on official college work: sports, competitions, seminars, events.' },
  { v: 'LT', label: 'Late', cls: 'bg-sand-400 text-primary', present: true, desc: 'Attended, but arrived after the class started.' },
];

function CodeLegend() {
  return (
    <div className="border-t border-primary-50 bg-canvas/60 px-4 py-3">
      <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-ink-faint">What the codes mean</p>
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
        {CODES.map((c) => (
          <div key={c.v} className="flex items-start gap-2.5">
            <dt className={`mt-px inline-flex h-6 min-w-[34px] shrink-0 items-center justify-center rounded px-1.5 text-[11.5px] font-semibold ${c.cls}`}>{c.v}</dt>
            <dd className="text-ink-soft">
              <b className="text-primary">{c.label}</b>: {c.desc}{' '}
              <span className={c.present ? 'text-emerald-700' : 'text-red-700'}>{c.present ? 'Counts as present.' : 'Counts as absent.'}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MarkAttendance() {
  const [sp] = useSearchParams();
  const courses = useFetch('/courses');
  const [course, setCourse] = useState(sp.get('course') || '');
  const [date, setDate] = useState(isoDate());
  const [period, setPeriod] = useState(1);
  const [topic, setTopic] = useState('');
  const [rows, setRows] = useState(null);
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!course && courses.data?.length) setCourse(courses.data[0]._id); }, [courses.data, course]);
  useEffect(() => {
    if (!course) return;
    let alive = true;
    setRows(null);
    Promise.all([api.get(`/courses/${course}`), api.get('/attendance', { params: { course, date, period } })])
      .then(([c, a]) => {
        if (!alive) return;
        const prev = Object.fromEntries((a.data?.records || []).map((r) => [r.student, r.status]));
        setExisting(!!a.data); setTopic(a.data?.topic || '');
        setRows(c.data.students.map((s) => ({ student: s, status: prev[s._id] || 'P' })));
      }).catch(errMsg);
    return () => { alive = false; };
  }, [course, date, period]);

  const setAll = (status) => setRows(rows.map((r) => ({ ...r, status })));
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/attendance', { course, date, period, topic, records: rows.map((r) => ({ student: r.student._id, status: r.status })) });
      setExisting(true); toast('Attendance saved');
    } catch (e) { errMsg(e); } finally { setBusy(false); }
  };
  const counts = CODES.map((c) => [c, rows?.filter((r) => r.status === c.v).length || 0]);

  if (courses.loading) return <Loading />;
  if (!courses.data?.length) return <Empty title="No courses assigned" hint="Attendance can be marked once the admin office assigns you a course." />;
  return (
    <Card pad={false}>
      <div className="grid gap-3 border-b border-primary-50 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_110px_2fr]">
        <Field label="Course"><Select value={course} onChange={(e) => setCourse(e.target.value)} options={courses.data.map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))} /></Field>
        <Field label="Date"><Input type="date" max={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Period"><Select value={period} onChange={(e) => setPeriod(Number(e.target.value))} options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: `Period ${n}` }))} /></Field>
        <Field label="Topic covered"><Input value={topic} placeholder="Optional" onChange={(e) => setTopic(e.target.value)} /></Field>
      </div>
      {!rows ? <Loading /> : !rows.length ? <Empty title="No students enrolled in this course" /> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-wrap gap-3 text-sm">
              {counts.map(([c, n]) => <span key={c.v} className="text-ink-soft">{c.label} <b className="text-primary">{n}</b></span>)}
              {existing && <Badge tone="green">Saved earlier</Badge>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAll('P')}>All present</Button>
              <Button size="sm" variant="secondary" onClick={() => setAll('A')}>All absent</Button>
            </div>
          </div>
          <CodeLegend />
          <ul className="divide-y divide-primary-50 border-t border-primary-50">
            {rows.map((r, i) => (
              <li key={r.student._id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <span className="w-24 text-sm text-ink-faint">{r.student.rollNo}</span>
                <span className="min-w-[160px] flex-1 font-medium">{r.student.name}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={`Status for ${r.student.name}`}>
                  {CODES.map((c) => (
                    <button key={c.v} role="radio" aria-checked={r.status === c.v} title={`${c.label}: ${c.desc}`}
                      onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, status: c.v } : x)))}
                      className={`h-8 min-w-[38px] rounded px-2 text-[12.5px] font-semibold ${r.status === c.v ? c.cls : 'bg-canvas text-ink-soft hover:bg-primary-50'}`}>{c.v}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="sticky bottom-0 flex justify-end border-t border-primary-100 bg-white p-4">
            <Button onClick={save} loading={busy}>{existing ? 'Update attendance' : 'Save attendance'}</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Register() {
  const courses = useFetch('/courses');
  const [course, setCourse] = useState('');
  const id = course || courses.data?.[0]?._id;
  const { data, loading } = useFetch(id ? `/attendance/course/${id}/summary` : null);
  if (courses.loading) return <Loading />;
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-primary-50 p-4">
        <Field label="Course" className="w-full max-w-sm"><Select value={id || ''} onChange={(e) => setCourse(e.target.value)} options={(courses.data || []).map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))} /></Field>
        {data && <p className="text-sm text-ink-soft">{data.sessions} sessions recorded</p>}
      </div>
      {loading || !data ? <Loading /> : (
        <Table rows={data.rows} rowKey={(r) => r.student._id} columns={[
          { label: 'Roll number', render: (r) => r.student.rollNo },
          { label: 'Name', render: (r) => r.student.name },
          { label: 'Present', key: 'present' }, { label: 'Sessions', key: 'total' },
          { label: 'Attendance', render: (r) => (r.pct == null ? '-' : <Badge tone={r.pct < 75 ? 'red' : 'green'}>{r.pct}%</Badge>) },
        ]} />
      )}
    </Card>
  );
}

function StudentView() {
  const { data, loading } = useFetch('/attendance/my');
  const [log, setLog] = useState(null);
  const logData = useFetch(log ? `/attendance/my/${log._id}` : null);
  const logPaged = usePaged(logData.data, (d) => `${d.date}-${d.period}`);
  if (loading) return <Loading />;
  return (
    <>
      <div className="mb-5 flex items-baseline gap-3">
        <span className={`font-serif text-4xl font-semibold ${data.overall != null && data.overall < 75 ? 'text-red-700' : 'text-primary'}`}>{data.overall ?? '-'}%</span>
        <span className="text-ink-soft">overall attendance. The minimum requirement is 75%.</span>
      </div>
      <Card pad={false}>
        <Table rows={data.rows} rowKey={(r) => r.course._id} empty="No attendance recorded yet" columns={[
          { label: 'Course', render: (r) => <><p className="font-medium">{r.course.code}</p><p className="text-sm text-ink-soft">{r.course.name}</p></> },
          { label: 'Present', key: 'present' }, { label: 'Sessions', key: 'total' },
          { label: 'Attendance', render: (r) => <Badge tone={r.pct < 75 ? 'red' : 'green'}>{r.pct}%</Badge> },
          { label: '', className: 'text-right', render: (r) => <Button size="sm" variant="ghost" onClick={() => setLog(r.course)}>Day-wise</Button> },
        ]} />
      </Card>
      <Modal open={!!log} onClose={() => setLog(null)} title={log ? `${log.code} attendance` : ''}>
        {logData.loading ? <Loading /> : (
          <>
          <ul className="divide-y divide-primary-50">
            {logPaged.items.map((d, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span>{fmtDate(d.date)} <span className="text-xs text-ink-faint">Period {d.period}{d.topic ? `, ${d.topic}` : ''}</span></span>
                <Badge tone={d.status === 'A' ? 'red' : d.status === 'L' ? 'amber' : 'green'}>{CODES.find((c) => c.v === d.status)?.label}</Badge>
              </li>
            ))}
          </ul>
          <Pagination paged={logPaged} className="-mx-5 -mb-5 mt-2" />
          </>
        )}
      </Modal>
    </>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const [tab, setTab] = useState('mark');
  if (user.role === 'student') return <><PageHeader title="Attendance" subtitle="Course-wise attendance for the current term." /><StudentView /></>;
  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark period-wise attendance. Absent students are notified." />
      <Tabs tabs={[{ value: 'mark', label: 'Mark attendance' }, { value: 'register', label: 'Register summary' }]} value={tab} onChange={setTab} />
      {tab === 'mark' ? <MarkAttendance /> : <Register />}
    </>
  );
}
