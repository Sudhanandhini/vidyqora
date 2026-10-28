import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, BookOpen, CalendarCheck, ClipboardList, GraduationCap, CalendarDays,
  Send, Wallet, FileQuestion, FileSpreadsheet, Bell, Menu, X, LogOut, UserCircle, Settings2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const NAV = {
  admin: [
    ['/', 'Dashboard', LayoutDashboard], ['/users', 'Users', Users], ['/courses', 'Courses', BookOpen], ['/setup', 'Academic setup', Settings2],
    ['/calendar', 'Calendar', CalendarDays], ['/messaging', 'Messaging', Send], ['/fees', 'Fees', Wallet],
    ['/requests', 'Requests', FileQuestion], ['/reports', 'Reports', FileSpreadsheet],
  ],
  staff: [
    ['/', 'Dashboard', LayoutDashboard], ['/fees', 'Fees', Wallet], ['/requests', 'Requests', FileQuestion],
    ['/calendar', 'Calendar', CalendarDays], ['/messaging', 'Messaging', Send], ['/reports', 'Reports', FileSpreadsheet],
  ],
  faculty: [
    ['/', 'Dashboard', LayoutDashboard], ['/courses', 'My courses', BookOpen], ['/users', 'Students', Users], ['/attendance', 'Attendance', CalendarCheck],
    ['/assignments', 'Assignments', ClipboardList], ['/marks', 'Marks', GraduationCap], ['/calendar', 'Calendar', CalendarDays],
    ['/messaging', 'Messaging', Send], ['/reports', 'Reports', FileSpreadsheet],
  ],
  student: [
    ['/', 'Dashboard', LayoutDashboard], ['/courses', 'My courses', BookOpen], ['/attendance', 'Attendance', CalendarCheck],
    ['/assignments', 'Assignments', ClipboardList], ['/marks', 'Results', GraduationCap], ['/calendar', 'Calendar', CalendarDays],
    ['/fees', 'Fees', Wallet], ['/requests', 'Requests', FileQuestion], ['/notifications', 'Messages', Bell], ['/reports', 'Downloads', FileSpreadsheet],
  ],
};
const ROLE_LABEL = { admin: 'Administrator', staff: 'Office staff', faculty: 'Faculty', student: 'Student' };

export function Wordmark({ light }) {
  return (
    <span className={`font-serif text-[22px] font-semibold tracking-tight ${light ? 'text-white' : 'text-primary'}`}>
      Vidyq<span className="text-sand">o</span>ra
    </span>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const loc = useLocation();

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    let alive = true;
    const poll = () => api.get('/notifications', { params: { limit: 1 } }).then((r) => alive && setUnread(r.data.unread)).catch(() => {});
    poll();
    const t = setInterval(poll, 60000);
    window.addEventListener('notifications:changed', poll);
    return () => { alive = false; clearInterval(t); window.removeEventListener('notifications:changed', poll); };
  }, [loc.pathname]);

  const links = NAV[user.role] || [];
  return (
    <div className="min-h-screen lg:flex">
      <aside className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col bg-primary text-primary-100 transition-transform lg:sticky lg:top-0 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 pb-5 pt-6">
          <Link to="/"><Wordmark light /></Link>
          <button className="text-primary-200 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <p className="mx-6 mb-3 border-t border-primary-600 pt-3 text-xs text-primary-300">{ROLE_LABEL[user.role]}</p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {links.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => `flex items-center gap-3 rounded-md border-l-[3px] px-3 py-2 text-[14px] ${isActive
                ? 'border-sand bg-primary-600 font-medium text-white' : 'border-transparent text-primary-200 hover:bg-primary-600/60 hover:text-white'}`}>
              <Icon size={17} strokeWidth={1.8} />{label}
              {to === '/notifications' && unread > 0 && <span className="ml-auto min-w-[20px] rounded-full bg-sand px-1.5 text-center text-[11px] font-bold leading-5 text-primary">{unread > 99 ? '99+' : unread}</span>}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="mx-3 mb-4 flex items-center gap-3 rounded-md px-3 py-2 text-[14px] text-primary-200 hover:bg-primary-600/60 hover:text-white">
          <LogOut size={17} strokeWidth={1.8} />Sign out
        </button>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-primary-900/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-primary-100 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button className="text-primary lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1">
            <Link to="/notifications" className="relative rounded-md p-2 text-primary hover:bg-primary-50" aria-label={`Notifications, ${unread} unread`}>
              <Bell size={19} />
              {unread > 0 && <span className="absolute right-1 top-1 min-w-[17px] rounded-full bg-sand px-1 text-center text-[10.5px] font-bold leading-[17px] text-primary">{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <Link to="/profile" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-primary-50">
              <UserCircle size={22} className="text-primary-400" />
              <span className="hidden text-left sm:block">
                <span className="block text-[13.5px] font-medium leading-tight text-primary">{user.name}</span>
                <span className="block text-[11.5px] leading-tight text-ink-faint">{user.rollNo || user.employeeId || user.email}</span>
              </span>
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8"><Outlet /></main>
      </div>
    </div>
  );
}
