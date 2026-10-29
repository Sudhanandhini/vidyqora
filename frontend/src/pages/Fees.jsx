import { useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { FilterBar, SearchBox, FilterSelect, DeletedBadge, useTrash, deleteWithRestore, matches } from '../components/listTools';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Select, MasterSelect, useMasters, Tabs, Loading, Stat, StatusBadge, fmtDate, fmtDateTime, inr, isoDate, toast, errMsg } from '../components/ui';

function Receipt({ fee, onClose }) {
  return (
    <Modal open={!!fee} onClose={onClose} title="Payment receipt" footer={<Button variant="secondary" onClick={() => window.print()}>Print</Button>}>
      {fee && (
        <dl className="divide-y divide-primary-50">
          {[...(fee.name ? [['Student', fee.name]] : []), ['Receipt number', fee.receiptNo], ['Fee', fee.title], ['Amount', inr(fee.amount)], ['Paid on', fmtDateTime(fee.paidAt)], ['Mode', fee.mode], ['Transaction', fee.txnId]]
            .map(([k, v]) => <div key={k} className="grid grid-cols-[150px_1fr] py-2"><dt className="text-ink-soft">{k}</dt><dd className="font-medium">{v || '-'}</dd></div>)}
        </dl>
      )}
    </Modal>
  );
}

function StudentFees() {
  const { data, loading, reload } = useFetch('/fees');
  const [pay, setPay] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { const { data: f } = await api.post(`/fees/${pay._id}/pay`, { mode: 'UPI' }); toast('Payment successful'); setPay(null); setReceipt(f); reload(); }
    catch (e) { errMsg(e); } finally { setBusy(false); }
  };
  if (loading) return <Loading />;
  const now = new Date();
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Due" value={inr(data.totals.pending)} tone={data.totals.pending ? 'warn' : ''} />
        <Stat label="Paid" value={inr(data.totals.paid)} />
      </div>
      <Card pad={false}>
        <Table rows={data.items} empty="No fees assigned" columns={[
          { label: 'Fee', render: (f) => <><p className="font-medium">{f.title}</p><p className="text-xs text-ink-faint">{f.term}</p></> },
          { label: 'Amount', render: (f) => inr(f.amount) },
          { label: 'Due date', render: (f) => <span className={f.status === 'pending' && f.dueDate && new Date(f.dueDate) < now ? 'font-medium text-red-700' : ''}>{fmtDate(f.dueDate)}</span> },
          { label: 'Status', render: (f) => <StatusBadge status={f.status === 'pending' && f.dueDate && new Date(f.dueDate) < now ? 'overdue' : f.status} /> },
          { label: '', className: 'text-right', render: (f) => (f.status === 'paid'
            ? <Button size="sm" variant="ghost" onClick={() => setReceipt(f)}>Receipt</Button>
            : <Button size="sm" onClick={() => setPay(f)}>Pay now</Button>) },
        ]} />
      </Card>
      <Modal open={!!pay} onClose={() => setPay(null)} title="Pay fee"
        footer={<><Button variant="secondary" onClick={() => setPay(null)}>Cancel</Button><Button onClick={confirm} loading={busy}>Pay {pay && inr(pay.amount)}</Button></>}>
        {pay && <><p className="font-medium">{pay.title}</p><p className="mt-1 text-ink-soft">You will be charged {inr(pay.amount)}. A receipt is generated as soon as the payment succeeds.</p></>}
      </Modal>
      <Receipt fee={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

function OfficeFees() {
  const { user } = useAuth();
  const [status, setStatus] = useState('pending'); // pending | paid | '' (all) | deleted (admin)
  const showDeleted = status === 'deleted';
  const fees = useFetch(showDeleted ? null : '/fees', { status });
  const deleted = useFetch(showDeleted ? '/fees/deleted' : null);
  const data = showDeleted ? (deleted.data && { items: deleted.data, totals: {} }) : fees.data;
  const loading = showDeleted ? deleted.loading : fees.loading;
  const reload = () => { fees.reload(); deleted.reload(); };
  const trash = useTrash('/fees', reload);
  const [f, setF] = useState({ q: '', title: '', department: '', batch: '', section: '' });
  const setFilter = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const rows = (data?.items || []).filter((x) => matches(f.q, x.student?.name, x.student?.rollNo, x.student?.email, x.student?.phone, x.receiptNo, x.title)
    && (!f.title || x.title === f.title) && (!f.department || x.student?.department === f.department) && (!f.batch || x.student?.batch === f.batch) && (!f.section || x.student?.section === f.section));
  const remove = async (x) => {
    if (!window.confirm(`Delete "${x.title}" for ${x.student?.name}? You can restore it from the Deleted tab.`)) return;
    await deleteWithRestore('/fees', x, 'Fee deleted', reload);
  };
  const students = useFetch('/users', { role: 'student', active: 'true' });
  const courses = useFetch('/courses');
  const masters = useMasters();
  // Fee type filter: the Academic setup list plus any other titles already used
  const feeTitles = [...new Set([...masters.feeTypes, ...(data?.items || []).map((x) => x.title)])].sort();
  const [form, setForm] = useState(null);
  const [record, setRecord] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...form }; // send only the chosen target's fields
      if (form.target !== 'batch') { delete body.batch; delete body.section; } if (form.target !== 'student') delete body.student; if (form.target !== 'course') delete body.course;
      const { data: r } = await api.post('/fees', body); toast(`Fee added for ${r.created} students`); setForm(null); reload();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const recordPay = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data: paid } = await api.post(`/fees/${record._id}/record`, record);
      // The paid row leaves Outstanding and the next pending one takes its place, so confirm with the receipt.
      toast(`Payment recorded for ${record.name}. It is now under the Paid tab.`); setRecord(null); setReceipt({ ...paid, name: record.name }); reload();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };

  return (
    <>
      {data && !showDeleted && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* Totals follow the search and filters, not just the tab */}
          <Stat label={status === 'paid' ? 'Collected' : status === 'pending' ? 'Outstanding' : 'Total'} value={inr(rows.reduce((t, x) => t + x.amount, 0))} />
          <Stat label="Entries" value={rows.length} />
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={[{ value: 'pending', label: 'Outstanding' }, { value: 'paid', label: 'Paid' }, { value: '', label: 'All' }, ...(user.role === 'admin' ? [{ value: 'deleted', label: 'Deleted' }] : [])]} value={status} onChange={setStatus} />
        <Button className="mb-5" onClick={() => setForm({ target: 'batch', title: '', term: '', amount: '', dueDate: isoDate(new Date(Date.now() + 15 * 864e5)), batch: '', section: '', student: '', course: '' })}><Plus size={16} />Add fee</Button>
      </div>
      <Card pad={false}>
        <FilterBar>
          <SearchBox placeholder="Search by student, roll number, email, phone or receipt" value={f.q} onChange={setFilter('q')} />
          <FilterSelect label="Fee type" value={f.title} onChange={setFilter('title')} placeholder="All fee types" options={feeTitles} />
          <FilterSelect label="Department" value={f.department} onChange={setFilter('department')} placeholder="All departments" options={masters.departments} />
          <FilterSelect label="Batch" value={f.batch} onChange={setFilter('batch')} placeholder="All batches" options={masters.batches} />
          <FilterSelect label="Section" value={f.section} onChange={setFilter('section')} placeholder="All sections" options={masters.sections} />
          {/* Same setting as the tabs above, kept beside the other filters */}
          {!showDeleted && <FilterSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Paid and outstanding" options={[{ value: 'pending', label: 'Outstanding' }, { value: 'paid', label: 'Paid' }]} />}
        </FilterBar>
        {loading || !data ? <Loading /> : (
          <Table rows={rows} empty={showDeleted ? 'No deleted fees' : 'No fee entries match these filters'} columns={[
            { label: 'Student', render: (f) => <><p className="font-medium">{f.student?.name || <span className="text-red-700">Student account removed</span>} {f.student?.deletedAt && <span className="text-xs font-normal text-red-700">(deleted user)</span>}</p><p className="text-xs text-ink-faint">{f.student?.rollNo} {[f.student?.batch, f.student?.section].filter(Boolean).join(' / ')}</p></> },
            { label: 'Fee', key: 'title' },
            { label: 'Amount', render: (f) => inr(f.amount) },
            { label: 'Due', render: (f) => fmtDate(f.dueDate) },
            { label: 'Status', render: (f) => (f.deletedAt ? <DeletedBadge item={f} /> : <StatusBadge status={f.status} />) },
            { label: 'Paid on', render: (f) => (f.paidAt ? <>{fmtDate(f.paidAt)}<p className="text-xs text-ink-faint">{f.mode} {f.receiptNo}</p></> : '-') },
            { label: '', className: 'text-right', render: (f) => (f.deletedAt ? trash.actions(f, `"${f.title}" for ${f.student?.name}`) : f.status === 'pending' && (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="secondary" onClick={() => setRecord({ _id: f._id, title: f.title, name: f.student?.name || 'Removed student', amount: f.amount, mode: 'Cash', reference: '' })}>Record payment</Button>
                {user.role === 'admin' && <Button size="sm" variant="danger" onClick={() => remove(f)}>Delete</Button>}
              </div>)) },
          ]} />
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title="Add fee"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button form="fee-form" type="submit" loading={busy}>Add fee</Button></>}>
        {form && (
          <form id="fee-form" onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Apply to" className="sm:col-span-2"><Select value={form.target} onChange={set('target')} options={[{ value: 'batch', label: 'A batch / section' }, ...(courses.data?.length ? [{ value: 'course', label: 'Students of a course' }] : []), { value: 'student', label: 'One student' }]} /></Field>
            {form.target === 'course' ? (
              <Field label="Course" className="sm:col-span-2" hint="Every student enrolled in the course gets this fee"><Select required value={form.course} onChange={set('course')} placeholder="Choose a course" options={courses.data.map((c) => ({ value: c._id, label: `${c.code} ${c.name} (${c.studentCount} students)` }))} /></Field>
            ) : form.target === 'batch' ? (
              <><Field label="Batch"><MasterSelect required list={masters.batches} value={form.batch} onChange={set('batch')} /></Field>
                <Field label="Section" hint="Blank for all sections"><MasterSelect list={masters.sections} value={form.section} onChange={set('section')} placeholder="All sections" /></Field></>
            ) : (
              <Field label="Student" className="sm:col-span-2"><Select required value={form.student} onChange={set('student')} placeholder="Choose a student" options={(students.data || []).map((s) => ({ value: s._id, label: `${s.rollNo || ''} ${s.name}` }))} /></Field>
            )}
            {/* Fee types come from Academic setup > Fees; free text until that list has entries */}
            <Field label="Fee" className="sm:col-span-2" hint={!masters.feeTypes.length && 'Add fee types under Academic setup > Fees to choose from a list.'}>
              {masters.feeTypes.length ? <MasterSelect required list={masters.feeTypes} value={form.title} onChange={set('title')} placeholder="Choose a fee" />
                : <Input required value={form.title} onChange={set('title')} placeholder="Tuition fee - Term 2" />}
            </Field>
            <Field label="Term"><Input value={form.term} onChange={set('term')} /></Field>
            <Field label="Amount (Rs.)"><Input type="number" min={0} required value={form.amount} onChange={set('amount')} /></Field>
            <Field label="Due date"><Input type="date" required value={form.dueDate} onChange={set('dueDate')} /></Field>
          </form>
        )}
      </Modal>

      <Modal open={!!record} onClose={() => setRecord(null)} title="Record counter payment"
        footer={<><Button variant="secondary" onClick={() => setRecord(null)}>Cancel</Button><Button form="rec-form" type="submit" loading={busy}>Record payment</Button></>}>
        {record && (
          <form id="rec-form" onSubmit={recordPay} className="space-y-4">
            <p>{record.name}: {record.title}, <b>{inr(record.amount)}</b></p>
            <Field label="Mode"><Select value={record.mode} onChange={(e) => setRecord({ ...record, mode: e.target.value })} options={['Cash', 'Cheque', 'DD', 'Bank transfer', 'UPI']} /></Field>
            <Field label="Reference number" hint="Cheque, DD or UTR number"><Input value={record.reference} onChange={(e) => setRecord({ ...record, reference: e.target.value })} /></Field>
          </form>
        )}
      </Modal>
      <Receipt fee={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

export default function Fees() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Fees" subtitle={user.role === 'student' ? 'Fee dues, online payment and receipts.' : 'Assign fees, track dues and record payments.'} />
      {user.role === 'student' ? <StudentFees /> : <OfficeFees />}
    </>
  );
}
