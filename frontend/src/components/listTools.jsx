import { useState } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import api from '../api';
import { useFetch, Button, Modal, Input, Select, Table, Badge, Loading, fmtDateTime, toast, errMsg } from './ui';

// Same rules as the User model: 10-digit phone; names with letters, spaces and dots only.
export const PhoneInput = ({ onChange, ...p }) => (
  <Input {...p} inputMode="numeric" maxLength={10} pattern="\d{10}" title="Enter a 10 digit phone number"
    onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, ''); onChange(e); }} />
);
export const NAME_PATTERN = { pattern: '[A-Za-z][A-Za-z. ]*', title: 'Only letters, spaces and dots' };

/** Case-insensitive "does any of these values contain q" for client-side list filters. */
export const matches = (q, ...values) => !q.trim() || values.some((v) => v != null && String(v).toLowerCase().includes(q.trim().toLowerCase()));

/** Row of search box + dropdown filters above a table. */
export const FilterBar = ({ children }) => <div className="flex flex-wrap items-center gap-2 border-b border-primary-50 p-4">{children}</div>;
export const SearchBox = (p) => <Input type="search" className="!w-auto min-w-[16rem] flex-1 sm:max-w-md" {...p} />;
export const FilterSelect = ({ label, ...p }) => <Select aria-label={label} className="!w-auto max-w-full" {...p} />;

export const ACTIVE_OPTIONS = [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }, { value: 'deleted', label: 'Deleted' }];

export const DeletedBadge = ({ item }) => (
  <span title={item.deletedAt ? `Deleted ${fmtDateTime(item.deletedAt)}${item.deletedBy?.name ? ` by ${item.deletedBy.name}` : ''}` : undefined}>
    <Badge tone="red">Deleted</Badge>
  </span>
);

/**
 * Soft-delete an item and show a toast with a Restore button that undoes it.
 * Returns false if the request failed. `onChange` refreshes the page after delete and after restore.
 */
export async function deleteWithRestore(base, item, message, onChange) {
  try {
    await api.delete(`${base}/${item._id}`);
  } catch (e) { errMsg(e); return false; }
  onChange?.();
  toast(message, 'ok', {
    label: 'Restore',
    onClick: async () => {
      try { await api.post(`${base}/${item._id}/restore`); toast('Restored'); onChange?.(); } catch (e) { errMsg(e); }
    },
  });
  return true;
}

/**
 * Restore / permanent delete for soft-deleted items at <base>/<id>/restore and <base>/<id>/permanent.
 * Returns the actions plus a ready-made button pair for a table row.
 */
export function useTrash(base, onDone) {
  const [busy, setBusy] = useState(null);
  const run = async (item, fn, msg) => {
    setBusy(item._id);
    try { await fn(); toast(msg); onDone?.(); } catch (e) { errMsg(e); } finally { setBusy(null); }
  };
  const restore = (item) => run(item, () => api.post(`${base}/${item._id}/restore`), 'Restored');
  const purge = (item, name = 'this item') => {
    if (!window.confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    run(item, () => api.delete(`${base}/${item._id}/permanent`), 'Deleted permanently');
  };
  const actions = (item, name) => (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="secondary" disabled={busy === item._id} onClick={() => restore(item)}><RotateCcw size={14} />Restore</Button>
      <Button size="sm" variant="danger" disabled={busy === item._id} onClick={() => purge(item, name)}>Delete permanently</Button>
    </div>
  );
  return { restore, purge, actions };
}

/**
 * "Deleted" button + modal listing soft-deleted items from GET <base>/deleted, each with Restore
 * and Delete permanently. `label(item)` renders the item; `onRestored` refreshes the page list.
 */
export function DeletedItems({ base, params, label, name = () => undefined, onRestored, title = 'Deleted items' }) {
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useFetch(open ? `${base}/deleted` : null, params);
  const trash = useTrash(base, () => { reload(); onRestored?.(); });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Trash2 size={15} />Deleted</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide>
        {loading ? <Loading /> : (
          <Table rows={data} empty="Nothing deleted" columns={[
            { label: 'Item', render: label },
            { label: 'Deleted', render: (d) => <>{fmtDateTime(d.deletedAt)}<p className="text-xs text-ink-faint">{d.deletedBy?.name}</p></> },
            { label: '', className: 'text-right', render: (d) => trash.actions(d, name(d)) },
          ]} />
        )}
      </Modal>
    </>
  );
}
