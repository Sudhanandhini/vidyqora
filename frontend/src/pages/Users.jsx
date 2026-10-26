import { useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Select, Badge, Tabs, Loading, toast, errMsg } from '../components/ui';

const ROLES = [{ value: 'student', label: 'Students' }, { value: 'faculty', label: 'Faculty' }, { value: 'staff', label: 'Office staff' }, { value: 'admin', label: 'Admins' }];
const BLANK = { name: '', email: '', role: 'student', phone: '', department: '', designation: '', employeeId: '', rollNo: '', program: '', batch: '', section: '', password: '' };

export default function Users() {
  const { user } = useAuth();
  const isFaculty = user.role === 'faculty'; // faculty can view and add students only
  const [role, setRole] = useState('student');
  const [q, setQ] = useState('');
  const { data, loading, reload } = useFetch('/users', { role, q });
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: myCourses } = useFetch(isFaculty ? '/courses' : null);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
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
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  const isStudent = edit?.role === 'student';
  const toggleCourse = (id) => setEdit({ ...edit, courses: edit.courses.includes(id) ? edit.courses.filter((c) => c !== id) : [...edit.courses, id] });

  return (
    <>
      <PageHeader title={isFaculty ? 'Students' : 'Users'} subtitle={isFaculty ? 'Student accounts. Students you add here are visible to admin and enrolled in your selected courses.' : 'Accounts for students, faculty and office staff.'}
        actions={<Button onClick={() => setEdit({ ...BLANK, role, courses: [] })}><Plus size={16} />{isFaculty ? 'Add student' : 'Add user'}</Button>} />
      {!isFaculty && <Tabs tabs={ROLES} value={role} onChange={setRole} />}
      <Card pad={false}>
        <div className="border-b border-primary-50 p-4"><Input placeholder="Search by name, email, roll number or employee ID" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" /></div>
        {loading ? <Loading /> : (
          <Table rows={data} empty="No users match this search" columns={[
            { label: 'Name', render: (u) => <><p className="font-medium">{u.name}</p><p className="text-xs text-ink-faint">{u.email}</p></> },
            { label: role === 'student' ? 'Roll number' : 'Employee ID', render: (u) => u.rollNo || u.employeeId || '-' },
            { label: role === 'student' ? 'Batch / Section' : 'Department', render: (u) => (role === 'student' ? [u.program, u.batch, u.section].filter(Boolean).join(' / ') : u.department) || '-' },
            { label: 'Phone', key: 'phone' },
            { label: 'Status', render: (u) => <Badge tone={u.active ? 'green' : 'grey'}>{u.active ? 'Active' : 'Inactive'}</Badge> },
            !isFaculty && { label: '', className: 'text-right', render: (u) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...BLANK, ...u, password: '' })}>Edit</Button>
                <Button size="sm" variant={u.active ? 'danger' : 'secondary'} onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</Button>
              </div>) },
          ].filter(Boolean)} />
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit user' : isFaculty ? 'Add student' : 'Add user'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button form="user-form" type="submit" loading={busy}>{edit?._id ? 'Save changes' : isFaculty ? 'Add student' : 'Add user'}</Button></>}>
        {edit && (
          <form id="user-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" className="sm:col-span-2"><Input required value={edit.name} onChange={set('name')} /></Field>
            <Field label="Email"><Input type="email" required value={edit.email} onChange={set('email')} /></Field>
            {!isFaculty && <Field label="Role"><Select value={edit.role} onChange={set('role')} options={ROLES.map((r) => ({ value: r.value, label: r.label.replace(/s$/, '') }))} /></Field>}
            <Field label="Phone"><Input value={edit.phone} onChange={set('phone')} /></Field>
            {isStudent ? (
              <>
                <Field label="Roll number"><Input required value={edit.rollNo} onChange={set('rollNo')} /></Field>
                <Field label="Program"><Input placeholder="BCA" value={edit.program} onChange={set('program')} /></Field>
                <Field label="Batch"><Input placeholder="2024" value={edit.batch} onChange={set('batch')} /></Field>
                <Field label="Section"><Input placeholder="A" value={edit.section} onChange={set('section')} /></Field>
                {isFaculty && !edit._id && myCourses?.length > 0 && (
                  <Field label="Enrol in my courses" hint="Courses for the same batch and section are added automatically" className="sm:col-span-2">
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
                <Field label="Department"><Input value={edit.department} onChange={set('department')} /></Field>
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
