import { useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Textarea, Select, Tabs, Loading, StatusBadge, fmtDate, toast, errMsg } from '../components/ui';
import { FilterBar, SearchBox, FilterSelect, DeletedBadge, useTrash, deleteWithRestore, matches } from '../components/listTools';

export default function Requests() {
  const { user } = useAuth();
  const student = user.role === 'student';
  const admin = user.role === 'admin';
  const [status, setStatus] = useState(student ? '' : 'pending'); // ... | deleted (admin)
  const showDeleted = status === 'deleted';
  const current = useFetch(showDeleted ? null : '/requests', { status });
  const deleted = useFetch(showDeleted ? '/requests/deleted' : null);
  const { data, loading } = showDeleted ? deleted : current;
  const reload = () => { current.reload(); deleted.reload(); };
  const trash = useTrash('/requests', reload);
  const types = useFetch('/requests/types');
  const [f, setF] = useState({ q: '', type: '' });
  const rows = (data || []).filter((r) => matches(f.q, r.student?.name, r.student?.rollNo, r.details, r.remarks) && (!f.type || r.type === f.type));
  const [form, setForm] = useState(null);
  const [handle, setHandle] = useState(null);
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post('/requests', form); toast('Request submitted'); setForm(null); reload(); } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const update = async (s) => {
    setBusy(s);
    try { await api.put(`/requests/${handle._id}`, { status: s, remarks: handle.remarks }); toast(`Request ${s}`); setHandle(null); reload(); }
    catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete the ${r.type} request from ${r.student?.name}? You can restore it from the Deleted tab.`)) return;
    await deleteWithRestore('/requests', r, 'Request deleted', reload);
  };

  return (
    <>
      <PageHeader title={student ? 'My requests' : 'Service requests'}
        subtitle={student ? 'Certificates, ID cards and corrections.' : 'Requests raised by students.'}
        actions={student && <Button onClick={() => setForm({ type: types.data?.[0] || '', details: '' })}><Plus size={16} />New request</Button>} />
      <Tabs tabs={[...(student ? [{ value: '', label: 'All' }] : []), { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'completed', label: 'Completed' }, { value: 'rejected', label: 'Rejected' },
        ...(!student ? [{ value: '', label: 'All' }] : []), ...(admin ? [{ value: 'deleted', label: 'Deleted' }] : [])]}
        value={status} onChange={setStatus} />
      <Card pad={false}>
        <FilterBar>
          <SearchBox placeholder={student ? 'Search in details or remarks' : 'Search by student, roll number, details or remarks'} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <FilterSelect label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="All types" options={types.data || []} />
        </FilterBar>
        {loading ? <Loading /> : (
          <Table rows={rows} empty={showDeleted ? 'No deleted requests' : data?.length ? 'No requests match these filters' : student ? 'You have not raised any requests' : 'No requests here'} columns={[
            ...(!student ? [{ label: 'Student', render: (r) => <><p className="font-medium">{r.student?.name}</p><p className="text-xs text-ink-faint">{r.student?.rollNo}</p></> }] : []),
            { label: 'Request', render: (r) => <><p className="font-medium">{r.type}</p><p className="line-clamp-2 max-w-md text-sm text-ink-soft">{r.details}</p></> },
            { label: 'Raised', render: (r) => fmtDate(r.createdAt) },
            { label: 'Status', render: (r) => (r.deletedAt ? <DeletedBadge item={r} /> : <StatusBadge status={r.status} />) },
            { label: 'Remarks', render: (r) => <span className="text-sm text-ink-soft">{r.remarks || '-'}</span> },
            ...(!student ? [{ label: '', className: 'text-right', render: (r) => (r.deletedAt ? trash.actions(r, `the ${r.type} request from ${r.student?.name}`) : (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="secondary" onClick={() => setHandle({ ...r, remarks: r.remarks || '' })}>Update</Button>
                {admin && <Button size="sm" variant="danger" onClick={() => remove(r)}>Delete</Button>}
              </div>)) }] : []),
          ]} />
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title="New request"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button form="rq-form" type="submit" loading={busy}>Submit request</Button></>}>
        {form && (
          <form id="rq-form" onSubmit={create} className="space-y-4">
            <Field label="Request type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={types.data || []} /></Field>
            <Field label="Details" hint="Say why you need it and any dates that matter."><Textarea required value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field>
          </form>
        )}
      </Modal>

      <Modal open={!!handle} onClose={() => setHandle(null)} title={handle ? `${handle.type}: ${handle.student?.name}` : ''}
        footer={<>
          <Button variant="danger" onClick={() => update('rejected')} loading={busy === 'rejected'}>Reject</Button>
          <Button variant="secondary" onClick={() => update('approved')} loading={busy === 'approved'}>Approve</Button>
          <Button onClick={() => update('completed')} loading={busy === 'completed'}>Mark completed</Button>
        </>}>
        {handle && (
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-ink-soft">{handle.details}</p>
            <Field label="Remarks to student"><Textarea rows={3} value={handle.remarks} onChange={(e) => setHandle({ ...handle, remarks: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}
