import { useState } from 'react';
import { Plus, Paperclip } from 'lucide-react';
import api, { fileUrl } from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Textarea, Select, Loading, Empty, Badge, StatusBadge, Tabs, fmtDate, fmtDateTime, isoDate, toast, errMsg } from '../components/ui';

const Files = ({ files }) => (files?.length ? (
  <div className="mt-1 flex flex-wrap gap-2">
    {files.map((f) => <a key={f.path} href={fileUrl(f.path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary-500 hover:underline"><Paperclip size={13} />{f.name}</a>)}
  </div>) : null);

const deadline = (a) => a.extendedDate || a.dueDate;

/* ---------------- Faculty ---------------- */
function Evaluate({ assignment, onClose }) {
  const { data, loading, reload } = useFetch(assignment ? `/assignments/${assignment._id}/submissions` : null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState('');
  const save = async (sub, status) => {
    const d = draft[sub._id] || {};
    setBusy(sub._id + status);
    try {
      await api.put(`/assignments/submissions/${sub._id}/evaluate`, { marks: d.marks ?? sub.marks, remarks: d.remarks ?? sub.remarks, status });
      toast(status === 'resubmit' ? 'Sent back for resubmission' : 'Evaluation saved'); reload();
    } catch (e) { errMsg(e); } finally { setBusy(''); }
  };
  const set = (id, k, v) => setDraft({ ...draft, [id]: { ...draft[id], [k]: v } });
  const submitted = data?.rows.filter((r) => r.submission).length || 0;

  return (
    <Modal open={!!assignment} onClose={onClose} wide title={assignment?.title || ''}>
      {loading || !data ? <Loading /> : (
        <>
          <p className="mb-4 text-sm text-ink-soft">{submitted} of {data.rows.length} submitted. Due {fmtDate(deadline(data.assignment))}. Maximum {data.assignment.maxMarks} marks.
            {data.assignment.hideIdentity && ' Student identity is hidden for this assignment.'}</p>
          <ul className="divide-y divide-primary-50">
            {data.rows.map(({ student, submission: s }) => (
              <li key={student._id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{student.name} <span className="text-sm font-normal text-ink-faint">{student.rollNo}</span></p>
                  {s ? <div className="flex items-center gap-2">{s.late && <Badge tone="red">Late</Badge>}<StatusBadge status={s.status} /></div> : <Badge tone="grey">Not submitted</Badge>}
                </div>
                {s && (
                  <>
                    <p className="mt-1 text-xs text-ink-faint">Submitted {fmtDateTime(s.submittedAt)}{s.attempts > 1 ? `, attempt ${s.attempts}` : ''}</p>
                    {s.text && <p className="mt-1 whitespace-pre-wrap text-sm">{s.text}</p>}
                    <Files files={s.files} />
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <Field label="Marks" className="w-24"><Input type="number" min={0} max={data.assignment.maxMarks} value={draft[s._id]?.marks ?? s.marks ?? ''} onChange={(e) => set(s._id, 'marks', e.target.value)} /></Field>
                      <Field label="Remarks" className="min-w-[200px] flex-1"><Input value={draft[s._id]?.remarks ?? s.remarks ?? ''} onChange={(e) => set(s._id, 'remarks', e.target.value)} /></Field>
                      <Button size="sm" onClick={() => save(s, 'evaluated')} loading={busy === s._id + 'evaluated'}>Save marks</Button>
                      <Button size="sm" variant="secondary" onClick={() => save(s, 'resubmit')} loading={busy === s._id + 'resubmit'}>Ask to resubmit</Button>
                    </div>
                  </>
                )}
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
  const { data, loading, reload } = useFetch('/assignments', course ? { course } : {});
  const [form, setForm] = useState(null);
  const [files, setFiles] = useState([]);
  const [evalOf, setEvalOf] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v !== '' && v != null && fd.append(k, k === 'dueDate' ? `${v}T23:59:00` : v));
      [...files].forEach((f) => fd.append('files', f));
      await api.post('/assignments', fd);
      toast('Assignment published'); setForm(null); setFiles([]); reload();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const extend = async (a) => {
    const v = window.prompt('New deadline (YYYY-MM-DD)', isoDate(new Date(Date.now() + 3 * 864e5)));
    if (!v) return;
    try { await api.put(`/assignments/${a._id}`, { extendedDate: `${v}T23:59:00` }); toast('Deadline extended'); reload(); } catch (e) { errMsg(e); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.title}" and all its submissions?`)) return;
    try { await api.delete(`/assignments/${a._id}`); toast('Assignment deleted'); reload(); } catch (e) { errMsg(e); }
  };
  const courseOpts = (courses.data || []).map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Field label="Course" className="w-full max-w-sm"><Select value={course} onChange={(e) => setCourse(e.target.value)} placeholder="All my courses" options={courseOpts} /></Field>
        <Button onClick={() => setForm({ course: course || courseOpts[0]?.value || '', title: '', description: '', topic: '', publishDate: isoDate(), dueDate: isoDate(new Date(Date.now() + 7 * 864e5)), maxMarks: 10, hideIdentity: false })}
          disabled={!courseOpts.length}><Plus size={16} />New assignment</Button>
      </div>
      <Card pad={false}>
        {loading ? <Loading /> : (
          <Table rows={data} empty="No assignments yet" columns={[
            { label: 'Assignment', render: (a) => <><p className="font-medium">{a.title}</p><p className="text-xs text-ink-faint">{a.course.code}{a.topic ? `, ${a.topic}` : ''}</p></> },
            { label: 'Published', render: (a) => fmtDate(a.publishDate) },
            { label: 'Due', render: (a) => <>{fmtDate(deadline(a))}{a.extendedDate && <span className="ml-1 text-xs text-sand-600">extended</span>}</> },
            { label: 'Submitted', render: (a) => `${a.submitted} / ${a.enrolled}` },
            { label: 'Evaluated', render: (a) => (a.submitted ? `${a.evaluated} / ${a.submitted}` : '-') },
            { label: '', className: 'text-right', render: (a) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" onClick={() => setEvalOf(a)}>Evaluate</Button>
                <Button size="sm" variant="ghost" onClick={() => extend(a)}>Extend</Button>
                <Button size="sm" variant="danger" onClick={() => remove(a)}>Delete</Button>
              </div>) },
          ]} />
        )}
      </Card>

      <Evaluate assignment={evalOf} onClose={() => { setEvalOf(null); reload(); }} />

      <Modal open={!!form} onClose={() => setForm(null)} title="New assignment"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button form="asg-form" type="submit" loading={busy}>Publish assignment</Button></>}>
        {form && (
          <form id="asg-form" onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Course" className="sm:col-span-2"><Select required value={form.course} onChange={set('course')} options={courseOpts} /></Field>
            <Field label="Title" className="sm:col-span-2"><Input required value={form.title} onChange={set('title')} /></Field>
            <Field label="Instructions" className="sm:col-span-2"><Textarea value={form.description} onChange={set('description')} /></Field>
            <Field label="Topic"><Input value={form.topic} onChange={set('topic')} /></Field>
            <Field label="Maximum marks"><Input type="number" min={1} required value={form.maxMarks} onChange={set('maxMarks')} /></Field>
            <Field label="Publish on" hint="Students see it from this date"><Input type="date" required value={form.publishDate} onChange={set('publishDate')} /></Field>
            <Field label="Due date"><Input type="date" required min={form.publishDate} value={form.dueDate.slice(0, 10)} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
            <Field label="Attachments" hint="Up to 5 files, 10 MB each" className="sm:col-span-2"><input type="file" multiple onChange={(e) => setFiles(e.target.files)} className="text-sm" /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={form.hideIdentity} onChange={set('hideIdentity')} />Hide student names during evaluation</label>
          </form>
        )}
      </Modal>
    </>
  );
}

/* ---------------- Student ---------------- */
function StudentView() {
  const { data, loading, reload } = useFetch('/assignments');
  const [tab, setTab] = useState('open');
  const [sub, setSub] = useState(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const fd = new FormData(); fd.append('text', text); [...files].forEach((f) => fd.append('files', f));
      await api.post(`/assignments/${sub._id}/submit`, fd);
      toast('Assignment submitted'); setSub(null); setText(''); setFiles([]); reload();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  const now = new Date();
  const open = data.filter((a) => !a.submission || a.submission.status === 'resubmit');
  const done = data.filter((a) => a.submission && a.submission.status !== 'resubmit');
  const list = tab === 'open' ? open : done;

  return (
    <>
      <Tabs tabs={[{ value: 'open', label: `To do (${open.length})` }, { value: 'done', label: `Submitted (${done.length})` }]} value={tab} onChange={setTab} />
      {!list.length ? <Card><Empty title={tab === 'open' ? 'Nothing to submit right now' : 'No submissions yet'} /></Card> : (
        <div className="space-y-3">
          {list.map((a) => {
            const overdue = new Date(deadline(a)) < now;
            const s = a.submission;
            return (
              <Card key={a._id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-faint">{a.course.code} {a.course.name}</p>
                    <h3 className="text-lg font-semibold">{a.title}</h3>
                    {a.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{a.description}</p>}
                    <Files files={a.files} />
                    {s?.remarks && <p className="mt-2 rounded-md bg-sand-50 px-3 py-2 text-sm"><b className="text-primary">Faculty remarks:</b> {s.remarks}</p>}
                  </div>
                  <div className="text-right">
                    <p className={`text-sm ${overdue && !s ? 'font-medium text-red-700' : 'text-ink-soft'}`}>Due {fmtDate(deadline(a))}</p>
                    <p className="text-xs text-ink-faint">{a.maxMarks} marks</p>
                    {s?.status === 'evaluated' && <p className="mt-1 font-serif text-2xl font-semibold text-primary">{s.marks}<span className="text-sm text-ink-faint"> / {a.maxMarks}</span></p>}
                    {s && <div className="mt-1"><StatusBadge status={s.status} /></div>}
                    {(!s || s.status === 'resubmit') && <Button size="sm" className="mt-2" onClick={() => setSub(a)}>{s ? 'Resubmit' : overdue ? 'Submit late' : 'Submit'}</Button>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!sub} onClose={() => setSub(null)} title={sub ? `Submit: ${sub.title}` : ''}
        footer={<><Button variant="secondary" onClick={() => setSub(null)}>Cancel</Button><Button form="sub-form" type="submit" loading={busy}>Submit assignment</Button></>}>
        <form id="sub-form" onSubmit={submit} className="space-y-4">
          <Field label="Answer or note"><Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <Field label="Attach files" hint="PDF, Word, images or ZIP. Up to 5 files, 10 MB each."><input type="file" multiple onChange={(e) => setFiles(e.target.files)} className="text-sm" /></Field>
          {sub && new Date(deadline(sub)) < now && <p className="text-sm text-red-700">The deadline has passed. This will be marked as a late submission.</p>}
        </form>
      </Modal>
    </>
  );
}

export default function Assignments() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Assignments" subtitle={user.role === 'student' ? 'Submit work and see marks and remarks.' : 'Publish assignments, track submissions and evaluate.'} />
      {user.role === 'student' ? <StudentView /> : <FacultyView />}
    </>
  );
}
