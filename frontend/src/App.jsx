import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/Users';
import Courses from './pages/Courses';
import Attendance from './pages/Attendance';
import Assignments from './pages/Assignments';
import Marks from './pages/Marks';
import Calendar from './pages/Calendar';
import Messaging from './pages/Messaging';
import Notifications from './pages/Notifications';
import Fees from './pages/Fees';
import Requests from './pages/Requests';
import Reports from './pages/Reports';
import Profile from './pages/Profile';

function Guard({ roles, children }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) {
    return <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Guard roles={['admin']}><UsersPage /></Guard>} />
        <Route path="courses" element={<Guard roles={['admin', 'faculty', 'student']}><Courses /></Guard>} />
        <Route path="attendance" element={<Guard roles={['faculty', 'student']}><Attendance /></Guard>} />
        <Route path="assignments" element={<Guard roles={['faculty', 'student']}><Assignments /></Guard>} />
        <Route path="marks" element={<Guard roles={['faculty', 'student']}><Marks /></Guard>} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="messaging" element={<Guard roles={['admin', 'staff', 'faculty']}><Messaging /></Guard>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="fees" element={<Guard roles={['admin', 'staff', 'student']}><Fees /></Guard>} />
        <Route path="requests" element={<Guard roles={['admin', 'staff', 'student']}><Requests /></Guard>} />
        <Route path="reports" element={<Reports />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
