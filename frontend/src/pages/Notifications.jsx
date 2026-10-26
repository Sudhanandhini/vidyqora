import api from '../api';
import { Link } from 'react-router-dom';
import { useFetch, usePaged, Pagination, PageHeader, Card, Button, Loading, Empty, fmtDateTime, errMsg } from '../components/ui';

export default function Notifications() {
  const { data, loading, reload, setData } = useFetch('/notifications', { limit: 100 });
  const paged = usePaged(data?.items);
  const read = async (n) => {
    if (n.read) return;
    setData((d) => ({ unread: d.unread - 1, items: d.items.map((x) => (x._id === n._id ? { ...x, read: true } : x)) }));
    api.put(`/notifications/${n._id}/read`).catch(errMsg);
  };
  const readAll = async () => { try { await api.put('/notifications/read-all'); reload(); } catch (e) { errMsg(e); } };

  return (
    <>
      <PageHeader title="Messages and notifications" subtitle={data ? `${data.unread} unread` : ''}
        actions={data?.unread > 0 && <Button variant="secondary" onClick={readAll}>Mark all as read</Button>} />
      <Card pad={false}>
        {loading ? <Loading /> : !data.items.length ? <Empty title="No notifications yet" hint="Alerts about attendance, assignments, results and fees show up here." /> : (
          <ul className="divide-y divide-primary-50">
            {paged.items.map((n) => (
              <li key={n._id} onClick={() => read(n)} className={`flex gap-4 px-5 py-3.5 ${n.read ? '' : 'bg-sand-50'}`}>
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-sand-400'}`} />
                <div className="min-w-0 flex-1">
                  <p className={n.read ? 'text-ink' : 'font-semibold text-primary'}>{n.title}</p>
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
