import { useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Card, Field, Input, Button, toast, errMsg } from '../components/ui';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [phone, setPhone] = useState(user.phone || '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState('');

  const save = async () => {
    setBusy('p');
    try { setUser((await api.put('/auth/profile', { phone })).data); toast('Profile saved'); } catch (e) { errMsg(e); } finally { setBusy(''); }
  };
  const change = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast('New passwords do not match', 'error');
    setBusy('w');
    try { await api.put('/auth/password', pw); toast('Password changed'); setPw({ currentPassword: '', newPassword: '', confirm: '' }); }
    catch (err) { errMsg(err); } finally { setBusy(''); }
  };

  const rows = [
    ['Name', user.name], ['Email', user.email], ['Role', user.role],
    ['Roll number', user.rollNo], ['Employee ID', user.employeeId], ['Department', user.department],
    ['Designation', user.designation], ['Program', user.program], ['Batch / Section', [user.batch, user.section].filter(Boolean).join(' / ')],
  ].filter(([, v]) => v);

  return (
    <>
      <PageHeader title="My profile" subtitle="Contact the admin office to correct official details." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Details">
          <dl className="divide-y divide-primary-50">
            {rows.map(([k, v]) => <div key={k} className="grid grid-cols-[140px_1fr] py-2"><dt className="text-ink-soft">{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="mt-4 flex items-end gap-3">
            <Field label="Phone" className="flex-1"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Button onClick={save} loading={busy === 'p'}>Save phone</Button>
          </div>
        </Card>
        <Card title="Change password">
          <form onSubmit={change} className="space-y-4">
            <Field label="Current password"><Input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password" hint="At least 6 characters"><Input type="password" required minLength={6} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Field label="Confirm new password"><Input type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <Button type="submit" loading={busy === 'w'}>Change password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
