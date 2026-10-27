import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { FilterBar, SearchBox, FilterSelect, DeletedBadge, useTrash, deleteWithRestore, matches } from '../components/listTools';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Select, MasterSelect, useMasters, Loading, Empty, isoDate, fmtDate, toast, errMsg } from '../components/ui';

const BLANK = { code: '', name: '', department: '', level: '', program: '', batch: '', section: '', semester: '', credits: 3, faculty: '' };

function CourseDetail({ id, onClose, canPlan }) {
  const { data, loading, setData } = useFetch(id ? `/courses/${id}` : null);
  const [busy, setBusy] = useState(false);
  const plan = data?.lessonPlan || [];
  const setPlan = (p) => setData({ ...data, lessonPlan: p });
  const savePlan = async () => {
    setBusy(true);
    try { await api.put(`/courses/${id}/lesson-plan`, { lessonPlan: plan }); toast('Lesson plan saved'); } catch (e) { errMsg(e); } finally { setBusy(false); }
  };
  const done = plan.filter((l) => l.done).length;
  return (
    <Modal open={!!id} onClose={onClose} wide title={data ? `${data.code} ${data.name}` : 'Course'}
      footer={canPlan && <Button onClick={savePlan} loading={busy}>Save lesson plan</Button>}>
      {loading || !data ? <Loading /> : (
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
            <h3 className="mb-2 text-base font-semibold">Students ({data.students.length})</h3>
            <ul className="max-h-72 divide-y divide-primary-50 overflow-y-auto rounded-md border border-primary-100">
              {data.students.map((s) => <li key={s._id} className="flex justify-between px-3 py-1.5 text-sm"><span>{s.name}</span><span className="text-ink-faint">{s.rollNo}</span></li>)}
            </ul>
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
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });

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
      <Card pad={false}>
        <FilterBar>
          <SearchBox placeholder="Search by course code, name or faculty" value={f.q} onChange={setFilter('q')} />
          <FilterSelect label="Level" value={f.level} onChange={setFilter('level')} placeholder="All levels" options={masters.levels} />
          <FilterSelect label="Program" value={f.program} onChange={setFilter('program')} placeholder="All programs" options={masters.programs} />
          <FilterSelect label="Batch" value={f.batch} onChange={setFilter('batch')} placeholder="All batches" options={masters.batches} />
          <FilterSelect label="Semester" value={f.semester} onChange={setFilter('semester')} placeholder="All semesters" options={masters.semesters} />
          {admin && <FilterSelect label="Show" value={show} onChange={(e) => setShow(e.target.value)} placeholder="Current" options={[{ value: 'deleted', label: 'Deleted' }]} />}
        </FilterBar>
        {loading ? <Loading /> : (
          <Table rows={rows} empty={show === 'deleted' ? 'No deleted courses' : data?.length ? 'No courses match these filters' : admin ? 'No courses yet. Add the first one.' : 'No courses assigned yet'} columns={[
            { label: 'Course', render: (c) => <><p className="font-medium">{c.code} {c.deletedAt && <DeletedBadge item={c} />}</p><p className="text-sm text-ink-soft">{c.name}</p></> },
            { label: 'Batch / Section', render: (c) => [c.level, c.program, c.batch, c.section, c.semester].filter(Boolean).join(' / ') || '-' },
            { label: 'Faculty', render: (c) => c.faculty?.name || '-' },
            { label: 'Students', render: (c) => c.studentCount ?? c.students?.length ?? 0 },
            { label: 'Syllabus', render: (c) => (c.deletedAt ? '-' : (
              <div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-primary-50"><div className="h-full rounded-full bg-sand-400" style={{ width: `${c.progress}%` }} /></div><span className="text-xs text-ink-faint">{c.progress}%</span></div>)) },
            { label: '', className: 'text-right', render: (c) => (c.deletedAt ? trash.actions(c, c.code) : (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setView(c._id)}>{user.role === 'faculty' ? 'Lesson plan' : 'View'}</Button>
                {admin && <Button size="sm" variant="ghost" onClick={() => setEdit({ ...BLANK, ...c, faculty: c.faculty?._id || '' })}>Edit</Button>}
                {admin && <Button size="sm" variant="danger" onClick={() => remove(c)}>Delete</Button>}
              </div>)) },
          ]} />
        )}
      </Card>

      <CourseDetail id={view} onClose={() => { setView(null); reload(); }} canPlan={user.role === 'faculty' || admin} />

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit course' : 'Add course'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button form="course-form" type="submit" loading={busy}>{edit?._id ? 'Save changes' : 'Create course'}</Button></>}>
        {edit && (
          <form id="course-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Course code"><Input required value={edit.code} onChange={set('code')} /></Field>
            <Field label="Credits"><Input type="number" min={0} value={edit.credits} onChange={set('credits')} /></Field>
            <Field label="Course name" className="sm:col-span-2"><Input required value={edit.name} onChange={set('name')} /></Field>
            <Field label="Department"><MasterSelect list={masters.departments} value={edit.department} onChange={set('department')} /></Field>
            <Field label="Level"><MasterSelect list={masters.levels} value={edit.level} onChange={set('level')} /></Field>
            <Field label="Program"><MasterSelect list={masters.programs} value={edit.program} onChange={set('program')} /></Field>
            <Field label="Batch" hint="Students of this batch are enrolled"><MasterSelect list={masters.batches} value={edit.batch} onChange={set('batch')} /></Field>
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
