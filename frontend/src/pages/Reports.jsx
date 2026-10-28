import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { download } from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Button, Field, Input, Select, Loading, Empty, errMsg, toast } from '../components/ui';

const META = {
  'attendance-register': { name: 'Attendance register', desc: 'Date-wise attendance with totals and percentage for each student.', course: true, dates: true },
  'assignment-status': { name: 'Assignment status', desc: 'Who submitted, who is pending, late submissions, marks and remarks.', course: true },
  marks: { name: 'Marks statement', desc: 'Marks in every assessment with total and percentage.', course: true },
  'class-performance': { name: 'Class performance', desc: 'Average, highest, lowest and pass percentage per assessment.', course: true },
  'my-attendance': { name: 'My attendance', desc: 'Every session you attended or missed.' },
  'my-results': { name: 'My results', desc: 'All published marks.' },
  'fee-collection': { name: 'Fee collection', desc: 'Payments received with mode, receipt and transaction details.', dates: true },
  'fee-dues': { name: 'Fee dues', desc: 'Outstanding fees with days overdue.' },
  'messages-sent': { name: 'Messages sent', desc: 'Messages with channels, recipients and status.', dates: true },
  calendar: { name: 'Calendar', desc: 'Exams, events, holidays and other calendar entries with dates.', dates: true, kind: true },
  holidays: { name: 'Holiday list', desc: 'Declared holidays with dates and days.', dates: true },
  requests: { name: 'Service requests', desc: 'Requests raised with status and remarks.', dates: true },
  users: { name: 'User list', desc: 'Accounts with role, ID, batch and contact.', role: true },
};

function ReportCard({ type, courses }) {
  const m = META[type];
  const [p, setP] = useState({ course: '', from: '', to: '', role: '', kind: '' });
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (m.course && !p.course) return toast('Select a course first', 'error');
    setBusy(true);
    try { await download(`/reports/${type}`, Object.fromEntries(Object.entries(p).filter(([, v]) => v)), type); }
    catch (e) { errMsg(e); } finally { setBusy(false); }
  };
  return (
    <Card>
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-0.5 shrink-0 text-sand-500" size={20} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">{m.name}</h3>
          <p className="text-sm text-ink-soft">{m.desc}</p>
        </div>
      </div>
      {(m.course || m.dates || m.role || m.kind) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {m.kind && <Field label="Type" className="sm:col-span-2"><Select value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value })} placeholder="All types" options={[{ value: 'exam', label: 'Exam' }, { value: 'event', label: 'Event' }, { value: 'holiday', label: 'Holiday' }, { value: 'other', label: 'Other' }]} /></Field>}
          {m.course && <Field label="Course" className="sm:col-span-2"><Select value={p.course} onChange={(e) => setP({ ...p, course: e.target.value })} placeholder="Choose a course" options={(courses || []).map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))} /></Field>}
          {m.dates && <><Field label="From"><Input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></Field><Field label="To"><Input type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></Field></>}
          {m.role && <Field label="Role" className="sm:col-span-2"><Select value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })} placeholder="All roles" options={['student', 'faculty', 'staff', 'admin']} /></Field>}
        </div>
      )}
      <Button variant="secondary" className="mt-4" onClick={run} loading={busy}>Download Excel</Button>
    </Card>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const { data, loading } = useFetch('/reports');
  const courses = useFetch(['admin', 'faculty'].includes(user.role) ? '/courses' : null);
  return (
    <>
      <PageHeader title={user.role === 'student' ? 'Downloads' : 'Reports'} subtitle="Reports download as Excel files. PDF export will be added in a later release." />
      {loading ? <Loading /> : !data?.length ? <Empty title="No reports available for your role" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.filter((t) => META[t]).map((t) => <ReportCard key={t} type={t} courses={courses.data} />)}
        </div>
      )}
    </>
  );
}
