import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { FilterBar, SearchBox, FilterSelect, ACTIVE_OPTIONS, DeletedBadge, useTrash, deleteWithRestore, matches } from '../components/listTools';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Textarea, Select, Tabs, Loading, Badge, StatusBadge, fmtDateTime, toast, errMsg } from '../components/ui';

const CHANNELS = [
  { value: 'inapp', label: 'In-app', hint: 'Shows under Notifications and the bell when they open Vidyqora.' },
  { value: 'email', label: 'Email', hint: 'Sent to the email address on their profile.' },
  { value: 'sms', label: 'SMS', hint: 'Text message to the phone number on their profile.' },
  { value: 'push', label: 'Push', hint: 'Pop-up alert on their phone or browser, even when Vidyqora is closed. Not set up yet, so it is delivered as in-app only for now.' },
];
const GROUPS = [{ value: 'student', label: 'Students' }, { value: 'faculty', label: 'Faculty' }, { value: 'staff', label: 'Office staff' }];

function Compose({ onSent }) {
  const { user } = useAuth();
  const faculty = user.role === 'faculty';
  const courses = useFetch('/courses');
  const templates = useFetch('/messages/templates');
  const blank = { subject: '', body: '', channels: ['inapp'], audience: { type: faculty ? 'course' : 'role', roles: ['student'], course: '', users: [] }, schedule: false, scheduledAt: '' };
  const [m, setM] = useState(blank);
  // "Particular students": pick a course, then tick students from its roster
  const [pickCourse, setPickCourse] = useState('');
  const [pickQ, setPickQ] = useState('');
  const roster = useFetch(m.audience.type === 'users' && pickCourse ? `/courses/${pickCourse}` : null);
  const rosterRows = (roster.data?.students || []).filter((s) => !pickQ || `${s.name} ${s.rollNo || ''}`.toLowerCase().includes(pickQ.toLowerCase()));
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const a = m.audience;
    if ((a.type === 'course' && !a.course) || (a.type === 'role' && !a.roles.length) || (a.type === 'users' && !a.users.length)) { setCount(null); return; }
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
      setM(blank); setPickCourse(''); setPickQ(''); onSent();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={send} className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      {/* Message box fills the column height; the textarea grows into the extra space */}
      <Card title="Message" className="flex flex-col [&>div:last-child]:flex [&>div:last-child]:flex-1 [&>div:last-child]:flex-col">
        <div className="flex flex-1 flex-col space-y-4">
          {!!templates.data?.length && (
            <Field label="Start from a template"><Select value={m.template || ''} onChange={(e) => applyTemplate(e.target.value)} placeholder="Blank message" options={templates.data.filter((t) => t.active).map((t) => ({ value: t._id, label: `${t.name} (${t.channel})` }))} /></Field>
          )}
          <Field label="Subject"><Input required value={m.subject} onChange={(e) => setM({ ...m, subject: e.target.value })} /></Field>
          <Field label="Message" className="flex flex-1 flex-col" hint="Use {name} or {rollNo} to personalise each message."><Textarea rows={7} className="flex-1" required value={m.body} onChange={(e) => setM({ ...m, body: e.target.value })} /></Field>
          {m.channels.includes('sms') && <p className="text-xs text-ink-faint">{m.body.length} characters, {Math.max(1, Math.ceil(m.body.length / 160))} SMS per person. SMS text must match an approved DLT template.</p>}
        </div>
      </Card>
      <div className="space-y-6">
        <Card title="Recipients">
          <div className="space-y-4">
            <Select value={m.audience.type} onChange={(e) => aud({ type: e.target.value })} options={[
              ...(faculty ? [] : [{ value: 'role', label: 'User groups' }]),
              { value: 'course', label: 'All students of a course' },
              { value: 'users', label: 'Particular students' },
            ]} />
            {m.audience.type === 'users' ? (
              <div className="space-y-2">
                <Select value={pickCourse} onChange={(e) => { setPickCourse(e.target.value); setPickQ(''); }} placeholder="Choose a course to pick from" options={(courses.data || []).map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))} />
                {pickCourse && (roster.loading ? <Loading /> : (
                  <>
                    <Input placeholder="Search by name or roll number" value={pickQ} onChange={(e) => setPickQ(e.target.value)} />
                    <ul className="max-h-64 divide-y divide-primary-50 overflow-y-auto rounded-md border border-primary-100">
                      {rosterRows.map((s) => (
                        <li key={s._id}>
                          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-canvas">
                            <input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={m.audience.users.includes(s._id)} onChange={() => aud({ users: toggle(m.audience.users, s._id) })} />
                            <span className="flex-1">{s.name}</span><span className="text-xs text-ink-faint">{s.rollNo}</span>
                          </label>
                        </li>
                      ))}
                      {!rosterRows.length && <li className="px-3 py-2 text-sm text-ink-faint">No students match</li>}
                    </ul>
                  </>
                ))}
                {m.audience.users.length > 0 && (
                  <button type="button" className="text-xs text-primary-500 hover:underline" onClick={() => aud({ users: [] })}>Clear {m.audience.users.length} selected</button>
                )}
              </div>
            ) : m.audience.type === 'role' ? (
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
            <div className="space-y-3">
              {CHANNELS.map((c) => (
                <label key={c.value} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#062a52]" checked={m.channels.includes(c.value)} onChange={() => setM({ ...m, channels: toggle(m.channels, c.value) })} />
                  <span><span className="font-medium">{c.label}</span><span className="block text-xs text-ink-faint">{c.hint}</span></span>
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

const MSG_STATUS = [{ value: 'sent', label: 'Sent' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'failed', label: 'Failed' }, { value: 'deleted', label: 'Deleted' }];

function Sent() {
  const [f, setF] = useState({ q: '', status: '', channel: '' });
  const setFilter = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const showDeleted = f.status === 'deleted';
  const sent = useFetch('/messages');
  const deleted = useFetch(showDeleted ? '/messages/deleted' : null);
  const { data, loading } = showDeleted ? deleted : sent;
  const reload = () => { sent.reload(); deleted.reload(); };
  const trash = useTrash('/messages', reload);
  const rows = (data || []).filter((m) => matches(f.q, m.subject, m.body, m.audience.course?.code, ...(m.audience.users || []).map((u) => u.name))
    && (showDeleted || !f.status || m.status === f.status) && (!f.channel || m.channels.includes(f.channel)));
  const remove = async (m) => {
    const scheduled = m.status === 'scheduled';
    if (!window.confirm(scheduled ? 'Cancel this scheduled message? It will not be sent unless restored.' : `Delete "${m.subject}" from this list?`)) return;
    await deleteWithRestore('/messages', m, scheduled ? 'Scheduled message cancelled' : 'Message deleted', reload);
  };
  return (
    <Card pad={false}>
      <FilterBar>
        <SearchBox placeholder="Search by subject, text, course or student" value={f.q} onChange={setFilter('q')} />
        <FilterSelect label="Status" value={f.status} onChange={setFilter('status')} placeholder="All statuses" options={MSG_STATUS} />
        <FilterSelect label="Channel" value={f.channel} onChange={setFilter('channel')} placeholder="All channels" options={CHANNELS} />
      </FilterBar>
      {loading ? <Loading /> : (
      <Table rows={rows} empty={showDeleted ? 'No deleted messages' : data?.length ? 'No messages match these filters' : 'No messages sent yet'} columns={[
        { label: 'Message', render: (m) => <><p className="font-medium">{m.subject}</p><p className="line-clamp-1 max-w-md text-xs text-ink-faint">{m.body}</p></> },
        { label: 'To', render: (m) => (m.audience.type === 'course' ? m.audience.course?.code
          : m.audience.type === 'users' ? <span title={m.audience.users?.map((u) => u.name).join(', ')}>{m.audience.users?.length === 1 ? m.audience.users[0].name : `${m.audience.users?.length} students`}</span>
            : (m.audience.roles || []).join(', ')) },
        { label: 'Channels', render: (m) => <div className="flex flex-wrap gap-1">{m.channels.map((c) => <Badge key={c} tone="blue">{CHANNELS.find((x) => x.value === c)?.label}</Badge>)}</div> },
        { label: 'Recipients', render: (m) => m.stats?.recipients ?? '-' },
        { label: 'When', render: (m) => fmtDateTime(m.sentAt || m.scheduledAt) },
        { label: 'Status', render: (m) => (m.deletedAt ? <DeletedBadge item={m} /> : <StatusBadge status={m.status} />) },
        { label: '', className: 'text-right', render: (m) => (m.deletedAt ? trash.actions(m, `"${m.subject}"`)
          : <Button size="sm" variant="danger" onClick={() => remove(m)}>{m.status === 'scheduled' ? 'Cancel' : 'Delete'}</Button>) },
      ]} />
      )}
    </Card>
  );
}

function Templates() {
  const [f, setF] = useState({ q: '', status: '' });
  const setFilter = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const showDeleted = f.status === 'deleted';
  const current = useFetch('/messages/templates');
  const deleted = useFetch(showDeleted ? '/messages/templates/deleted' : null);
  const { data, loading } = showDeleted ? deleted : current;
  const reload = () => { current.reload(); deleted.reload(); };
  const trash = useTrash('/messages/templates', reload);
  const rows = (data || []).filter((t) => matches(f.q, t.name, t.subject, t.body, t.event)
    && (showDeleted || !f.status || String(!!t.active) === f.status));
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
    await deleteWithRestore('/messages/templates', t, 'Template deleted', reload);
  };
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEdit({ name: '', event: '', channel: 'inapp', subject: '', body: '', dltTemplateId: '', active: true })}><Plus size={16} />New template</Button></div>
      <Card pad={false}>
        <FilterBar>
          <SearchBox placeholder="Search by name, subject, text or trigger" value={f.q} onChange={setFilter('q')} />
          <FilterSelect label="Status" value={f.status} onChange={setFilter('status')} placeholder="All statuses" options={ACTIVE_OPTIONS} />
        </FilterBar>
        {loading ? <Loading /> : (
          <Table rows={rows} empty={showDeleted ? 'No deleted templates' : data?.length ? 'No templates match these filters' : 'No templates yet'} columns={[
            { label: 'Template', render: (t) => <><p className="font-medium">{t.name}</p><p className="line-clamp-1 max-w-md text-xs text-ink-faint">{t.body}</p></> },
            { label: 'Channel', render: (t) => CHANNELS.find((c) => c.value === t.channel)?.label },
            { label: 'Trigger', render: (t) => t.event || 'Manual' },
            { label: 'Status', render: (t) => (t.deletedAt ? <DeletedBadge item={t} /> : <Badge tone={t.active ? 'green' : 'grey'}>{t.active ? 'Active' : 'Inactive'}</Badge>) },
            { label: '', className: 'text-right', render: (t) => (t.deletedAt ? trash.actions(t, `template "${t.name}"`)
              : <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit(t)}>Edit</Button><Button size="sm" variant="danger" onClick={() => remove(t)}>Delete</Button></div>) },
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
