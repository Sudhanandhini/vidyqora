import { useEffect, useMemo, useState } from 'react';
import { Plus, X, SlidersHorizontal } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { schemeOf, schemeTotal, schemeText, passOf } from '../components/syllabus';
import { DeletedItems, DeletedBadge, deleteWithRestore, SearchBox, matches } from '../components/listTools';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Select, Loading, Empty, Badge, StatusBadge, fmtDate, isoDate, toast, errMsg } from '../components/ui';

const LOCKED = ['verified', 'published'];
const isAbsent = (v) => /^a(b)?$/i.test(String(v).trim());

/**
 * Mark columns for a course: one per evaluation-scheme part (MSE 40, ESE 60, ...) in syllabus order,
 * then any extra tests. A part's assessment is created the first time its marks are saved.
 */
function markColumns(course, assessments) {
  const list = assessments || [];
  const scheme = schemeOf(course);
  const parts = scheme.map((p) => ({ key: p.key, name: p.key, title: p.label, max: p.max, pass: p.pass, isPart: true, a: list.find((a) => a.component === p.key) }));
  const extras = list.filter((a) => !scheme.some((p) => p.key === a.component)).map((a) => ({ key: a._id, name: a.name, title: a.name, max: a.maxMarks, pass: a.passMarks, a }));
  return { parts, extras, cols: [...parts, ...extras], schemeMax: schemeTotal(scheme) };
}

/** Strip above a test's section: max, pass mark, status and class figures. */
function TestSummary({ test, students, valOf, result, onDelete }) {
  const entered = students.filter((s) => valOf(test, s).trim() !== '').length;
  const nums = students.map((s) => valOf(test, s).trim()).filter((v) => v !== '' && !isAbsent(v) && !Number.isNaN(Number(v)) && Number(v) <= test.max).map(Number);
  const results = students.map((s) => result(test, s)).filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-primary-50 bg-sand-50 px-4 py-2.5 text-sm">
      <b className="text-primary">{test.name}</b>
      <span>Max <b>{test.max}</b></span>
      <span>Pass mark <b>{test.pass ?? 'none'}</b></span>
      {test.a?.date && <span>{fmtDate(test.a.date)}</span>}
      <StatusBadge status={test.a?.status || 'draft'} />
      <span className="text-ink-soft">Entered {entered} / {students.length}</span>
      {nums.length > 0 && <span className="text-ink-soft">Average {(nums.reduce((t, x) => t + x, 0) / nums.length).toFixed(1)}</span>}
      {test.pass != null && results.length > 0 && <span className="text-ink-soft">Passed {results.filter((r) => r.pass).length} / {results.length}</span>}
      {test.a?.status === 'draft' && <Button size="sm" variant="danger" className="ml-auto" onClick={onDelete}>Delete test</Button>}
    </div>
  );
}

/** One page mark sheet: students down the side, MSE / ESE / extra tests across, type marks straight into the boxes. */
function MarkSheet({ course, assessments, reload }) {
  const { user } = useAuth();
  const { parts, extras, cols, schemeMax } = useMemo(() => markColumns(course, assessments), [course, assessments]);
  const locked = (c) => !!c.a && LOCKED.includes(c.a.status) && user.role !== 'admin';
  // vals[colKey][studentId] = text in the box: '' | number | 'AB'
  const initial = useMemo(() => Object.fromEntries(cols.map((c) => [c.key, Object.fromEntries(course.students.map((s) => {
    const m = c.a?.marks.find((x) => String(x.student) === String(s._id));
    return [s._id, m?.absent ? 'AB' : typeof m?.marks === 'number' ? String(m.marks) : ''];
  }))])), [cols, course]);
  const [vals, setVals] = useState(initial);
  useEffect(() => setVals(initial), [initial]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [newTest, setNewTest] = useState(null);
  const passTotal = passOf(course);
  // Which section is shown: 'main' (MSE + ESE...), one test's id, or 'all'.
  const [view, setView] = useState('main');
  const test = extras.find((c) => c.key === view);
  const current = view === 'all' ? 'all' : test ? view : 'main';
  const visible = current === 'main' ? parts : current === 'all' ? cols : [test];
  // Inline "Max / pass marks" editor: { parts: {MSE: {max, pass}}, passMarks, extras: {id: max} }
  const [marking, setMarking] = useState(null);
  const openMarking = () => setMarking({
    parts: Object.fromEntries(parts.map((c) => [c.key, { max: c.max, pass: c.pass ?? '' }])),
    passMarks: passTotal,
    extras: Object.fromEntries(extras.map((c) => [c.key, { max: c.max, pass: c.pass ?? '' }])),
  });
  // Pass mark is wrong when it is negative or above the maximum.
  const passWrong = (pass, max) => pass !== '' && pass != null && (Number(pass) < 0 || Number(pass) > Number(max));
  const markingTotal = marking ? Object.values(marking.parts).reduce((t, p) => t + Number(p.max || 0), 0) : 0;
  const markingInvalid = !!marking && (Object.values(marking.parts).some((p) => !(Number(p.max) > 0) || passWrong(p.pass, p.max))
    || passWrong(marking.passMarks, markingTotal) || Object.values(marking.extras).some((m) => !(Number(m.max) > 0) || passWrong(m.pass, m.max)));
  const saveMarking = async () => {
    setBusy('marking');
    try {
      await api.put(`/courses/${course._id}/marking`, {
        evaluation: Object.entries(marking.parts).map(([key, p]) => ({ key, max: p.max, pass: p.pass })),
        passMarks: marking.passMarks,
      });
      for (const c of extras) {
        const m = marking.extras[c.key];
        if (Number(m.max) !== c.max || String(m.pass) !== String(c.pass ?? '')) await api.put(`/assessments/${c.a._id}`, { maxMarks: m.max, passMarks: m.pass });
      }
      toast('Maximum and pass marks saved'); setMarking(null); reload();
    } catch (e) { errMsg(e); } finally { setBusy(''); }
  };

  const valOf = (c, s) => vals[c.key]?.[s._id] ?? '';
  const belowPass = (c, v) => c.pass != null && v.trim() !== '' && (isAbsent(v) || Number(v) < c.pass);
  // Pass needs every part entered, each part at or above its pass mark, and the sub-total at or above the pass mark.
  const result = (s) => {
    const vs = parts.map((c) => valOf(c, s).trim());
    if (vs.some((v) => v === '')) return null;
    const failed = parts.filter((c, i) => isAbsent(vs[i]) || belowPass(c, vs[i])).map((c) => c.key);
    if (subTotal(s) < passTotal) failed.push(`sub-total below ${passTotal}`);
    return failed.length ? { pass: false, why: failed.join(', ') } : { pass: true };
  };
  // One test on its own: pass when the mark reaches the test's pass mark.
  const testResult = (c, s) => {
    const v = valOf(c, s).trim();
    if (v === '' || bad(c, v)) return null;
    if (isAbsent(v)) return { pass: false, why: 'Absent' };
    if (c.pass == null) return null;
    return Number(v) >= c.pass ? { pass: true } : { pass: false, why: `Below ${c.pass}` };
  };
  // Why a typed mark is not accepted, or '' if it is fine.
  const problem = (c, v) => {
    const t = v.trim();
    if (t === '' || isAbsent(t)) return '';
    if (Number.isNaN(Number(t))) return 'Numbers or AB only';
    if (Number(t) < 0) return 'Cannot be negative';
    if (Number(t) > c.max) return `Max ${c.max}`;
    return '';
  };
  const bad = (c, v) => !!problem(c, v);
  const errors = visible.filter((c) => !locked(c)).reduce((n, c) => n + course.students.filter((s) => bad(c, valOf(c, s))).length, 0);
  const rowBad = (s) => parts.some((c) => bad(c, valOf(c, s)));
  const dirty = visible.reduce((n, c) => n + course.students.filter((s) => valOf(c, s) !== (initial[c.key]?.[s._id] ?? '')).length, 0);
  const subTotal = (s) => {
    const got = parts.map((c) => valOf(c, s).trim()).filter((v) => v !== '');
    return got.length ? got.reduce((t, v) => t + (isAbsent(v) ? 0 : Number(v) || 0), 0) : null;
  };
  const setCell = (c, s) => (e) => setVals({ ...vals, [c.key]: { ...vals[c.key], [s._id]: e.target.value.toUpperCase() } });
  // Enter moves to the same box on the next student.
  const nextRow = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const boxes = [...document.querySelectorAll(`[data-col="${e.target.dataset.col}"]`)];
    boxes[boxes.indexOf(e.target) + 1]?.focus();
  };

  const save = async (status) => {
    const wrong = visible.find((c) => !locked(c) && course.students.some((s) => bad(c, valOf(c, s))));
    if (wrong) {
      const who = course.students.find((s) => bad(wrong, valOf(wrong, s)));
      errMsg({ message: `${who.name}, ${wrong.name}: ${valOf(wrong, who)} is not allowed (${problem(wrong, valOf(wrong, who))}). Fix the red boxes before saving.` });
      return;
    }
    setBusy(status || 'save');
    try {
      const todo = visible.filter((c) => !locked(c) && (c.a || course.students.some((s) => valOf(c, s).trim() !== '')));
      if (!todo.length) { toast('Nothing to save yet'); return; }
      for (const c of todo) {
        const id = c.a?._id || (await api.post('/assessments', { course: course._id, component: c.key })).data._id;
        await api.put(`/assessments/${id}/marks`, {
          status,
          marks: course.students.map((s) => { const v = valOf(c, s).trim(); return { student: s._id, absent: isAbsent(v), marks: v === '' || isAbsent(v) ? '' : Number(v) }; }),
        });
      }
      toast(status === 'published' ? 'Results published to students' : status === 'submitted' ? 'Marks submitted for verification' : 'Marks saved');
      reload();
    } catch (e) { errMsg(e); } finally { setBusy(''); }
  };
  const addTest = async (e) => {
    e.preventDefault();
    if (passWrong(newTest.passMarks, newTest.maxMarks)) { errMsg({ message: `Pass mark must be between 0 and ${newTest.maxMarks}` }); return; }
    try {
      const { data: a } = await api.post('/assessments', { course: course._id, ...newTest });
      toast(`${newTest.name} created. Enter its marks below.`); setNewTest(null); setView(a._id); reload();
    } catch (err) { errMsg(err); }
  };
  const removeTest = async (c) => {
    if (!window.confirm(`Delete ${c.name} and its marks?`)) return;
    if (await deleteWithRestore('/assessments', c.a, `${c.name} deleted`, reload)) setView('main');
  };

  const head = (c) => (
    <span className="inline-flex flex-col items-center">
      <span className="flex items-center gap-1" title={c.title}>{c.name}
        {!c.isPart && c.a?.status === 'draft' && <button onClick={() => removeTest(c)} className="text-ink-faint hover:text-red-700" aria-label={`Delete ${c.name}`}><X size={12} /></button>}
      </span>
      <span className="text-[11px] font-normal text-ink-faint">/ {c.max}{c.pass != null ? ` · pass ${c.pass}` : ''}</span>
      {c.a && c.a.status !== 'draft' && <span className="mt-0.5 scale-90"><StatusBadge status={c.a.status} /></span>}
    </span>
  );
  const box = (c) => ({
    key: c.key, className: 'text-center', label: head(c),
    render: (s) => {
      const v = valOf(c, s);
      const absent = isAbsent(v);
      const err = problem(c, v);
      return (
        <span className="inline-flex flex-col items-center">
        <span className="inline-flex items-center gap-1">
          <input value={v} onChange={setCell(c, s)} onKeyDown={nextRow} data-col={c.key} disabled={locked(c) || absent} inputMode="decimal" placeholder="-"
            aria-label={`${c.name} marks for ${s.name}`} title={err || `0 to ${c.max}, or AB for absent`} aria-invalid={!!err}
            className={`h-9 w-16 rounded-md border text-center text-[14px] outline-none focus:ring-2 disabled:text-ink-soft
              ${err ? 'border-2 border-red-600 bg-red-50 font-semibold text-red-700 focus:border-red-600 focus:ring-red-200'
                : absent ? 'border-red-200 bg-red-50 font-semibold !text-red-700'
                  : belowPass(c, v) ? 'border-red-200 bg-white font-semibold text-red-700 focus:border-primary focus:ring-primary-100'
                    : 'border-primary-200 bg-white focus:border-primary focus:ring-primary-100 disabled:bg-canvas'}`} />
          {!locked(c) && (
            <button type="button" onClick={() => setVals({ ...vals, [c.key]: { ...vals[c.key], [s._id]: absent ? '' : 'AB' } })}
              aria-pressed={absent} aria-label={absent ? `Clear absent for ${s.name} in ${c.name}` : `Mark ${s.name} absent in ${c.name}`}
              title={absent ? 'Clear absent' : 'Mark absent'}
              className={`h-7 rounded px-1.5 text-[11px] font-semibold ring-1 ${absent ? 'bg-red-600 text-white ring-red-600' : 'bg-white text-ink-faint ring-primary-100 hover:text-red-700 hover:ring-red-200'}`}>Ab</button>
          )}
        </span>
        {err && <span role="alert" className="mt-0.5 text-[11px] font-semibold text-red-700">{err}</span>}
        </span>
      );
    },
  });
  const rows = course.students.filter((s) => matches(q, s.name, s.rollNo, s.email));

  return (
    <Card pad={false} title={`${course.code} ${course.name}`}
      actions={<span className="text-sm text-ink-soft">{course.type === 'sessional' ? 'Sessional' : 'Theory'} · {schemeText(course)} · {course.credits ?? 0} credits</span>}>
      {!course.students.length ? <Empty title="No students in this course" hint="Open My courses and use Students to add students to this course." /> : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-primary-50 p-4">
            <SearchBox placeholder="Search by name, roll number or email" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="text-sm text-ink-faint">Type marks in the boxes. Click <b>Ab</b> (or type AB) to mark absent. Enter moves down.</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => (marking ? setMarking(null) : openMarking())}><SlidersHorizontal size={14} />Max &amp; pass marks</Button>
              <Button size="sm" variant="secondary" onClick={() => setNewTest({ name: '', maxMarks: 10, passMarks: 4, date: isoDate() })}><Plus size={14} />Add test</Button>
            </div>
          </div>
          {marking && (
            <div className="border-b border-primary-100 bg-sand-50 px-4 py-3">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                {parts.map((c) => (
                  <fieldset key={c.key} className="flex items-end gap-2">
                    <legend className="mb-1 text-xs font-semibold text-ink-soft">{c.key} - {c.title}</legend>
                    <Field label="Max"><Input type="number" min={1} className="!w-20 !py-1" value={marking.parts[c.key].max}
                      onChange={(e) => setMarking({ ...marking, parts: { ...marking.parts, [c.key]: { ...marking.parts[c.key], max: e.target.value } } })} /></Field>
                    <Field label="Pass" hint={passWrong(marking.parts[c.key].pass, marking.parts[c.key].max) && <span className="font-semibold text-red-700">Max {marking.parts[c.key].max}</span>}><Input type="number" min={0}
                      className={`!w-20 !py-1 ${passWrong(marking.parts[c.key].pass, marking.parts[c.key].max) ? '!border-2 !border-red-600 !bg-red-50' : ''}`} placeholder="none" value={marking.parts[c.key].pass}
                      onChange={(e) => setMarking({ ...marking, parts: { ...marking.parts, [c.key]: { ...marking.parts[c.key], pass: e.target.value } } })} /></Field>
                  </fieldset>
                ))}
                <fieldset className="flex items-end gap-2">
                  <legend className="mb-1 text-xs font-semibold text-ink-soft">Sub-total (out of {Object.values(marking.parts).reduce((t, p) => t + Number(p.max || 0), 0)})</legend>
                  <Field label="Pass" hint={passWrong(marking.passMarks, markingTotal) && <span className="font-semibold text-red-700">Max {markingTotal}</span>}><Input type="number" min={0}
                    className={`!w-20 !py-1 ${passWrong(marking.passMarks, markingTotal) ? '!border-2 !border-red-600 !bg-red-50' : ''}`} value={marking.passMarks} onChange={(e) => setMarking({ ...marking, passMarks: e.target.value })} /></Field>
                </fieldset>
                {extras.map((c) => {
                  const m = marking.extras[c.key];
                  const setX = (patch) => setMarking({ ...marking, extras: { ...marking.extras, [c.key]: { ...m, ...patch } } });
                  return (
                    <fieldset key={c.key} className="flex items-end gap-2">
                      <legend className="mb-1 text-xs font-semibold text-ink-soft">{c.name} (test)</legend>
                      <Field label="Max"><Input type="number" min={1} className="!w-20 !py-1" value={m.max} onChange={(e) => setX({ max: e.target.value })} /></Field>
                      <Field label="Pass" hint={passWrong(m.pass, m.max) && <span className="font-semibold text-red-700">Max {m.max}</span>}><Input type="number" min={0} placeholder="none"
                        className={`!w-20 !py-1 ${passWrong(m.pass, m.max) ? '!border-2 !border-red-600 !bg-red-50' : ''}`} value={m.pass} onChange={(e) => setX({ pass: e.target.value })} /></Field>
                    </fieldset>
                  );
                })}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setMarking(null)}>Cancel</Button>
                  <Button size="sm" onClick={saveMarking} loading={busy === 'marking'} disabled={markingInvalid}>Save</Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-faint">Leave a part's pass blank if it has no separate minimum. A maximum cannot go below a mark already entered.</p>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-1 border-b border-primary-100 px-4 pt-3" role="tablist" aria-label="Mark sections">
            {[{ value: 'main', label: parts.map((c) => c.key).join(' + ') }, ...extras.map((c) => ({ value: c.key, label: c.name })), { value: 'all', label: 'All tests' }].map((t) => (
              <button key={t.value} role="tab" aria-selected={current === t.value} onClick={() => setView(t.value)}
                className={`-mb-px rounded-t-md border px-3 py-2 text-[13.5px] font-medium ${current === t.value ? 'border-primary-100 border-b-white bg-white text-primary' : 'border-transparent text-ink-soft hover:text-primary'}`}>{t.label}</button>
            ))}
          </div>
          {current === test?.key && <TestSummary test={test} students={course.students} valOf={valOf} result={testResult} onDelete={() => removeTest(test)} />}
          <Table rows={rows} empty="No students match this search" columns={[
            { label: 'Roll number', key: 'rollNo' },
            { label: 'Student', render: (s) => <><p className="font-medium">{s.name}</p><p className="text-xs text-ink-faint">{[s.program, s.batch, s.section, s.semester].filter(Boolean).join(' / ')}</p></> },
            ...(current === 'main' || current === 'all' ? [
            ...parts.map(box),
            { key: 'subtotal', className: 'text-center', label: <span className="inline-flex flex-col items-center">Sub-total<span className="text-[11px] font-normal text-ink-faint">/ {schemeMax}</span></span>,
              render: (s) => { if (rowBad(s)) return <span className="text-red-700" title="A mark in this row is not allowed">!</span>; const t = subTotal(s); return t == null ? <span className="text-ink-faint">-</span> : <b className={t < passTotal ? 'text-red-700' : 'text-primary'}>{t}</b>; } },
            { key: 'result', className: 'text-center', label: <span className="inline-flex flex-col items-center">Result<span className="text-[11px] font-normal text-ink-faint">pass {passTotal}</span></span>,
              render: (s) => { if (rowBad(s)) return <Badge tone="red">Check marks</Badge>; const r = result(s); return !r ? <span className="text-ink-faint">-</span> : <span title={r.why}><Badge tone={r.pass ? 'green' : 'red'}>{r.pass ? 'Pass' : 'Fail'}</Badge></span>; } },
            ] : []),
            ...(current === 'all' ? extras.map(box) : []),
            ...(test && current === test.key ? [box(test), {
              key: 'test-result', className: 'text-center',
              label: <span className="inline-flex flex-col items-center">Result<span className="text-[11px] font-normal text-ink-faint">{test.pass != null ? `pass ${test.pass}` : 'no pass mark'}</span></span>,
              render: (s) => { const r = testResult(test, s); return !r ? <span className="text-ink-faint">-</span> : <span title={r.why}><Badge tone={r.pass ? 'green' : 'red'}>{r.pass ? 'Pass' : 'Fail'}</Badge></span>; },
            }] : []),
          ]} />
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-primary-100 bg-canvas px-4 py-3">
            <span className="mr-auto text-sm text-ink-soft">
              {errors > 0 && <b className="mr-2 text-red-700">{errors} mark{errors === 1 ? '' : 's'} need fixing (shown in red).</b>}
              {dirty ? `${dirty} unsaved change${dirty === 1 ? '' : 's'}` : 'All marks saved'}
            </span>
            <Button variant="secondary" onClick={() => save()} loading={busy === 'save'} disabled={errors > 0}>Save marks</Button>
            <Button variant="secondary" onClick={() => save('submitted')} loading={busy === 'submitted'} disabled={errors > 0}>Submit for verification</Button>
            <Button onClick={() => { if (window.confirm('Publish these results to students?')) save('published'); }} loading={busy === 'published'} disabled={errors > 0}>Publish results</Button>
          </div>
        </>
      )}
      <Modal open={!!newTest} onClose={() => setNewTest(null)} title="Add test"
        footer={<><Button variant="secondary" onClick={() => setNewTest(null)}>Cancel</Button><Button form="test-form" type="submit">Create test</Button></>}>
        {newTest && (
          <form id="test-form" onSubmit={addTest} className="grid gap-4 sm:grid-cols-2">
            <p className="text-sm text-ink-soft sm:col-span-2">Each test (quiz, viva, internal test) gets its own section to enter marks. Tests are not added to the {schemeMax}-mark sub-total.</p>
            <Field label="Test name" className="sm:col-span-2"><Input required placeholder="Quiz 1" value={newTest.name} onChange={(e) => setNewTest({ ...newTest, name: e.target.value })} /></Field>
            <Field label="Maximum marks"><Input type="number" min={1} required value={newTest.maxMarks} onChange={(e) => setNewTest({ ...newTest, maxMarks: e.target.value })} /></Field>
            <Field label="Pass mark" hint={passWrong(newTest.passMarks, newTest.maxMarks) ? <span className="font-semibold text-red-700">Must be 0 to {newTest.maxMarks}</span> : 'Below this is a fail. Blank = no pass mark.'}>
              <Input type="number" min={0} value={newTest.passMarks} placeholder="none"
                className={passWrong(newTest.passMarks, newTest.maxMarks) ? '!border-2 !border-red-600 !bg-red-50' : ''} onChange={(e) => setNewTest({ ...newTest, passMarks: e.target.value })} />
            </Field>
            <Field label="Date"><Input type="date" value={newTest.date} onChange={(e) => setNewTest({ ...newTest, date: e.target.value })} /></Field>
          </form>
        )}
      </Modal>
    </Card>
  );
}

function FacultyView() {
  const courses = useFetch('/courses');
  const [course, setCourse] = useState('');
  const id = course || courses.data?.[0]?._id;
  const detail = useFetch(id ? `/courses/${id}` : null);
  const { data, loading, reload } = useFetch(id ? '/assessments' : null, { course: id });

  if (courses.loading) return <Loading />;
  if (!courses.data?.length) return <Empty title="No courses assigned" />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Field label="Course" className="w-full max-w-sm"><Select value={id} onChange={(e) => setCourse(e.target.value)} options={courses.data.map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))} /></Field>
        <DeletedItems base="/assessments" params={{ course: id }} title="Deleted tests" onRestored={reload} name={(a) => a.name}
          label={(a) => <><p className="font-medium">{a.name} <DeletedBadge item={a} /></p><p className="text-xs text-ink-faint">{fmtDate(a.date)} · max {a.maxMarks}</p></>} />
      </div>
      {/* Keep the sheet mounted while refreshing so typed marks survive; only show a spinner when switching course. */}
      {!detail.data || detail.data._id !== id || !data || (loading && data.some((a) => String(a.course) !== id))
        ? <Card><Loading /></Card>
        : <MarkSheet key={id} course={detail.data} assessments={data} reload={() => { reload(); detail.reload(); }} />}
    </>
  );
}

/** A student's published marks: one row per subject laid out by its evaluation scheme, plus extra tests. */
function StudentView() {
  const { data, loading } = useFetch('/assessments/my');
  if (loading) return <Loading />;
  const rows = (data || []).filter((r) => r.course);
  if (!rows.length) return <Card><Empty title="No results published yet" hint="Marks appear here once your faculty publish them." /></Card>;

  const subjects = {};
  rows.forEach((r) => { (subjects[r.course._id] ||= { course: r.course, items: [] }).items.push(r); });
  const list = Object.values(subjects).sort((a, b) => a.course.code.localeCompare(b.course.code, undefined, { numeric: true }));
  const partKeys = [...new Set(list.flatMap((s) => schemeOf(s.course).map((p) => p.key)))];
  const show = (r) => (r.absent ? <span className="font-semibold text-red-700">AB</span> : r.marks ?? '-');

  const summary = list.map(({ course, items }) => {
    const scheme = schemeOf(course);
    const byPart = Object.fromEntries(scheme.map((p) => [p.key, items.find((r) => r.component === p.key)]));
    const done = scheme.every((p) => byPart[p.key]);
    const total = scheme.reduce((t, p) => t + (byPart[p.key] && !byPart[p.key].absent ? Number(byPart[p.key].marks) || 0 : 0), 0);
    const failed = scheme.filter((p) => byPart[p.key] && (byPart[p.key].absent || (p.pass != null && byPart[p.key].marks < p.pass))).map((p) => p.key);
    if (done && total < passOf(course)) failed.push(`total below ${passOf(course)}`);
    return { course, scheme, byPart, done, total, failed, extras: items.filter((r) => !scheme.some((p) => p.key === r.component)) };
  });
  const extras = summary.flatMap((s) => s.extras.map((r) => ({ ...r, course: s.course })));

  return (
    <>
      <Card pad={false} title="Subject-wise marks" className="mb-6">
        <Table rows={summary} rowKey={(s) => s.course._id} columns={[
          { label: 'Code', render: (s) => <span className="font-semibold">{s.course.code}</span> },
          { label: 'Name of the paper', render: (s) => <><p>{s.course.name}</p><p className="text-xs text-ink-faint">{[s.course.program, s.course.semester, s.course.type === 'sessional' ? 'Sessional' : 'Theory'].filter(Boolean).join(' · ')}</p></> },
          ...partKeys.map((k) => ({ key: k, className: 'text-center', label: k, render: (s) => {
            const p = s.scheme.find((x) => x.key === k);
            if (!p) return <span className="text-ink-faint">-</span>;
            const r = s.byPart[k];
            return r ? <span>{show(r)} <span className="text-xs text-ink-faint">/ {p.max}</span></span> : <span className="text-xs text-ink-faint">not published</span>;
          } })),
          { key: 'total', className: 'text-center', label: 'Sub-total', render: (s) => <span><b className="text-primary">{s.total}</b> <span className="text-xs text-ink-faint">/ {schemeTotal(s.scheme)}</span></span> },
          { key: 'result', className: 'text-center', label: 'Result', render: (s) => (s.failed.length
            ? <span title={s.failed.join(', ')}><Badge tone="red">Fail</Badge></span>
            : s.done ? <Badge tone="green">Pass</Badge> : <span className="text-xs text-ink-faint">Awaiting</span>) },
          { key: 'credits', className: 'text-center', label: 'Credit', render: (s) => s.course.credits ?? '-' },
        ]} />
      </Card>
      {extras.length > 0 && (
        <Card pad={false} title="Other tests">
          <Table rows={extras} columns={[
            { label: 'Course', render: (r) => <><p className="font-medium">{r.course.code}</p><p className="text-sm text-ink-soft">{r.course.name}</p></> },
            { label: 'Test', key: 'name' },
            { label: 'Date', render: (r) => fmtDate(r.date) },
            { label: 'Marks', render: (r) => <b className="text-primary">{show(r)} / {r.maxMarks}</b> },
            { label: 'Class average', render: (r) => r.classAvg ?? '-' },
            { label: 'Result', render: (r) => (r.absent ? <Badge tone="red">Fail</Badge> : r.passMarks == null || r.marks == null ? '-'
              : <span title={`Pass mark ${r.passMarks}`}><Badge tone={r.marks >= r.passMarks ? 'green' : 'red'}>{r.marks >= r.passMarks ? 'Pass' : 'Fail'}</Badge></span>) },
          ]} />
        </Card>
      )}
    </>
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
