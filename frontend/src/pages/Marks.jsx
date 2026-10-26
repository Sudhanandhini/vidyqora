import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Select, Loading, Empty, StatusBadge, fmtDate, isoDate, toast, errMsg } from '../components/ui';

function MarkEntry({ id, onClose }) {
  const { data, loading } = useFetch(id ? `/assessments/${id}` : null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (data) setRows(data.marks); }, [data]);
  const locked = data && ['verified', 'published'].includes(data.status);

  const save = async (status) => {
    setBusy(status || 'save');
    try {
      await api.put(`/assessments/${id}/marks`, { status, marks: rows.map((r) => ({ student: r.student._id, marks: r.marks, absent: r.absent })) });
      toast(status === 'published' ? 'Result published to students' : status === 'submitted' ? 'Marks submitted' : 'Draft saved');
      if (status) onClose();
    } catch (e) { errMsg(e); } finally { setBusy(''); }
  };
  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const entered = rows.filter((r) => r.absent || r.marks !== '').length;

  return (
    <Modal open={!!id} onClose={onClose} wide title={data ? `${data.course.code} ${data.name}` : 'Marks'}
      footer={data && !locked && (
        <>
          <Button variant="secondary" onClick={() => save()} loading={busy === 'save'}>Save draft</Button>
          <Button variant="secondary" onClick={() => save('submitted')} loading={busy === 'submitted'}>Submit for verification</Button>
          <Button onClick={() => save('published')} loading={busy === 'published'}>Publish result</Button>
        </>)}>
      {loading || !data ? <Loading /> : (
        <>
          <p className="mb-3 text-sm text-ink-soft">Maximum {data.maxMarks} marks. {entered} of {rows.length} entered. {locked && 'Marks are locked.'}</p>
          <ul className="divide-y divide-primary-50">
            {rows.map((r, i) => (
              <li key={r.student._id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-24 text-sm text-ink-faint">{r.student.rollNo}</span>
                <span className="min-w-[160px] flex-1">{r.student.name}</span>
                <Input type="number" min={0} max={data.maxMarks} step="0.5" disabled={locked || r.absent} aria-label={`Marks for ${r.student.name}`}
                  className={`!w-24 ${r.marks !== '' && (r.marks < 0 || r.marks > data.maxMarks) ? '!border-red-500' : ''}`}
                  value={r.absent ? '' : r.marks} onChange={(e) => set(i, { marks: e.target.value === '' ? '' : Number(e.target.value) })} />
                <label className="flex items-center gap-1.5 text-sm text-ink-soft">
                  <input type="checkbox" disabled={locked} className="h-4 w-4 accent-[#062a52]" checked={r.absent} onChange={(e) => set(i, { absent: e.target.checked })} />Absent
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

function FacultyView() {
  const courses = useFetch('/courses');
  const [course, setCourse] = useState('');
  const id = course || courses.data?.[0]?._id;
  const { data, loading, reload } = useFetch(id ? '/assessments' : null, { course: id });
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data: a } = await api.post('/assessments', { ...form, course: id }); toast('Assessment created'); setForm(null); reload(); setOpen(a._id); }
    catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.name}?`)) return;
    try { await api.delete(`/assessments/${a._id}`); toast('Assessment deleted'); reload(); } catch (e) { errMsg(e); }
  };

  if (courses.loading) return <Loading />;
  if (!courses.data?.length) return <Empty title="No courses assigned" />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Field label="Course" className="w-full max-w-sm"><Select value={id} onChange={(e) => setCourse(e.target.value)} options={courses.data.map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))} /></Field>
        <Button onClick={() => setForm({ name: '', maxMarks: 25, date: isoDate() })}><Plus size={16} />New assessment</Button>
      </div>
      <Card pad={false}>
        {loading ? <Loading /> : (
          <Table rows={data} empty="No assessments for this course yet" columns={[
            { label: 'Assessment', render: (a) => <span className="font-medium">{a.name}</span> },
            { label: 'Date', render: (a) => fmtDate(a.date) },
            { label: 'Max marks', key: 'maxMarks' },
            { label: 'Entered', render: (a) => `${a.marks.filter((m) => m.absent || typeof m.marks === 'number').length} / ${a.marks.length}` },
            { label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            { label: '', className: 'text-right', render: (a) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" onClick={() => setOpen(a._id)}>{['verified', 'published'].includes(a.status) ? 'View' : 'Enter marks'}</Button>
                {a.status === 'draft' && <Button size="sm" variant="danger" onClick={() => remove(a)}>Delete</Button>}
              </div>) },
          ]} />
        )}
      </Card>
      <MarkEntry id={open} onClose={() => { setOpen(null); reload(); }} />
      <Modal open={!!form} onClose={() => setForm(null)} title="New assessment"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button form="as-form" type="submit" loading={busy}>Create and enter marks</Button></>}>
        {form && (
          <form id="as-form" onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input required placeholder="Internal Test 2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Maximum marks"><Input type="number" min={1} required value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} /></Field>
            <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          </form>
        )}
      </Modal>
    </>
  );
}

function StudentView() {
  const { data, loading } = useFetch('/assessments/my');
  if (loading) return <Loading />;
  return (
    <Card pad={false}>
      <Table rows={data} empty="No results published yet" columns={[
        { label: 'Course', render: (r) => <><p className="font-medium">{r.course.code}</p><p className="text-sm text-ink-soft">{r.course.name}</p></> },
        { label: 'Assessment', key: 'name' },
        { label: 'Date', render: (r) => fmtDate(r.date) },
        { label: 'Marks', render: (r) => (r.absent ? <span className="text-red-700">Absent</span> : <b className="text-primary">{r.marks ?? '-'} / {r.maxMarks}</b>) },
        { label: 'Class average', render: (r) => r.classAvg ?? '-' },
      ]} />
    </Card>
  );
}

export default function Marks() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title={user.role === 'student' ? 'Results' : 'Marks'} subtitle={user.role === 'student' ? 'Published marks for your assessments.' : 'Create assessments, enter marks and publish results.'} />
      {user.role === 'student' ? <StudentView /> : <FacultyView />}
    </>
  );
}
