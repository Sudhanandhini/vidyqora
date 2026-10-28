import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Table, Button, Field, Input, Select, Loading, Empty, Badge, Tabs, fmtDate, isoDate, toast, errMsg } from '../components/ui';

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

const CODE = Object.fromEntries(CODES.map((c) => [c.v, c]));
const monthStart = () => { const d = new Date(); return isoDate(new Date(d.getFullYear(), d.getMonth(), 1)); };

/** Date-wise register: students down the side, one column per class held (date + period), code in each cell. */
function Register() {
  const courses = useFetch('/courses');
  const [course, setCourse] = useState('');
  const [range, setRange] = useState({ from: monthStart(), to: isoDate() });
  const id = course || courses.data?.[0]?._id;
  const { data, loading } = useFetch(id ? `/attendance/course/${id}/summary` : null, range);
  if (courses.loading) return <Loading />;
  const sessions = data?.sessionList || [];
  const sameDay = (i) => i > 0 && isoDate(sessions[i - 1].date) === isoDate(sessions[i].date);
  const th = 'border-b-2 border-sand-300 bg-primary-50 px-2 py-2 text-[12px] font-semibold text-primary';
  const sticky = 'sticky z-10 bg-white';
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-end gap-3 border-b border-primary-50 p-4">
        <Field label="Course" className="w-full max-w-sm"><Select value={id || ''} onChange={(e) => setCourse(e.target.value)} options={(courses.data || []).map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))} /></Field>
        <Field label="From"><Input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <Button size="sm" variant="ghost" className="mb-1" onClick={() => setRange({ from: '', to: '' })}>All dates</Button>
        {data && <p className="mb-2 ml-auto text-sm text-ink-soft">{data.sessions} class{data.sessions === 1 ? '' : 'es'} in this period</p>}
      </div>
      {loading || !data ? <Loading /> : !data.rows.length ? <Empty title="No students enrolled in this course" /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  <th className={`${th} ${sticky} left-0 min-w-[96px] text-left`}>Roll no.</th>
                  <th className={`${th} ${sticky} left-[96px] min-w-[150px] border-r border-r-primary-100 text-left`}>Name</th>
                  {sessions.map((s, i) => (
                    <th key={s._id} className={`${th} min-w-[46px] text-center ${sameDay(i) ? '' : 'border-l border-l-primary-100'}`} title={s.topic ? `Topic: ${s.topic}` : undefined}>
                      {sameDay(i) ? <span className="block text-[11px] text-ink-faint">&nbsp;</span>
                        : <span className="block whitespace-nowrap">{new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
                      <span className="block text-[10.5px] font-normal text-ink-faint">P{s.period}</span>
                    </th>
                  ))}
                  {!sessions.length && <th className={`${th} text-left font-normal text-ink-faint`}>No classes marked in this period</th>}
                  <th className={`${th} border-l border-l-primary-100 text-center`}>Present</th>
                  <th className={`${th} text-center`}>Classes</th>
                  <th className={`${th} text-center`}>%</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.student._id} className="border-b border-primary-50 hover:bg-sand-50">
                    <td className={`${sticky} left-0 px-2 py-1.5 text-ink-soft`}>{r.student.rollNo}</td>
                    <td className={`${sticky} left-[96px] border-r border-primary-100 px-2 py-1.5 font-medium`}>{r.student.name}</td>
                    {sessions.map((s, i) => {
                      const code = r.codes?.[s._id];
                      return (
                        <td key={s._id} className={`px-1 py-1.5 text-center ${sameDay(i) ? '' : 'border-l border-primary-50'}`}>
                          {code ? <span title={CODE[code]?.label} className={`inline-flex h-6 min-w-[30px] items-center justify-center rounded px-1 text-[11.5px] font-semibold ${CODE[code]?.cls}`}>{code}</span>
                            : <span className="text-ink-faint" title="Not marked">·</span>}
                        </td>
                      );
                    })}
                    {!sessions.length && <td />}
                    <td className="border-l border-primary-100 px-2 text-center font-semibold">{r.present}</td>
                    <td className="px-2 text-center">{r.total}</td>
                    <td className="px-2 text-center">{r.pct == null ? '-' : <Badge tone={r.pct < 75 ? 'red' : 'green'}>{r.pct}%</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3 border-t border-primary-50 px-4 py-3 text-[12.5px] text-ink-soft">
            {CODES.map((c) => <span key={c.v} className="flex items-center gap-1.5"><span className={`inline-flex h-5 min-w-[26px] items-center justify-center rounded px-1 text-[11px] font-semibold ${c.cls}`}>{c.v}</span>{c.label}</span>)}
            <span className="flex items-center gap-1.5"><span className="font-semibold">·</span>Not marked</span>
            <span className="ml-auto">Below 75% is shown in red.</span>
          </div>
        </>
      )}
    </Card>
  );
}

/** Student: course-wise percentages and the date-wise attendance each faculty marked. */
function StudentView() {
  const { data, loading } = useFetch('/attendance/my');
  const [f, setF] = useState({ course: '', status: '', from: '', to: '' });
  const log = useFetch('/attendance/my/log', { course: f.course, from: f.from, to: f.to });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (loading) return <Loading />;
  const rows = (log.data || []).filter((d) => !f.status || d.status === f.status);
  return (
    <>
      <div className="mb-5 flex items-baseline gap-3">
        <span className={`font-serif text-4xl font-semibold ${data.overall != null && data.overall < 75 ? 'text-red-700' : 'text-primary'}`}>{data.overall ?? '-'}%</span>
        <span className="text-ink-soft">overall attendance. The minimum requirement is 75%.</span>
      </div>
      {!data.rows.length ? <Card><Empty title="No attendance recorded yet" hint="Attendance appears here once your faculty mark it." /></Card> : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.rows.map((r) => (
              <button key={r.course._id} onClick={() => setF({ ...f, course: f.course === r.course._id ? '' : r.course._id })}
                className={`panel flex items-center gap-4 p-4 text-left transition hover:ring-2 hover:ring-primary-100 ${f.course === r.course._id ? 'ring-2 ring-primary' : ''}`}>
                <span className={`font-serif text-3xl font-semibold ${r.pct < 75 ? 'text-red-700' : 'text-primary'}`}>{r.pct}%</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{r.course.code}</span>
                  <span className="block truncate text-sm text-ink-soft">{r.course.name}</span>
                  <span className="block text-xs text-ink-faint">{r.course.faculty?.name || 'Faculty not assigned'} · {r.present} of {r.total} classes</span>
                </span>
              </button>
            ))}
          </div>
          <Card pad={false} title="Date-wise attendance">
            <div className="flex flex-wrap items-end gap-3 border-b border-primary-50 p-4">
              <Field label="Course"><Select value={f.course} onChange={set('course')} placeholder="All courses" options={data.rows.map((r) => ({ value: r.course._id, label: `${r.course.code} ${r.course.name}` }))} /></Field>
              <Field label="Status"><Select value={f.status} onChange={set('status')} placeholder="All" options={CODES.map((c) => ({ value: c.v, label: c.label }))} /></Field>
              <Field label="From"><Input type="date" value={f.from} max={f.to || undefined} onChange={set('from')} /></Field>
              <Field label="To"><Input type="date" value={f.to} min={f.from || undefined} onChange={set('to')} /></Field>
              {(f.course || f.status || f.from || f.to) && <Button size="sm" variant="ghost" className="mb-1" onClick={() => setF({ course: '', status: '', from: '', to: '' })}>Clear</Button>}
            </div>
            {log.loading ? <Loading /> : (
              <Table rows={rows} empty="No classes match these filters" columns={[
                { label: 'Date', render: (d) => <span className="whitespace-nowrap font-medium">{fmtDate(d.date)}<span className="block text-xs font-normal text-ink-faint">{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'long' })}</span></span> },
                { label: 'Period', render: (d) => `Period ${d.period}` },
                { label: 'Course', render: (d) => <><p className="font-medium">{d.course.code}</p><p className="text-xs text-ink-faint">{d.course.name}</p></> },
                { label: 'Faculty', render: (d) => d.faculty || '-' },
                { label: 'Topic', render: (d) => <span className="text-sm text-ink-soft">{d.topic || '-'}</span> },
                { label: 'Status', render: (d) => { const c = CODES.find((x) => x.v === d.status); return c ? <span title={c.desc} className={`inline-flex h-6 items-center rounded px-2 text-[12px] font-semibold ${c.cls}`}>{c.v} · {c.label}</span> : '-'; } },
              ]} />
            )}
          </Card>
        </>
      )}
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
      <Tabs tabs={[{ value: 'mark', label: 'Mark attendance' }, { value: 'register', label: 'Date-wise register' }]} value={tab} onChange={setTab} />
      {tab === 'mark' ? <MarkAttendance /> : <Register />}
    </>
  );
}
