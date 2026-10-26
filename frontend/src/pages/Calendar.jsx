import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Button, Modal, Field, Input, Textarea, Select, Badge, Tabs, Loading, isoDate, fmtDate, toast, errMsg } from '../components/ui';

const TYPES = [
  { value: 'holiday', label: 'Holiday', dot: 'bg-sand-400', chip: 'bg-sand-100 text-sand-600' },
  { value: 'exam', label: 'Exam', dot: 'bg-red-600', chip: 'bg-red-50 text-red-800' },
  { value: 'event', label: 'Event', dot: 'bg-primary-500', chip: 'bg-primary-50 text-primary' },
  { value: 'other', label: 'Other', dot: 'bg-ink-faint', chip: 'bg-canvas text-ink-soft' },
];
const T = Object.fromEntries(TYPES.map((t) => [t.value, t]));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const sameDayOrIn = (d, e) => { const k = isoDate(d); return k >= isoDate(e.start) && k <= isoDate(e.end); };

function MonthGrid({ cursor, events, offs, onDay, onEvent }) {
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);
  const today = isoDate();
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[700px] grid-cols-7 border-l border-t border-primary-100">
        {DAYS.map((d, i) => <div key={d} className={`border-b-2 border-r border-b-sand-300 border-r-primary-100 bg-primary-50 px-2 py-2 text-[12.5px] font-semibold ${offs.includes(i) ? 'text-ink-faint' : 'text-primary'}`}>{d}</div>)}
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const evs = events.filter((e) => sameDayOrIn(d, e));
          const off = offs.includes(d.getDay());
          return (
            <div key={d.toISOString()} onClick={() => onDay(d)} className={`min-h-[104px] cursor-pointer border-b border-r border-primary-100 p-1.5 hover:bg-sand-50 ${off ? 'bg-canvas' : 'bg-white'} ${inMonth ? '' : 'opacity-45'}`}>
              <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1 text-[13px] ${isoDate(d) === today ? 'bg-primary font-semibold text-white' : 'text-ink-soft'}`}>{d.getDate()}</span>
              <div className="mt-1 space-y-1">
                {evs.slice(0, 3).map((e) => (
                  <button key={e._id} onClick={(x) => { x.stopPropagation(); onEvent(e); }} className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[12px] font-medium ${T[e.type].chip}`}>{e.title}</button>
                ))}
                {evs.length > 3 && <p className="px-1 text-[11px] text-ink-faint">+{evs.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Settings() {
  const { data, loading, setData } = useFetch('/calendar/settings');
  const [busy, setBusy] = useState(false);
  if (loading || !data) return <Loading />;
  const toggle = (i) => setData({ ...data, weeklyOffs: data.weeklyOffs.includes(i) ? data.weeklyOffs.filter((x) => x !== i) : [...data.weeklyOffs, i] });
  const setS = (i, patch) => setData({ ...data, sessions: data.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const save = async () => {
    setBusy(true);
    try { await api.put('/calendar/settings', data); toast('Calendar settings saved'); } catch (e) { errMsg(e); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <Card title="Academic year and weekly offs">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Label"><Input value={data.academicYear?.label || ''} onChange={(e) => setData({ ...data, academicYear: { ...data.academicYear, label: e.target.value } })} /></Field>
          <Field label="Starts"><Input type="date" value={data.academicYear?.start ? isoDate(data.academicYear.start) : ''} onChange={(e) => setData({ ...data, academicYear: { ...data.academicYear, start: e.target.value } })} /></Field>
          <Field label="Ends"><Input type="date" value={data.academicYear?.end ? isoDate(data.academicYear.end) : ''} onChange={(e) => setData({ ...data, academicYear: { ...data.academicYear, end: e.target.value } })} /></Field>
        </div>
        <p className="label mt-5">Weekly off days</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <button key={d} onClick={() => toggle(i)} aria-pressed={data.weeklyOffs.includes(i)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${data.weeklyOffs.includes(i) ? 'bg-primary text-white ring-primary' : 'bg-white text-ink-soft ring-primary-100'}`}>{d}</button>
          ))}
        </div>
      </Card>
      <Card title="Session timings" actions={<Button size="sm" variant="secondary" onClick={() => setData({ ...data, sessions: [...data.sessions, { name: `Period ${data.sessions.length + 1}`, start: '', end: '', isBreak: false }] })}><Plus size={14} />Add</Button>}>
        <ul className="space-y-2">
          {data.sessions.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <Input className="!w-36" value={s.name} onChange={(e) => setS(i, { name: e.target.value })} aria-label="Session name" />
              <Input type="time" className="!w-32" value={s.start} onChange={(e) => setS(i, { start: e.target.value })} aria-label="Start" />
              <Input type="time" className="!w-32" value={s.end} onChange={(e) => setS(i, { end: e.target.value })} aria-label="End" />
              <label className="flex items-center gap-1.5 text-sm text-ink-soft"><input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={!!s.isBreak} onChange={(e) => setS(i, { isBreak: e.target.checked })} />Break</label>
              <button onClick={() => setData({ ...data, sessions: data.sessions.filter((_, j) => j !== i) })} className="p-1 text-ink-faint hover:text-red-700" aria-label="Remove session"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      </Card>
      <div className="lg:col-span-2"><Button onClick={save} loading={busy}>Save settings</Button></div>
    </div>
  );
}

export default function Calendar() {
  const { user } = useAuth();
  const canEdit = ['admin', 'staff'].includes(user.role);
  const [tab, setTab] = useState('month');
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const from = new Date(cursor.getFullYear(), cursor.getMonth(), -7);
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 14);
  const { data, loading, reload } = useFetch('/calendar/events', { from: isoDate(from), to: isoDate(to) });
  const settings = useFetch('/calendar/settings');
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);

  const openNew = (d) => canEdit && setEdit({ title: '', description: '', type: 'event', start: isoDate(d), end: isoDate(d), audience: 'all', notify: false });
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (edit._id) await api.put(`/calendar/events/${edit._id}`, edit); else await api.post('/calendar/events', edit);
      toast(edit._id ? 'Event updated' : 'Event added'); setEdit(null); reload();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${edit.title}"?`)) return;
    try { await api.delete(`/calendar/events/${edit._id}`); toast('Event deleted'); setEdit(null); reload(); } catch (err) { errMsg(err); }
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const monthName = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const monthEvents = (data || []).filter((e) => new Date(e.start).getMonth() === cursor.getMonth() || new Date(e.end).getMonth() === cursor.getMonth());

  return (
    <>
      <PageHeader title="Academic calendar" subtitle={settings.data?.academicYear?.label ? `Academic year ${settings.data.academicYear.label}` : 'Holidays, exams and events.'}
        actions={canEdit && tab === 'month' && <Button onClick={() => openNew(new Date())}><Plus size={16} />Add event</Button>} />
      {user.role === 'admin' && <Tabs tabs={[{ value: 'month', label: 'Calendar' }, { value: 'settings', label: 'Settings' }]} value={tab} onChange={setTab} />}
      {tab === 'settings' ? <Settings /> : (
        <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
          <Card pad={false}>
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-xl font-semibold">{monthName}</h2>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></Button>
                <Button size="sm" variant="secondary" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
                <Button size="sm" variant="secondary" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></Button>
              </div>
            </div>
            {loading ? <Loading /> : <MonthGrid cursor={cursor} events={data || []} offs={settings.data?.weeklyOffs || []}
              onDay={openNew} onEvent={(e) => (canEdit ? setEdit({ ...e, start: isoDate(e.start), end: isoDate(e.end) }) : setView(e))} />}
          </Card>
          <Card title="This month">
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
              {TYPES.map((t) => <span key={t.value} className="flex items-center gap-1.5 text-xs text-ink-soft"><span className={`h-2 w-2 rounded-full ${t.dot}`} />{t.label}</span>)}
            </div>
            {!monthEvents.length ? <p className="text-sm text-ink-faint">Nothing scheduled.</p> : (
              <ul className="space-y-3">
                {monthEvents.map((e) => (
                  <li key={e._id} className="flex gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${T[e.type].dot}`} />
                    <div><p className="text-sm font-medium">{e.title}</p><p className="text-xs text-ink-faint">{fmtDate(e.start)}{isoDate(e.start) !== isoDate(e.end) ? ` to ${fmtDate(e.end)}` : ''}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Modal open={!!view} onClose={() => setView(null)} title={view?.title || ''}>
        {view && <><Badge tone={view.type === 'holiday' ? 'sand' : view.type === 'exam' ? 'red' : 'blue'}>{T[view.type].label}</Badge>
          <p className="mt-3">{fmtDate(view.start)}{isoDate(view.start) !== isoDate(view.end) ? ` to ${fmtDate(view.end)}` : ''}</p>
          {view.description && <p className="mt-2 text-ink-soft">{view.description}</p>}</>}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit event' : 'Add event'}
        footer={<>{edit?._id && <Button variant="danger" className="mr-auto" onClick={remove}>Delete</Button>}<Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button form="ev-form" type="submit" loading={busy}>{edit?._id ? 'Save changes' : 'Add event'}</Button></>}>
        {edit && (
          <form id="ev-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2"><Input required value={edit.title} onChange={set('title')} /></Field>
            <Field label="Type"><Select value={edit.type} onChange={set('type')} options={TYPES} /></Field>
            <Field label="Shown to"><Select value={edit.audience} onChange={set('audience')} options={[{ value: 'all', label: 'Everyone' }, { value: 'faculty', label: 'Faculty only' }, { value: 'student', label: 'Students only' }, { value: 'staff', label: 'Office staff only' }]} /></Field>
            <Field label="From"><Input type="date" required value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value, end: edit.end < e.target.value ? e.target.value : edit.end })} /></Field>
            <Field label="To"><Input type="date" required min={edit.start} value={edit.end} onChange={set('end')} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea rows={3} value={edit.description || ''} onChange={set('description')} /></Field>
            {!edit._id && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[#062a52]" checked={edit.notify} onChange={set('notify')} />Notify everyone it is shown to</label>}
          </form>
        )}
      </Modal>
    </>
  );
}
