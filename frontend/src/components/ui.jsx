import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api';

/* ---------- data hook ---------- */
export function useFetch(url, params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState(null);
  const key = JSON.stringify(params || {});
  const load = useCallback(async () => {
    if (!url) { setData(null); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setData((await api.get(url, { params })).data); } catch (e) { setError(e.message); } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}

/* ---------- toast ---------- */
// `action` = { label, onClick } adds a button to the toast (e.g. Restore after a delete).
export const toast = (message, tone = 'ok', action) => window.dispatchEvent(new CustomEvent('vq-toast', { detail: { message, tone, action } }));
export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const id = Math.random();
      setItems((x) => [...x, { id, ...e.detail }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), e.detail.action ? 8000 : 3800);
    };
    window.addEventListener('vq-toast', on);
    return () => window.removeEventListener('vq-toast', on);
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`flex items-center justify-between gap-3 rounded-md border-l-4 bg-white px-4 py-3 text-sm shadow-lg ${t.tone === 'error' ? 'border-red-600 text-red-800' : 'border-sand-400 text-primary'}`}>
          <span>{t.message}</span>
          {t.action && (
            <button className="shrink-0 rounded px-2 py-1 font-semibold text-primary underline-offset-2 hover:bg-primary-50 hover:underline"
              onClick={() => { setItems((x) => x.filter((i) => i.id !== t.id)); t.action.onClick(); }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- primitives ---------- */
const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-600',
  sand: 'bg-sand text-primary hover:bg-sand-400',
  secondary: 'bg-white text-primary ring-1 ring-primary-200 hover:bg-primary-50',
  ghost: 'text-primary hover:bg-primary-50',
  danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
};
export function Button({ variant = 'primary', size = 'md', loading, className = '', children, ...p }) {
  const sz = size === 'sm' ? 'px-2.5 py-1.5 text-[13px]' : 'px-4 py-2 text-[14px]';
  return (
    <button {...p} disabled={loading || p.disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${VARIANTS[variant]} ${className}`}>
      {loading && <Loader2 size={15} className="animate-spin" />}{children}
    </button>
  );
}

export const Field = ({ label, hint, children, className = '' }) => (
  <label className={`block ${className}`}><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}</label>
);
export const Input = (p) => <input {...p} className={`field ${p.className || ''}`} />;
export const Textarea = (p) => <textarea rows={4} {...p} className={`field ${p.className || ''}`} />;
export const Select = ({ options = [], placeholder, ...p }) => (
  <select {...p} className={`field ${p.className || ''}`}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
  </select>
);

// Level / department / program / batch / section / semester lists managed by admin under Academic setup.
export const useMasters = () => useFetch('/masters').data || { levels: [], departments: [], programs: [], batches: [], sections: [], semesters: [], feeTypes: [] };
// Dropdown over a master list; keeps an existing value selectable even if it was removed from the list.
export const MasterSelect = ({ list = [], value, placeholder = 'Select', ...p }) => (
  <Select {...p} value={value || ''} placeholder={placeholder} options={value && !list.includes(value) ? [value, ...list] : list} />
);

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-primary-100 pb-4">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', pad = true }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-primary-50 px-5 py-3">
          {title && <h2 className="text-[17px] font-semibold">{title}</h2>}{actions}
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200', red: 'bg-red-50 text-red-800 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200', blue: 'bg-primary-50 text-primary ring-primary-100',
  sand: 'bg-sand-100 text-sand-600 ring-sand-200', grey: 'bg-canvas text-ink-soft ring-primary-100',
};
export const Badge = ({ tone = 'grey', children }) => (
  <span className={`inline-flex items-center rounded px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>
);
const STATUS_TONE = { paid: 'green', evaluated: 'green', sent: 'green', completed: 'green', approved: 'green', published: 'green', verified: 'blue',
  pending: 'amber', submitted: 'blue', scheduled: 'sand', draft: 'grey', resubmit: 'amber', rejected: 'red', failed: 'red', overdue: 'red', missing: 'red' };
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] || 'grey'}>{status?.[0]?.toUpperCase() + status?.slice(1)}</Badge>;

/* ---------- pagination ---------- */
const PAGE_SIZES = [10, 25, 50, 100];

/** Client-side paging. Jumps back to page 1 when the list changes (new search/filter), stays put when rows are only removed. */
export function usePaged(rows, keyOf = (r) => r?._id, initialSize = PAGE_SIZES[0]) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialSize);
  const total = rows?.length || 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const first = total ? keyOf(rows[0], 0) : null;
  useEffect(() => { setPage(0); }, [first]);
  const p = Math.min(page, pages - 1);
  const offset = p * size;
  return {
    items: (rows || []).slice(offset, offset + size), offset, page: p, pages, size, total,
    setPage, setSize: (n) => { setSize(n); setPage(0); },
  };
}

const pageList = (page, pages) => {
  const out = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) out.push(i);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
};

export function Pagination({ paged, className = '' }) {
  const { page, pages, size, total, offset, setPage, setSize } = paged;
  if (total <= PAGE_SIZES[0]) return null;
  const btn = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] disabled:opacity-40';
  return (
    <nav aria-label="Pagination" className={`flex flex-wrap items-center justify-between gap-3 border-t border-primary-50 px-4 py-3 text-[13px] text-ink-soft ${className}`}>
      <div className="flex items-center gap-3">
        <span>Showing <b className="text-primary">{offset + 1}–{Math.min(offset + size, total)}</b> of <b className="text-primary">{total}</b></span>
        <label className="flex items-center gap-1.5">Rows
          <select className="field !w-auto !py-1" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button className={`${btn} hover:bg-primary-50`} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
          {pageList(page, pages).map((n, i) => (n === '…'
            ? <span key={`e${i}`} className="px-1">…</span>
            : <button key={n} onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}
              className={`${btn} ${n === page ? 'bg-primary font-semibold text-white' : 'text-primary hover:bg-primary-50'}`}>{n + 1}</button>))}
          <button className={`${btn} hover:bg-primary-50`} disabled={page === pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
        </div>
      )}
    </nav>
  );
}

export function Table({ columns, rows, empty = 'Nothing to show yet', rowKey = (r) => r._id }) {
  const paged = usePaged(rows, rowKey);
  if (!rows?.length) return <Empty title={empty} />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="tbl w-full min-w-[560px] border-collapse text-[14px]">
          <thead><tr>{columns.map((c) => <th key={c.key || c.label} className={c.className}>{c.label}</th>)}</tr></thead>
          <tbody>
            {paged.items.map((r, j) => {
              const i = paged.offset + j;
              return <tr key={rowKey(r, i)}>{columns.map((c) => <td key={c.key || c.label} className={c.className}>{c.render ? c.render(r, i) : r[c.key]}</td>)}</tr>;
            })}
          </tbody>
        </table>
      </div>
      <Pagination paged={paged} />
    </>
  );
}

export const Empty = ({ title, hint, action }) => (
  <div className="flex flex-col items-center px-4 py-10 text-center">
    <div className="mb-3 h-px w-10 bg-sand-300" />
    <p className="font-medium text-primary">{title}</p>
    {hint && <p className="mt-1 max-w-sm text-sm text-ink-soft">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Loading = () => <div className="flex justify-center py-12 text-primary-300"><Loader2 className="animate-spin" /></div>;

export function Modal({ open, onClose, title, children, footer, wide }) {
  const ref = useRef(null);
  // Callers pass inline onClose arrows; keep the latest in a ref so typing (re-render) doesn't re-run the focus effect.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', k);
    // Focus the first field in the body, not the header's close button.
    (ref.current?.querySelector('[data-modal-body] :is(input,select,textarea)') || ref.current?.querySelector('input,select,textarea,button'))?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-primary-900/50 p-3 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b-2 border-sand-300 px-5 py-3.5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-soft hover:bg-canvas" aria-label="Close"><X size={18} /></button>
        </div>
        <div data-modal-body className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-primary-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, note, tone }) {
  return (
    <div className="border-l-2 border-sand-300 bg-white px-4 py-3 shadow-panel">
      <p className="text-[13px] text-ink-soft">{label}</p>
      <p className={`mt-0.5 font-serif text-[26px] font-semibold leading-tight ${tone === 'warn' ? 'text-red-700' : 'text-primary'}`}>{value ?? '-'}</p>
      {note && <p className="text-xs text-ink-faint">{note}</p>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-primary-100" role="tablist">
      {tabs.map((t) => {
        const v = t.value ?? t;
        return (
          <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[14px] font-medium ${value === v ? 'border-sand-400 text-primary' : 'border-transparent text-ink-soft hover:text-primary'}`}>
            {t.label ?? t}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- formatting ---------- */
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const inr = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
export const isoDate = (d = new Date()) => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const errMsg = (e) => toast(e.message || 'Something went wrong', 'error');
