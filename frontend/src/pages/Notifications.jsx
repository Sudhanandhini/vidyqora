import { useState } from 'react';
import api from '../api';
import { Link } from 'react-router-dom';
import { useFetch, usePaged, Pagination, PageHeader, Card, Button, Loading, Empty, Tabs, fmtDateTime, errMsg } from '../components/ui';

export default function Notifications() {
  const { data, loading, reload, setData } = useFetch('/notifications', { limit: 100 });
  const [tab, setTab] = useState('unread');
  // Items read during this visit stay in the Unread tab (shown as read) so the list doesn't jump.
  const [justRead, setJustRead] = useState([]);
  const items = (data?.items || []).filter((n) => tab === 'all' || !n.read || justRead.includes(n._id));
  const paged = usePaged(items);
  // Lets the header bell and sidebar badge refresh straight away instead of on the next poll.
  const changed = () => window.dispatchEvent(new Event('notifications:changed'));
  const read = async (n) => {
    if (n.read) return;
    setJustRead((j) => [...j, n._id]);
    setData((d) => ({ unread: d.unread - 1, items: d.items.map((x) => (x._id === n._id ? { ...x, read: true } : x)) }));
    api.put(`/notifications/${n._id}/read`).then(changed).catch(errMsg);
  };
  const readAll = async () => { try { await api.put('/notifications/read-all'); setJustRead(data.items.filter((n) => !n.read).map((n) => n._id)); reload(); changed(); } catch (e) { errMsg(e); } };

  return (
    <>
      <PageHeader title="Messages and notifications" subtitle={data ? `${data.unread} unread` : ''}
        actions={data?.unread > 0 && <Button variant="secondary" onClick={readAll}>Mark all as read</Button>} />
      <Tabs tabs={[{ value: 'unread', label: `Unread${data?.unread ? ` (${data.unread})` : ''}` }, { value: 'all', label: 'All notifications' }]} value={tab} onChange={(t) => { setTab(t); setJustRead([]); }} />
      <Card pad={false}>
        {loading ? <Loading /> : !items.length ? (tab === 'unread' && data.items.length
          ? <Empty title="You're all caught up" hint="No unread messages or notifications." action={<Button variant="secondary" onClick={() => setTab('all')}>View all notifications</Button>} />
          : <Empty title="No notifications yet" hint="Alerts about attendance, assignments, results and fees show up here." />) : (
          <ul className="divide-y divide-primary-50">
            {paged.items.map((n) => (
              <li key={n._id} onClick={() => read(n)} className={`flex cursor-pointer gap-4 px-5 py-3.5 ${n.read ? '' : 'bg-sand-50'}`} title={n.read ? undefined : 'Click to mark as read'}>
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-sand-400'}`} />
                <div className="min-w-0 flex-1">
                  <p className={n.read ? 'text-ink' : 'font-semibold text-primary'}>{n.title}{!n.read && <span className="ml-2 rounded bg-sand-400 px-1.5 py-0.5 align-middle text-[10.5px] font-bold uppercase tracking-wide text-primary">Unread</span>}</p>
                  {n.from && <p className="text-xs font-medium text-primary-500">From {n.from.name}</p>}
                  {n.body && <p className="whitespace-pre-wrap text-sm text-ink-soft">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-ink-faint">{fmtDateTime(n.createdAt)}</p>
                </div>
                {n.link && <Link to={n.link} onClick={() => read(n)} className="self-center text-sm font-medium text-primary-500 hover:underline">Open</Link>}
              </li>
            ))}
          </ul>
        )}
        {!loading && <Pagination paged={paged} />}
      </Card>
    </>
  );
}
