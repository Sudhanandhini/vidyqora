import { useEffect, useState } from 'react';
import api from '../api';
import { useFetch, PageHeader, Card, Table, Button, Loading, toast, errMsg } from '../components/ui';

// What a grant adds on top of what each role can already do. Keys match the backend SECTIONS.
const SECTIONS = [
  { key: 'users', label: 'Users', grants: 'Add, edit, deactivate, delete and restore any user. Admin accounts stay admin-only.', staff: 'Not available', faculty: 'Students of their own courses' },
  { key: 'courses', label: 'Courses', grants: 'Create, edit and delete every course; assign faculty and students.', staff: 'Not available', faculty: 'Their own courses' },
  { key: 'setup', label: 'Academic setup', grants: 'Edit departments, programs, batches, sections, semesters and fee types.', staff: 'Not available', faculty: 'Not available' },
  { key: 'calendar', label: 'Calendar', grants: 'Add and edit every event and holiday; change weekly offs and sessions.', staff: 'Add and edit events', faculty: 'View only' },
  { key: 'messaging', label: 'Messaging', grants: 'Message any group, manage templates and see everyone\'s sent messages.', staff: 'Send to groups', faculty: 'Their own course students' },
  { key: 'fees', label: 'Fees', grants: 'Assign fees, record payments, delete and restore fee entries.', staff: 'Assign fees and record payments', faculty: 'Not available' },
  { key: 'requests', label: 'Requests', grants: 'Handle all student requests, including deleting them.', staff: 'Approve and reject requests', faculty: 'Not available' },
  { key: 'reports', label: 'Reports', grants: 'Run every report the admin can, including user lists.', staff: 'Office reports', faculty: 'Their own course reports' },
];
const ROLES = [{ value: 'staff', label: 'Office staff' }, { value: 'faculty', label: 'Faculty' }];

export default function Permissions() {
  const { data, loading } = useFetch('/permissions');
  const [perm, setPerm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setPerm(data); }, [data]);

  const toggle = (role, key) => setPerm({ ...perm, [role]: perm[role].includes(key) ? perm[role].filter((k) => k !== key) : [...perm[role], key] });
  const changed = data && perm && ROLES.some(({ value }) => [...data[value]].sort().join() !== [...perm[value]].sort().join());
  const save = async () => {
    setBusy(true);
    try { setPerm((await api.put('/permissions', perm)).data); toast('Permissions saved. They apply the next time staff and faculty sign in or reload the page.'); }
    catch (e) { errMsg(e); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Permissions" subtitle="Give office staff or faculty full admin access to a section. Unticked, they keep their usual access shown in grey."
        actions={<Button onClick={save} loading={busy} disabled={!changed}>Save changes</Button>} />
      {loading || !perm ? <Loading /> : (
        <Card pad={false}>
          <Table rows={SECTIONS.map((s) => ({ ...s, _id: s.key }))} columns={[
            { label: 'Section', render: (s) => <><p className="font-medium">{s.label}</p><p className="max-w-md text-xs text-ink-faint">With access: {s.grants}</p></> },
            ...ROLES.map((r) => ({
              label: r.label,
              render: (s) => (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#062a52]" checked={perm[r.value].includes(s.key)} onChange={() => toggle(r.value, s.key)} />
                  <span><span className="font-medium">Full access</span><span className="block text-xs text-ink-faint">Usual: {s[r.value]}</span></span>
                </label>
              ),
            })),
          ]} />
        </Card>
      )}
      <p className="mt-4 text-xs text-ink-faint">Only admins can open this page, and admin accounts can only be created or changed by an admin.</p>
    </>
  );
}
