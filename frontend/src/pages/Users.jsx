import { useState } from 'react';
import { Plus, RotateCcw, ArrowLeft } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Select, MasterSelect, useMasters, Badge, Tabs, Loading, toast, errMsg } from '../components/ui';
import { PhoneInput, NAME_PATTERN, FilterBar, SearchBox, FilterSelect, ACTIVE_OPTIONS, DeletedBadge, useTrash, deleteWithRestore, matches } from '../components/listTools';

const ROLES = [{ value: 'student', label: 'Students' }, { value: 'faculty', label: 'Faculty' }, { value: 'staff', label: 'Office staff' }, { value: 'admin', label: 'Admins' }];
const BLANK = { name: '', email: '', role: 'student', phone: '', department: '', designation: '', employeeId: '', rollNo: '', level: '', program: '', batch: '', section: '', semester: '', password: '' };

export default function Users() {
  const { user } = useAuth();
  const isFaculty = user.role === 'faculty'; // faculty can view and add students only
  const [role, setRole] = useState('student');
  const [q, setQ] = useState('');
  const [active, setActive] = useState('');
  // Students filter by level/program/batch/section/semester; other roles by department.
  const NO_FILTERS = { level: '', program: '', batch: '', section: '', semester: '', department: '' };
  const [filters, setFilters] = useState(NO_FILTERS);
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const showDeleted = active === 'deleted';
  const { data, loading, reload } = useFetch(showDeleted ? '/users/deleted' : '/users', showDeleted ? { role } : { role, q, active });
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: myCourses } = useFetch(isFaculty ? '/courses' : null);
  const masters = useMasters();
  // Count of deleted users in this tab, for the header "Restore deleted" button.
  const deletedCount = useFetch(isFaculty ? null : '/users/deleted', { role });
  const refresh = () => { reload(); deletedCount.reload(); };
  const trash = useTrash('/users', refresh);
  const students = role === 'student';
  const [course, setCourse] = useState(''); // faculty: one of my courses
  const rows = (data || []).filter((u) => Object.entries(filters).every(([k, v]) => !v || u[k] === v)
    && (!course || u.courses?.some((c) => c._id === course))
    && (!showDeleted || matches(q, u.name, u.email, u.phone, u.rollNo, u.employeeId)));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isFaculty && !edit._id && !edit.courses.length) throw new Error('Select at least one of your courses for this student');
      const body = { ...edit }; if (!body.password) delete body.password;
      let enrolled = 0;
      if (edit._id) await api.put(`/users/${edit._id}`, body); else ({ enrolled } = (await api.post('/users', body)).data);
      const enrolNote = isStudent && !edit._id ? ` Enrolled in ${enrolled} course${enrolled === 1 ? '' : 's'}.` : '';
      toast(edit._id ? 'User updated' : `${isFaculty ? 'Student' : 'User'} added.${enrolNote}${edit.password ? '' : ' Temporary password: Welcome@123'}`);
      setEdit(null); reload();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const toggle = async (u) => {
    try { await api.put(`/users/${u._id}`, { active: !u.active }); toast(u.active ? 'User deactivated' : 'User activated'); reload(); } catch (e) { errMsg(e); }
  };
  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.name}? They will not be able to sign in until restored.`)) return;
    await deleteWithRestore('/users', u, `${u.name} deleted`, refresh);
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  const isStudent = edit?.role === 'student';
  const toggleCourse = (id) => setEdit({ ...edit, courses: edit.courses.includes(id) ? edit.courses.filter((c) => c !== id) : [...edit.courses, id] });

  return (
    <>
      <PageHeader title={isFaculty ? 'My students' : 'Users'} subtitle={isFaculty ? 'Students enrolled in your courses. To add an existing student to a course, open My courses and use Students.' : 'Accounts for students, faculty and office staff.'}
        actions={<>
          {!isFaculty && (showDeleted
            ? <Button variant="secondary" onClick={() => setActive('')}><ArrowLeft size={16} />Back to all users</Button>
            : <Button variant="secondary" onClick={() => setActive('deleted')}><RotateCcw size={15} />Restore deleted{deletedCount.data?.length ? ` (${deletedCount.data.length})` : ''}</Button>)}
          <Button onClick={() => setEdit({ ...BLANK, role, courses: [] })}><Plus size={16} />{isFaculty ? 'Add student' : 'Add user'}</Button>
        </>} />
      {showDeleted && <p className="mb-4 rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-800">Showing deleted users. Use <b>Restore</b> to bring one back, or <b>Delete permanently</b> to remove them for good.</p>}
      {!isFaculty && <Tabs tabs={ROLES} value={role} onChange={(r) => { setRole(r); setFilters(NO_FILTERS); }} />}
      <Card pad={false}>
        <FilterBar>
          <SearchBox placeholder={`Search by name, email, phone or ${students ? 'roll number' : 'employee ID'}`} value={q} onChange={(e) => setQ(e.target.value)} />
          {isFaculty && <FilterSelect label="Course" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="All my courses" options={(myCourses || []).map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))} />}
          <FilterSelect label="Status" value={active} onChange={(e) => setActive(e.target.value)} placeholder="All statuses" options={isFaculty ? ACTIVE_OPTIONS.slice(0, 2) : ACTIVE_OPTIONS} />
          {students ? <>
            <FilterSelect label="Level" value={filters.level} onChange={setFilter('level')} placeholder="All levels" options={masters.levels} />
            <FilterSelect label="Program" value={filters.program} onChange={setFilter('program')} placeholder="All programs" options={masters.programs} />
            <FilterSelect label="Batch" value={filters.batch} onChange={setFilter('batch')} placeholder="All batches" options={masters.batches} />
            <FilterSelect label="Section" value={filters.section} onChange={setFilter('section')} placeholder="All sections" options={masters.sections} />
            <FilterSelect label="Semester" value={filters.semester} onChange={setFilter('semester')} placeholder="All semesters" options={masters.semesters} />
          </> : <FilterSelect label="Department" value={filters.department} onChange={setFilter('department')} placeholder="All departments" options={masters.departments} />}
          {Object.values(filters).some(Boolean) && <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>}
        </FilterBar>
        {loading ? <Loading /> : (
          <Table rows={rows} empty={isFaculty && !data?.length ? 'No students in your courses yet. Open My courses and use Students to add them.' : 'No users match these filters'} columns={[
            { label: 'Name', render: (u) => <><p className="font-medium">{u.name}</p><p className="text-xs text-ink-faint">{u.email}</p></> },
            { label: students ? 'Roll number' : 'Employee ID', render: (u) => u.rollNo || u.employeeId || '-' },
            { label: students ? 'Batch / Section' : 'Department', render: (u) => (students ? [u.level, u.program, u.batch, u.section, u.semester].filter(Boolean).join(' / ') : u.department) || '-' },
            isFaculty && { label: 'My courses', render: (u) => <div className="flex flex-wrap gap-1">{u.courses?.map((c) => <Badge key={c._id} tone="blue">{c.code}</Badge>)}</div> },
            { label: 'Phone', key: 'phone' },
            { label: 'Status', render: (u) => (u.deletedAt ? <DeletedBadge item={u} /> : <Badge tone={u.active ? 'green' : 'grey'}>{u.active ? 'Active' : 'Inactive'}</Badge>) },
            !isFaculty && { label: '', className: 'text-right', render: (u) => (u.deletedAt ? trash.actions(u, u.name) : (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...BLANK, ...u, password: '' })}>Edit</Button>
                <Button size="sm" variant="secondary" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</Button>
                {u._id !== user._id && <Button size="sm" variant="danger" onClick={() => remove(u)}>Delete</Button>}
              </div>)) },
          ].filter(Boolean)} />
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit user' : isFaculty ? 'Add student' : 'Add user'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button form="user-form" type="submit" loading={busy}>{edit?._id ? 'Save changes' : isFaculty ? 'Add student' : 'Add user'}</Button></>}>
        {edit && (
          <form id="user-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" hint="Letters, spaces and dots only" className="sm:col-span-2"><Input required {...NAME_PATTERN} value={edit.name} onChange={set('name')} /></Field>
            <Field label="Email"><Input type="email" required value={edit.email} onChange={set('email')} /></Field>
            {!isFaculty && <Field label="Role"><Select value={edit.role} onChange={set('role')} options={ROLES.map((r) => ({ value: r.value, label: r.label.replace(/s$/, '') }))} /></Field>}
            <Field label="Phone" hint="10 digits"><PhoneInput value={edit.phone || ''} onChange={set('phone')} /></Field>
            {isStudent ? (
              <>
                <Field label="Roll number"><Input required value={edit.rollNo} onChange={set('rollNo')} /></Field>
                <Field label="Level"><MasterSelect list={masters.levels} value={edit.level} onChange={set('level')} /></Field>
                <Field label="Program"><MasterSelect list={masters.programs} value={edit.program} onChange={set('program')} /></Field>
                <Field label="Batch"><MasterSelect list={masters.batches} value={edit.batch} onChange={set('batch')} /></Field>
                <Field label="Section"><MasterSelect list={masters.sections} value={edit.section} onChange={set('section')} /></Field>
                <Field label="Semester"><MasterSelect list={masters.semesters} value={edit.semester} onChange={set('semester')} /></Field>
                {isFaculty && !edit._id && myCourses?.length > 0 && (
                  <Field label="Enrol in my courses (required)" hint="Pick at least one. Courses matching the student's level, program, batch, section and semester are also added automatically." className="sm:col-span-2">
                    <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                      {myCourses.map((c) => (
                        <label key={c._id} className="flex items-center gap-2 text-[14px]">
                          <input type="checkbox" checked={edit.courses.includes(c._id)} onChange={() => toggleCourse(c._id)} />
                          {c.code} {c.name}
                        </label>
                      ))}
                    </div>
                  </Field>
                )}
              </>
            ) : (
              <>
                <Field label="Employee ID"><Input value={edit.employeeId} onChange={set('employeeId')} /></Field>
                <Field label="Department"><MasterSelect list={masters.departments} value={edit.department} onChange={set('department')} /></Field>
                <Field label="Designation"><Input value={edit.designation} onChange={set('designation')} /></Field>
              </>
            )}
            <Field label={edit._id ? 'Reset password' : 'Password'} hint={edit._id ? 'Leave blank to keep the current password' : 'Leave blank to use Welcome@123'} className="sm:col-span-2">
              <Input type="text" minLength={6} value={edit.password} onChange={set('password')} />
            </Field>
          </form>
        )}
      </Modal>
    </>
  );
}
