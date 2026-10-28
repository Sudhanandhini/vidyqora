import { useEffect, useState } from 'react';
import { Plus, Trash2, UserPlus, X } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { FilterBar, SearchBox, FilterSelect, DeletedBadge, useTrash, deleteWithRestore, matches } from '../components/listTools';
import { DEFAULT_SCHEME, PAPER_TYPES, schemeOf, schemeTotal, schemeText } from '../components/syllabus';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Select, MasterSelect, useMasters, Tabs, Loading, Empty, isoDate, fmtDate, toast, errMsg } from '../components/ui';

const BLANK = { code: '', name: '', department: '', level: '', program: '', batch: '', section: '', semester: '', faculty: '',
  type: 'theory', lectures: 3, tutorials: 0, practicals: 0, credits: 3, hours: 3, evaluation: DEFAULT_SCHEME.theory };

/** Edit the evaluation scheme parts (e.g. MSE 40, ESE 60) with a live sub-total. */
function SchemeEditor({ value, onChange }) {
  const setPart = (i, patch) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="rounded-md border border-primary-100 p-3">
      <div className="mb-2 grid grid-cols-[72px_1fr_68px_68px_28px] gap-2 text-xs font-semibold text-ink-soft"><span>Short</span><span>Name</span><span>Max</span><span>Pass</span><span /></div>
      {value.map((p, i) => (
        <div key={i} className="mb-2 grid grid-cols-[72px_1fr_68px_68px_28px] items-center gap-2">
          <Input required className="!py-1 uppercase" value={p.key} placeholder="MSE" aria-label="Short name" onChange={(e) => setPart(i, { key: e.target.value.toUpperCase() })} />
          <Input className="!py-1" value={p.label || ''} placeholder="Mid-Semester Exam" aria-label="Name" onChange={(e) => setPart(i, { label: e.target.value })} />
          <Input required type="number" min={1} className="!py-1" value={p.max} aria-label="Maximum marks" onChange={(e) => setPart(i, { max: e.target.value === '' ? '' : Number(e.target.value) })} />
          <Input type="number" min={0} max={p.max || undefined} className="!py-1" value={p.pass ?? ''} placeholder="none" aria-label="Pass marks" onChange={(e) => setPart(i, { pass: e.target.value === '' ? '' : Number(e.target.value) })} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} disabled={value.length === 1} className="p-1 text-ink-faint hover:text-red-700 disabled:opacity-30" aria-label="Remove part"><X size={14} /></button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...value, { key: '', label: '', max: 10 }])}><Plus size={13} />Add part</Button>
        <span className="text-sm">Sub-total <b>{schemeTotal(value)}</b></span>
      </div>
    </div>
  );
}

/** Courses laid out like the university syllabus sheet: one block per program + semester, theory and sessional tables, totals. */
function SyllabusView({ courses }) {
  const groups = {};
  courses.forEach((c) => { const k = `${c.level || ''}|${c.program || 'Other'}|${c.semester || '-'}`; (groups[k] ||= []).push(c); });
  const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!keys.length) return <Empty title="No courses to show" />;
  const th = 'border border-primary-200 bg-primary-50 px-2 py-1.5 text-[12px] font-semibold uppercase';
  const td = 'border border-primary-100 px-2 py-1.5';
  return keys.map((k) => {
    const [level, program, semester] = k.split('|');
    const list = groups[k].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const total = list.reduce((t, c) => ({ marks: t.marks + schemeTotal(schemeOf(c)), credits: t.credits + Number(c.credits || 0), hours: t.hours + Number(c.hours || 0) }), { marks: 0, credits: 0, hours: 0 });
    return (
      <section key={k} className="panel mb-6 overflow-x-auto p-4">
        <h3 className="text-center font-serif text-xl font-semibold">Syllabus for {program}{level ? ` (${level})` : ''}</h3>
        <p className="mb-3 bg-primary-50 py-1 text-center text-sm font-semibold uppercase tracking-wide">{semester}</p>
        {PAPER_TYPES.map(({ value: type }) => {
          const rows = list.filter((c) => (c.type || 'theory') === type);
          if (!rows.length) return null;
          const parts = [...new Set(rows.flatMap((c) => schemeOf(c).map((p) => p.key)))];
          return (
            <table key={type} className="mb-3 w-full min-w-[820px] border-collapse text-[13.5px]">
              <thead>
                <tr><th colSpan={2} className={th}>{type === 'theory' ? 'Theory' : 'Sessional'}</th><th colSpan={3} className={th}>Period</th><th colSpan={parts.length + 1} className={th}>Evaluation scheme</th><th rowSpan={2} className={th}>Credit</th><th rowSpan={2} className={th}>Hours</th></tr>
                <tr><th className={th}>Code</th><th className={`${th} text-left`}>Name of the paper</th><th className={th}>Lectures</th><th className={th}>Tutorials</th><th className={th}>Practicals</th>
                  {parts.map((p) => <th key={p} className={th}>{p}</th>)}<th className={th}>Sub-total</th></tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = schemeOf(c);
                  return (
                    <tr key={c._id}>
                      <td className={`${td} whitespace-nowrap font-semibold`}>{c.code}</td>
                      <td className={td}>{c.name}<span className="block text-xs text-ink-faint">{c.faculty?.name || 'Faculty not assigned'}</span></td>
                      <td className={`${td} text-center`}>{c.lectures ?? 0}</td><td className={`${td} text-center`}>{c.tutorials ?? 0}</td><td className={`${td} text-center`}>{c.practicals ?? 0}</td>
                      {parts.map((p) => <td key={p} className={`${td} text-center`}>{s.find((x) => x.key === p)?.max ?? '-'}</td>)}
                      <td className={`${td} text-center font-semibold`}>{schemeTotal(s)}</td>
                      <td className={`${td} text-center`}>{c.credits ?? '-'}</td><td className={`${td} text-center`}>{c.hours ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })}
        <div className="flex justify-end gap-6 border-t-2 border-sand-300 pt-2 text-sm font-semibold">
          <span>Total marks {total.marks}</span><span>Credits {total.credits}</span><span>Hours {total.hours}</span>
        </div>
      </section>
    );
  });
}

const GROUP = [['level', 'levels', 'All levels'], ['program', 'programs', 'All programs'], ['batch', 'batches', 'All batches'], ['section', 'sections', 'All sections'], ['semester', 'semesters', 'All semesters']];
const groupOf = (s) => [s.level, s.program, s.batch, s.section, s.semester].filter(Boolean).join(' / ');

/** Pick students to add to a course: filters start at the course's own level/program/batch/section/semester. */
function StudentPicker({ course, onBack, onAdded }) {
  const masters = useMasters();
  const [f, setF] = useState(() => ({ q: '', ...Object.fromEntries(GROUP.map(([k]) => [k, course[k] || ''])) }));
  const { data, loading } = useFetch('/users', { role: 'student', active: 'true', pool: 'all' });
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const enrolled = new Set(course.students.map((s) => s._id));
  const rows = (data || []).filter((u) => !enrolled.has(u._id) && matches(f.q, u.name, u.rollNo, u.email, u.phone)
    && GROUP.every(([k]) => !f[k] || u[k] === f[k]));
  const allPicked = rows.length > 0 && rows.every((u) => picked.includes(u._id));
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const toggleAll = () => setPicked(allPicked ? picked.filter((id) => !rows.some((u) => u._id === id)) : [...new Set([...picked, ...rows.map((u) => u._id)])]);
  const add = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post(`/courses/${course._id}/students`, { students: picked });
      toast(`${r.added} student${r.added === 1 ? '' : 's'} added to ${course.code}`); onAdded();
    } catch (e) { errMsg(e); } finally { setBusy(false); }
  };
  return (
    <>
      <p className="mb-3 text-sm text-ink-soft">Filter students, tick the ones taking <b>{course.code} {course.name}</b>, then add them. Students already in this course are not listed.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox placeholder="Search by name, roll number, email or phone" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        {GROUP.map(([k, list, all]) => <FilterSelect key={k} label={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={all} options={masters[list]} />)}
      </div>
      {loading ? <Loading /> : !rows.length ? <Empty title="No students match these filters" hint="Change or clear a filter to see more students." /> : (
        <div className="max-h-96 overflow-y-auto rounded-md border border-primary-100">
          <label className="flex items-center gap-3 border-b border-primary-100 bg-primary-50 px-3 py-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={allPicked} onChange={toggleAll} />Select all {rows.length}
          </label>
          <ul className="divide-y divide-primary-50">
            {rows.map((u) => (
              <li key={u._id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-sand-50">
                  <input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={picked.includes(u._id)} onChange={() => toggle(u._id)} />
                  <span className="flex-1"><span className="font-medium">{u.name}</span> <span className="text-ink-faint">{u.rollNo}</span></span>
                  <span className="text-xs text-ink-faint">{groupOf(u) || '-'}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button onClick={add} loading={busy} disabled={!picked.length}><UserPlus size={15} />Add {picked.length || ''} student{picked.length === 1 ? '' : 's'}</Button>
      </div>
    </>
  );
}

function CourseDetail({ id, startAdding, onClose, canPlan }) {
  const { data, loading, setData, reload } = useFetch(id ? `/courses/${id}` : null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(!!startAdding);
  useEffect(() => { setAdding(!!startAdding); }, [id, startAdding]);
  const removeStudent = async (s) => {
    if (!window.confirm(`Remove ${s.name} from ${data.code}? Their attendance and marks stay saved.`)) return;
    try { await api.delete(`/courses/${id}/students/${s._id}`); setData({ ...data, students: data.students.filter((x) => x._id !== s._id) }); toast(`${s.name} removed`); } catch (e) { errMsg(e); }
  };
  const plan = data?.lessonPlan || [];
  const setPlan = (p) => setData({ ...data, lessonPlan: p });
  const savePlan = async () => {
    setBusy(true);
    try { await api.put(`/courses/${id}/lesson-plan`, { lessonPlan: plan }); toast('Lesson plan saved'); } catch (e) { errMsg(e); } finally { setBusy(false); }
  };
  const done = plan.filter((l) => l.done).length;
  return (
    <Modal open={!!id} onClose={onClose} wide title={data ? `${adding ? 'Add students to ' : ''}${data.code} ${data.name}` : 'Course'}
      footer={canPlan && !adding && <Button onClick={savePlan} loading={busy}>Save lesson plan</Button>}>
      {loading || !data ? <Loading /> : adding ? (
        <StudentPicker course={data} onBack={() => setAdding(false)} onAdded={() => { setAdding(false); reload(); }} />
      ) : (
        <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">Lesson plan</h3>
              <span className="text-sm text-ink-soft">{plan.length ? `${done} of ${plan.length} topics covered` : ''}</span>
            </div>
            {!plan.length && <Empty title="No topics planned" hint={canPlan ? 'Add units and topics to track syllabus coverage.' : ''} />}
            <ul className="space-y-2">
              {plan.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-primary-100 p-2">
                  <input type="checkbox" aria-label="Covered" disabled={!canPlan} checked={!!l.done} className="h-4 w-4 accent-[#062a52]"
                    onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
                  {canPlan ? (
                    <>
                      <Input className="!w-24 !py-1" value={l.unit || ''} placeholder="Unit" onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                      <Input className="!w-auto flex-1 !py-1" value={l.topic || ''} placeholder="Topic" onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)))} />
                      <Input type="date" className="!w-36 !py-1" value={l.planned ? isoDate(l.planned) : ''} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, planned: e.target.value } : x)))} />
                      <button onClick={() => setPlan(plan.filter((_, j) => j !== i))} className="p-1 text-ink-faint hover:text-red-700" aria-label="Remove topic"><Trash2 size={15} /></button>
                    </>
                  ) : <span className={l.done ? 'text-ink-soft line-through' : ''}>{l.unit} - {l.topic} <span className="text-xs text-ink-faint">{fmtDate(l.planned)}</span></span>}
                </li>
              ))}
            </ul>
            {canPlan && <Button size="sm" variant="secondary" className="mt-3" onClick={() => setPlan([...plan, { unit: '', topic: '', done: false }])}><Plus size={14} />Add topic</Button>}
          </div>
          <div>
            <h3 className="mb-2 text-base font-semibold">Faculty</h3>
            <p className="mb-5 text-ink-soft">{data.faculty?.name || 'Not assigned'}</p>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">Students ({data.students.length})</h3>
              {canPlan && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><UserPlus size={14} />Add students</Button>}
            </div>
            {!data.students.length ? <Empty title="No students yet" hint={canPlan ? 'Use Add students to pick students for this course.' : ''} /> : (
              <ul className="max-h-72 divide-y divide-primary-50 overflow-y-auto rounded-md border border-primary-100">
                {data.students.map((s) => (
                  <li key={s._id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="flex-1">{s.name}<span className="block text-xs text-ink-faint">{groupOf(s)}</span></span>
                    <span className="text-ink-faint">{s.rollNo}</span>
                    {canPlan && <button onClick={() => removeStudent(s)} className="p-1 text-ink-faint hover:text-red-700" aria-label={`Remove ${s.name}`}><X size={14} /></button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Courses() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const [show, setShow] = useState(''); // '' = current courses, 'deleted'
  const [f, setF] = useState({ q: '', level: '', program: '', batch: '', semester: '' });
  const current = useFetch('/courses');
  const deleted = useFetch(show === 'deleted' ? '/courses/deleted' : null);
  const { data, loading, reload } = show === 'deleted' ? deleted : current;
  const faculty = useFetch(admin ? '/users' : null, { role: 'faculty', active: 'true' });
  const masters = useMasters();
  const trash = useTrash('/courses', () => { deleted.reload(); current.reload(); });
  const setFilter = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const rows = (data || []).filter((c) => matches(f.q, c.code, c.name, c.faculty?.name)
    && ['level', 'program', 'batch', 'semester'].every((k) => !f[k] || c[k] === f[k]));
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [mode, setMode] = useState('list'); // list | syllabus
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  // Switching paper type swaps in that type's default scheme unless the scheme was customised.
  const setType = (e) => {
    const type = e.target.value;
    const untouched = JSON.stringify(edit.evaluation) === JSON.stringify(DEFAULT_SCHEME[edit.type || 'theory']);
    setEdit({ ...edit, type, ...(untouched && { evaluation: DEFAULT_SCHEME[type] }), ...(type === 'sessional' && edit.practicals === 0 && { lectures: 0, practicals: 2 }) });
  };

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (edit._id) await api.put(`/courses/${edit._id}`, { ...edit, reenrol: edit.reenrol });
      else await api.post('/courses', edit);
      toast(edit._id ? 'Course updated' : 'Course created'); setEdit(null); reload();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.code}? You can restore it later from Show: Deleted.`)) return;
    await deleteWithRestore('/courses', c, `${c.code} deleted`, () => { current.reload(); deleted.reload(); });
  };

  return (
    <>
      <PageHeader title={admin ? 'Courses' : 'My courses'} subtitle={admin ? 'Create courses, assign faculty and enrol a batch.' : 'Syllabus coverage and class lists.'}
        actions={admin && <Button onClick={() => setEdit({ ...BLANK })}><Plus size={16} />Add course</Button>} />
      <Tabs tabs={[{ value: 'list', label: 'List' }, { value: 'syllabus', label: 'Syllabus view' }]} value={mode} onChange={setMode} />
      <Card pad={false}>
        <FilterBar>
          <SearchBox placeholder="Search by course code, name or faculty" value={f.q} onChange={setFilter('q')} />
          <FilterSelect label="Level" value={f.level} onChange={setFilter('level')} placeholder="All levels" options={masters.levels} />
          <FilterSelect label="Program" value={f.program} onChange={setFilter('program')} placeholder="All programs" options={masters.programs} />
          <FilterSelect label="Batch" value={f.batch} onChange={setFilter('batch')} placeholder="All batches" options={masters.batches} />
          <FilterSelect label="Semester" value={f.semester} onChange={setFilter('semester')} placeholder="All semesters" options={masters.semesters} />
          {admin && <FilterSelect label="Show" value={show} onChange={(e) => setShow(e.target.value)} placeholder="Current" options={[{ value: 'deleted', label: 'Deleted' }]} />}
        </FilterBar>
        {loading ? <Loading /> : mode === 'syllabus' ? <div className="p-4"><SyllabusView courses={rows} /></div> : (
          <Table rows={rows} empty={show === 'deleted' ? 'No deleted courses' : data?.length ? 'No courses match these filters' : admin ? 'No courses yet. Add the first one.' : 'No courses assigned yet'} columns={[
            { label: 'Course', render: (c) => <><p className="font-medium">{c.code} {c.deletedAt && <DeletedBadge item={c} />}</p><p className="text-sm text-ink-soft">{c.name}</p></> },
            { label: 'Batch / Section', render: (c) => [c.level, c.program, c.batch, c.section, c.semester].filter(Boolean).join(' / ') || '-' },
            { label: 'Paper / Scheme', render: (c) => <><p>{c.type === 'sessional' ? 'Sessional' : 'Theory'} · L-T-P {c.lectures ?? 0}-{c.tutorials ?? 0}-{c.practicals ?? 0} · {c.credits ?? 0} cr</p><p className="text-xs text-ink-faint">{schemeText(c)}</p></> },
            { label: 'Faculty', render: (c) => c.faculty?.name || '-' },
            { label: 'Students', render: (c) => c.studentCount ?? c.students?.length ?? 0 },
            { label: 'Syllabus', render: (c) => (c.deletedAt ? '-' : (
              <div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-primary-50"><div className="h-full rounded-full bg-sand-400" style={{ width: `${c.progress}%` }} /></div><span className="text-xs text-ink-faint">{c.progress}%</span></div>)) },
            { label: '', className: 'text-right', render: (c) => (c.deletedAt ? trash.actions(c, c.code) : (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setView({ id: c._id })}>{user.role === 'faculty' ? 'Lesson plan' : 'View'}</Button>
                {user.role !== 'student' && <Button size="sm" variant="secondary" onClick={() => setView({ id: c._id, add: true })}><UserPlus size={14} />Students</Button>}
                {admin && <Button size="sm" variant="ghost" onClick={() => setEdit({ ...BLANK, ...c, evaluation: schemeOf(c), faculty: c.faculty?._id || '' })}>Edit</Button>}
                {admin && <Button size="sm" variant="danger" onClick={() => remove(c)}>Delete</Button>}
              </div>)) },
          ]} />
        )}
      </Card>

      <CourseDetail id={view?.id} startAdding={view?.add} onClose={() => { setView(null); reload(); }} canPlan={user.role === 'faculty' || admin} />

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit course' : 'Add course'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button form="course-form" type="submit" loading={busy}>{edit?._id ? 'Save changes' : 'Create course'}</Button></>}>
        {edit && (
          <form id="course-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Course code" hint="e.g. BBA 101"><Input required value={edit.code} onChange={set('code')} /></Field>
            <Field label="Paper type"><Select value={edit.type || 'theory'} onChange={setType} options={PAPER_TYPES} /></Field>
            <Field label="Name of the paper" className="sm:col-span-2"><Input required value={edit.name} onChange={set('name')} /></Field>
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              <Field label="Lectures / week"><Input type="number" min={0} value={edit.lectures} onChange={set('lectures')} /></Field>
              <Field label="Tutorials / week"><Input type="number" min={0} value={edit.tutorials} onChange={set('tutorials')} /></Field>
              <Field label="Practicals / week"><Input type="number" min={0} value={edit.practicals} onChange={set('practicals')} /></Field>
            </div>
            <Field label="Credits"><Input type="number" min={0} value={edit.credits} onChange={set('credits')} /></Field>
            <Field label="Hours / week"><Input type="number" min={0} value={edit.hours} onChange={set('hours')} /></Field>
            <Field label="Evaluation scheme" hint="Faculty enter marks for each part; the sub-total is the paper's total marks" className="sm:col-span-2">
              <SchemeEditor value={edit.evaluation || DEFAULT_SCHEME[edit.type || 'theory']} onChange={(evaluation) => setEdit({ ...edit, evaluation })} />
            </Field>
            <Field label="Pass marks (sub-total)" hint={`Blank = 40% of ${schemeTotal(edit.evaluation || DEFAULT_SCHEME[edit.type || 'theory'])}. Faculty can also change this on the Marks page.`}>
              <Input type="number" min={0} value={edit.passMarks ?? ''} placeholder={String(Math.ceil(schemeTotal(edit.evaluation || DEFAULT_SCHEME[edit.type || 'theory']) * 0.4))} onChange={set('passMarks')} />
            </Field>
            <Field label="Department"><MasterSelect list={masters.departments} value={edit.department} onChange={set('department')} /></Field>
            <Field label="Level"><MasterSelect list={masters.levels} value={edit.level} onChange={set('level')} /></Field>
            <Field label="Program"><MasterSelect list={masters.programs} value={edit.program} onChange={set('program')} /></Field>
            <Field label="Batch" hint="Students matching level, program, batch, section and semester are enrolled"><MasterSelect list={masters.batches} value={edit.batch} onChange={set('batch')} /></Field>
            <Field label="Section" hint="Leave blank for all sections"><MasterSelect list={masters.sections} value={edit.section} onChange={set('section')} placeholder="All sections" /></Field>
            <Field label="Semester"><MasterSelect list={masters.semesters} value={edit.semester} onChange={set('semester')} /></Field>
            <Field label="Faculty" className="sm:col-span-2">
              <Select value={edit.faculty} onChange={set('faculty')} placeholder="Not assigned" options={(faculty.data || []).map((f) => ({ value: f._id, label: `${f.name} (${f.department || f.email})` }))} />
            </Field>
            {edit._id && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={!!edit.reenrol} onChange={(e) => setEdit({ ...edit, reenrol: e.target.checked })} />
                Re-enrol students from this batch and section
              </label>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}
