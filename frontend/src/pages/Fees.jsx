import { useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useFetch, PageHeader, Card, Table, Button, Modal, Field, Input, Select, Tabs, Loading, Stat, StatusBadge, fmtDate, fmtDateTime, inr, isoDate, toast, errMsg } from '../components/ui';

function Receipt({ fee, onClose }) {
  return (
    <Modal open={!!fee} onClose={onClose} title="Payment receipt" footer={<Button variant="secondary" onClick={() => window.print()}>Print</Button>}>
      {fee && (
        <dl className="divide-y divide-primary-50">
          {[['Receipt number', fee.receiptNo], ['Fee', fee.title], ['Amount', inr(fee.amount)], ['Paid on', fmtDateTime(fee.paidAt)], ['Mode', fee.mode], ['Transaction', fee.txnId]]
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
  const [status, setStatus] = useState('pending');
  const { data, loading, reload } = useFetch('/fees', { status });
  const students = useFetch('/users', { role: 'student', active: 'true' });
  const [form, setForm] = useState(null);
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...form }; if (form.target === 'student') { delete body.batch; delete body.section; } else delete body.student;
      const { data: r } = await api.post('/fees', body); toast(`Fee added for ${r.created} students`); setForm(null); reload();
    } catch (err) { errMsg(err); } finally { setBusy(false); }
  };
  const recordPay = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post(`/fees/${record._id}/record`, record); toast('Payment recorded'); setRecord(null); reload(); } catch (err) { errMsg(err); } finally { setBusy(false); }
  };

  return (
    <>
      {data && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={status === 'paid' ? 'Collected' : status === 'pending' ? 'Outstanding' : 'Total'} value={inr((data.totals.paid || 0) + (data.totals.pending || 0))} />
          <Stat label="Entries" value={data.items.length} />
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={[{ value: 'pending', label: 'Outstanding' }, { value: 'paid', label: 'Paid' }, { value: '', label: 'All' }]} value={status} onChange={setStatus} />
        <Button className="mb-5" onClick={() => setForm({ target: 'batch', title: '', term: '', amount: '', dueDate: isoDate(new Date(Date.now() + 15 * 864e5)), batch: '', section: '', student: '' })}><Plus size={16} />Add fee</Button>
      </div>
      <Card pad={false}>
        {loading ? <Loading /> : (
          <Table rows={data.items} empty="No fee entries" columns={[
            { label: 'Student', render: (f) => <><p className="font-medium">{f.student?.name}</p><p className="text-xs text-ink-faint">{f.student?.rollNo} {[f.student?.batch, f.student?.section].filter(Boolean).join(' / ')}</p></> },
            { label: 'Fee', key: 'title' },
            { label: 'Amount', render: (f) => inr(f.amount) },
            { label: 'Due', render: (f) => fmtDate(f.dueDate) },
            { label: 'Status', render: (f) => <StatusBadge status={f.status} /> },
            { label: 'Paid on', render: (f) => (f.paidAt ? <>{fmtDate(f.paidAt)}<p className="text-xs text-ink-faint">{f.mode} {f.receiptNo}</p></> : '-') },
            { label: '', className: 'text-right', render: (f) => f.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => setRecord({ _id: f._id, title: f.title, name: f.student?.name, amount: f.amount, mode: 'Cash', reference: '' })}>Record payment</Button> },
          ]} />
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title="Add fee"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button form="fee-form" type="submit" loading={busy}>Add fee</Button></>}>
        {form && (
          <form id="fee-form" onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Apply to" className="sm:col-span-2"><Select value={form.target} onChange={set('target')} options={[{ value: 'batch', label: 'A batch / section' }, { value: 'student', label: 'One student' }]} /></Field>
            {form.target === 'batch' ? (
              <><Field label="Batch"><Input required value={form.batch} onChange={set('batch')} placeholder="2024" /></Field>
                <Field label="Section" hint="Blank for all sections"><Input value={form.section} onChange={set('section')} /></Field></>
            ) : (
              <Field label="Student" className="sm:col-span-2"><Select required value={form.student} onChange={set('student')} placeholder="Choose a student" options={(students.data || []).map((s) => ({ value: s._id, label: `${s.rollNo || ''} ${s.name}` }))} /></Field>
            )}
            <Field label="Fee title" className="sm:col-span-2"><Input required value={form.title} onChange={set('title')} placeholder="Tuition fee - Term 2" /></Field>
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
