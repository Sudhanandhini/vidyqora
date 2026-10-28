import { Plus, X } from 'lucide-react';
import api from '../api';
import { Button, Input, MasterSelect, StatusBadge, inr, isoDate } from './ui';

export const newFeeRow = () => ({ title: '', term: '', amount: '', dueDate: isoDate(new Date(Date.now() + 15 * 864e5)) });

/**
 * "Assign fees" block for the student and course forms: rows of fee type, term, amount and due date.
 * Nothing is saved here; the form calls assignFees() after its own save succeeds.
 * `existing` (optional) lists fees the student already has, so the same one isn't added twice.
 */
export function FeeAssign({ rows, onChange, feeTypes = [], hint, existing }) {
  const setRow = (i, k) => (e) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  return (
    <fieldset className="rounded-md border border-primary-100 p-3 sm:col-span-2">
      <legend className="px-1 text-[13px] font-semibold text-primary">Assign fees</legend>
      {existing?.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium text-ink-soft">Already assigned</p>
          <ul className="flex flex-wrap gap-1.5">
            {existing.map((f) => <li key={f._id} className="flex items-center gap-1.5 rounded bg-canvas px-2 py-1 text-xs">{f.title}{f.term && ` · ${f.term}`} · {inr(f.amount)} <StatusBadge status={f.status} /></li>)}
          </ul>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="mb-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.6fr_1fr_1fr_1.2fr_auto]">
          <label className="col-span-2 text-xs text-ink-soft sm:col-span-1">Fee
            {feeTypes.length ? <MasterSelect required list={feeTypes} value={r.title} onChange={setRow(i, 'title')} placeholder="Choose a fee" />
              : <Input required value={r.title} onChange={setRow(i, 'title')} placeholder="Tuition fee" />}
          </label>
          <label className="text-xs text-ink-soft">Term<Input value={r.term} onChange={setRow(i, 'term')} placeholder="Term 1" /></label>
          <label className="text-xs text-ink-soft">Amount (Rs.)<Input type="number" min={0} required value={r.amount} onChange={setRow(i, 'amount')} /></label>
          <label className="text-xs text-ink-soft">Due date<Input type="date" required value={r.dueDate} onChange={setRow(i, 'dueDate')} /></label>
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="mb-2 justify-self-end text-ink-faint hover:text-red-700" aria-label="Remove fee"><X size={16} /></button>
        </div>
      ))}
      <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...rows, newFeeRow()])}><Plus size={14} />Add fee</Button>
      <p className="mt-2 text-xs text-ink-faint">{hint}{!feeTypes.length && ' Add fee types under Academic setup > Fees to choose from a list.'}</p>
    </fieldset>
  );
}

/** Creates the rows for `target` ({ student } or { course }); returns the server's { created, skipped, students }. */
export async function assignFees(target, rows) {
  if (!rows?.length) return { created: 0, skipped: 0, students: 0 };
  return (await api.post('/fees/assign', { ...target, fees: rows })).data;
}

/** Toast-ready summary, e.g. " 2 fees assigned." */
export const feeNote = (r) => (!r.created && !r.skipped ? '' : ` ${r.created} fee${r.created === 1 ? '' : 's'} assigned${r.skipped ? `, ${r.skipped} skipped (already assigned)` : ''}.`);
