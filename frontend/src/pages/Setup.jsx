import { useState } from 'react';
import { Plus, X, Pencil, Check } from 'lucide-react';
import api from '../api';
import { useFetch, PageHeader, Card, Button, Input, Loading, toast, errMsg } from '../components/ui';

const LISTS = [
  { kind: 'levels', title: 'Levels', placeholder: 'UG' },
  { kind: 'departments', title: 'Departments', placeholder: 'Computer Science' },
  { kind: 'programs', title: 'Programs', placeholder: 'BCA' },
  { kind: 'batches', title: 'Batches', placeholder: '2024' },
  { kind: 'sections', title: 'Sections', placeholder: 'A' },
  { kind: 'semesters', title: 'Semesters', placeholder: '1' },
  { kind: 'feeTypes', title: 'Fees', placeholder: 'Tuition fee' },
];

function MasterList({ kind, title, placeholder, items, onChange }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { from, to }
  const add = async (e) => {
    e.preventDefault(); setBusy(true);
    try { onChange((await api.post(`/masters/${kind}`, { name })).data); setName(''); toast(`${name.trim()} added`); } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const rename = async (e) => {
    e.preventDefault();
    const { from, to } = editing;
    if (to.trim() === from) { setEditing(null); return; }
    setBusy(true);
    try {
      onChange((await api.put(`/masters/${kind}/${encodeURIComponent(from)}`, { name: to })).data);
      setEditing(null); toast(`${from} renamed to ${to.trim()}. Courses and users updated.`);
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Remove ${item}? Courses and users already using it keep their value.`)) return;
    try { onChange((await api.delete(`/masters/${kind}/${encodeURIComponent(item)}`)).data); toast(`${item} removed`); } catch (err) { errMsg(err); }
  };
  return (
    <Card title={`${title} (${items.length})`}>
      <form onSubmit={add} className="mb-4 flex gap-2">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={`New ${title.toLowerCase()}`} />
        <Button type="submit" loading={busy}><Plus size={16} />Add</Button>
      </form>
      {!items.length && <p className="text-sm text-ink-faint">Nothing added yet.</p>}
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (editing?.from === item ? (
          <li key={item}>
            <form onSubmit={rename} className="flex items-center gap-1">
              <Input autoFocus required className="!w-40 !py-1" value={editing.to} aria-label={`Rename ${item}`}
                onChange={(e) => setEditing({ ...editing, to: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} />
              <Button type="submit" size="sm" loading={busy}><Check size={14} />Save</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </form>
          </li>
        ) : (
          <li key={item} className="flex items-center gap-0.5 rounded-full bg-primary-50 py-1 pl-3 pr-1 text-sm text-primary">
            <span className="mr-1">{item}</span>
            <button onClick={() => setEditing({ from: item, to: item })} className="rounded-full p-1 text-ink-faint hover:bg-white hover:text-primary" aria-label={`Edit ${item}`}><Pencil size={12} /></button>
            <button onClick={() => remove(item)} className="rounded-full p-1 text-ink-faint hover:bg-white hover:text-red-700" aria-label={`Remove ${item}`}><X size={13} /></button>
          </li>
        )))}
      </ul>
    </Card>
  );
}

export default function Setup() {
  const { data, loading, setData } = useFetch('/masters');
  return (
    <>
      <PageHeader title="Academic setup" subtitle="Levels, departments, programs, batches, sections, semesters and fee types shown as choices in course, user and fee forms." />
      {loading || !data ? <Loading /> : (
        <div className="grid gap-5 md:grid-cols-2">
          {LISTS.map((l) => <MasterList key={l.kind} {...l} items={data[l.kind]} onChange={setData} />)}
        </div>
      )}
    </>
  );
}
