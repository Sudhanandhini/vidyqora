import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Textarea, Select, Tabs, Loading, Badge, StatusBadge, fmtDateTime, toast, errMsg } from '../components/ui';

const CHANNELS = [{ value: 'inapp', label: 'In-app' }, { value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }, { value: 'push', label: 'Push' }];
const GROUPS = [{ value: 'student', label: 'Students' }, { value: 'faculty', label: 'Faculty' }, { value: 'staff', label: 'Office staff' }];

function Compose({ onSent }) {
  const { user } = useAuth();
  const faculty = user.role === 'faculty';
  const courses = useFetch('/courses');
  const templates = useFetch('/messages/templates');
  const blank = { subject: '', body: '', channels: ['inapp'], audience: { type: faculty ? 'course' : 'role', roles: ['student'], course: '' }, schedule: false, scheduledAt: '' };
  const [m, setM] = useState(blank);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const a = m.audience;
    if ((a.type === 'course' && !a.course) || (a.type === 'role' && !a.roles.length)) { setCount(null); return; }
    const t = setTimeout(() => api.post('/messages/preview', { audience: a }).then((r) => setCount(r.data.recipients)).catch(() => setCount(null)), 250);
    return () => clearTimeout(t);
  }, [m.audience]);

  const aud = (patch) => setM({ ...m, audience: { ...m.audience, ...patch } });
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const applyTemplate = (id) => {
    const t = templates.data?.find((x) => x._id === id);
    if (t) setM({ ...m, template: t._id, subject: t.subject || t.name, body: t.body, channels: [t.channel] });
  };
  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post('/messages', { ...m, scheduledAt: m.schedule && m.scheduledAt ? new Date(m.scheduledAt).toISOString() : undefined });
      toast(data.status === 'scheduled' ? `Scheduled for ${fmtDateTime(data.scheduledAt)}` : `Sent to ${data.stats?.recipients ?? 0} people`);
      setM(blank); onSent();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={send} className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <Card title="Message">
        <div className="space-y-4">
          {!!templates.data?.length && (
            <Field label="Start from a template"><Select value={m.template || ''} onChange={(e) => applyTemplate(e.target.value)} placeholder="Blank message" options={templates.data.filter((t) => t.active).map((t) => ({ value: t._id, label: `${t.name} (${t.channel})` }))} /></Field>
          )}
          <Field label="Subject"><Input required value={m.subject} onChange={(e) => setM({ ...m, subject: e.target.value })} /></Field>
          <Field label="Message" hint="Use {name} or {rollNo} to personalise each message."><Textarea rows={7} required value={m.body} onChange={(e) => setM({ ...m, body: e.target.value })} /></Field>
          {m.channels.includes('sms') && <p className="text-xs text-ink-faint">{m.body.length} characters, {Math.max(1, Math.ceil(m.body.length / 160))} SMS per person. SMS text must match an approved DLT template.</p>}
        </div>
      </Card>
      <div className="space-y-6">
        <Card title="Recipients">
          <div className="space-y-4">
            {!faculty && (
              <Select value={m.audience.type} onChange={(e) => aud({ type: e.target.value })} options={[{ value: 'role', label: 'User groups' }, { value: 'course', label: 'Students of a course' }]} />
            )}
            {m.audience.type === 'role' ? (
              <div className="flex flex-wrap gap-2">
                {GROUPS.map((g) => (
                  <button type="button" key={g.value} onClick={() => aud({ roles: toggle(m.audience.roles, g.value) })} aria-pressed={m.audience.roles.includes(g.value)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${m.audience.roles.includes(g.value) ? 'bg-primary text-white ring-primary' : 'bg-white text-ink-soft ring-primary-100'}`}>{g.label}</button>
                ))}
              </div>
            ) : (
              <Select value={m.audience.course} onChange={(e) => aud({ course: e.target.value })} placeholder="Choose a course" options={(courses.data || []).map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))} />
            )}
            <p className="text-sm text-ink-soft">{count == null ? 'Choose recipients' : <><b className="text-primary">{count}</b> people will receive this</>}</p>
          </div>
        </Card>
        <Card title="Delivery">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {CHANNELS.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={m.channels.includes(c.value)} onChange={() => setM({ ...m, channels: toggle(m.channels, c.value) })} />{c.label}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={m.schedule} onChange={(e) => setM({ ...m, schedule: e.target.checked })} />Send later</label>
            {m.schedule && <Input type="datetime-local" required value={m.scheduledAt} onChange={(e) => setM({ ...m, scheduledAt: e.target.value })} />}
            <Button type="submit" loading={busy} className="w-full">{m.schedule ? 'Schedule message' : 'Send now'}</Button>
          </div>
        </Card>
      </div>
    </form>
  );
}

function Sent() {
  const { data, loading, reload } = useFetch('/messages');
  const cancel = async (m) => {
    if (!window.confirm('Cancel this scheduled message?')) return;
    try { await api.delete(`/messages/${m._id}`); toast('Scheduled message cancelled'); reload(); } catch (e) { errMsg(e); }
  };
  if (loading) return <Loading />;
  return (
    <Card pad={false}>
      <Table rows={data} empty="No messages sent yet" columns={[
        { label: 'Message', render: (m) => <><p className="font-medium">{m.subject}</p><p className="line-clamp-1 max-w-md text-xs text-ink-faint">{m.body}</p></> },
        { label: 'To', render: (m) => (m.audience.type === 'course' ? m.audience.course?.code : (m.audience.roles || []).join(', ')) },
        { label: 'Channels', render: (m) => <div className="flex flex-wrap gap-1">{m.channels.map((c) => <Badge key={c} tone="blue">{CHANNELS.find((x) => x.value === c)?.label}</Badge>)}</div> },
        { label: 'Recipients', render: (m) => m.stats?.recipients ?? '-' },
        { label: 'When', render: (m) => fmtDateTime(m.sentAt || m.scheduledAt) },
        { label: 'Status', render: (m) => <StatusBadge status={m.status} /> },
        { label: '', className: 'text-right', render: (m) => m.status === 'scheduled' && <Button size="sm" variant="danger" onClick={() => cancel(m)}>Cancel</Button> },
      ]} />
    </Card>
  );
}

function Templates() {
  const { data, loading, reload } = useFetch('/messages/templates');
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (edit._id) await api.put(`/messages/templates/${edit._id}`, edit); else await api.post('/messages/templates', edit);
      toast('Template saved'); setEdit(null); reload();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try { await api.delete(`/messages/templates/${t._id}`); toast('Template deleted'); reload(); } catch (e) { errMsg(e); }
  };
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEdit({ name: '', event: '', channel: 'inapp', subject: '', body: '', dltTemplateId: '', active: true })}><Plus size={16} />New template</Button></div>
      <Card pad={false}>
        {loading ? <Loading /> : (
          <Table rows={data} empty="No templates yet" columns={[
            { label: 'Template', render: (t) => <><p className="font-medium">{t.name}</p><p className="line-clamp-1 max-w-md text-xs text-ink-faint">{t.body}</p></> },
            { label: 'Channel', render: (t) => CHANNELS.find((c) => c.value === t.channel)?.label },
            { label: 'Trigger', render: (t) => t.event || 'Manual' },
            { label: 'Status', render: (t) => <Badge tone={t.active ? 'green' : 'grey'}>{t.active ? 'Active' : 'Inactive'}</Badge> },
            { label: '', className: 'text-right', render: (t) => <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit(t)}>Edit</Button><Button size="sm" variant="danger" onClick={() => remove(t)}>Delete</Button></div> },
          ]} />
        )}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit template' : 'New template'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button form="tpl-form" type="submit" loading={busy}>Save template</Button></>}>
        {edit && (
          <form id="tpl-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input required value={edit.name} onChange={set('name')} /></Field>
            <Field label="Channel"><Select value={edit.channel} onChange={set('channel')} options={CHANNELS} /></Field>
            <Field label="Trigger event" hint="e.g. attendance.absent, fee.due"><Input value={edit.event || ''} onChange={set('event')} /></Field>
            <Field label="DLT template ID" hint="Required for SMS"><Input value={edit.dltTemplateId || ''} onChange={set('dltTemplateId')} /></Field>
            <Field label="Subject" className="sm:col-span-2"><Input value={edit.subject || ''} onChange={set('subject')} /></Field>
            <Field label="Message" className="sm:col-span-2" hint="Placeholders: {name}, {rollNo}, {email}"><Textarea required value={edit.body} onChange={set('body')} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={edit.active} onChange={set('active')} />Active</label>
          </form>
        )}
      </Modal>
    </>
  );
}

export default function Messaging() {
  const { user } = useAuth();
  const [tab, setTab] = useState('compose');
  const tabs = [{ value: 'compose', label: 'Compose' }, { value: 'sent', label: 'Sent and scheduled' }];
  if (user.role === 'admin') tabs.push({ value: 'templates', label: 'Templates' });
  return (
    <>
      <PageHeader title="Messaging" subtitle={user.role === 'faculty' ? 'Message the students of your courses.' : 'Send SMS, email, push and in-app messages.'} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'compose' && <Compose onSent={() => setTab('sent')} />}
      {tab === 'sent' && <Sent />}
      {tab === 'templates' && <Templates />}
    </>
  );
}
