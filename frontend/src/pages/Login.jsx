import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Input } from '../components/ui';
import { Wordmark } from '../components/Layout';

const DEMO = [
  ['Admin', 'admin@vidyqora.edu', 'Admin@123'],
  ['Faculty', 'meera@vidyqora.edu', 'Faculty@123'],
  ['Student', 'student@vidyqora.edu', 'Student@123'],
  ['Office', 'staff@vidyqora.edu', 'Staff@123'],
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(form.email, form.password); nav('/', { replace: true }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-primary px-14 py-12 text-primary-100 lg:flex lg:flex-col">
        <div className="absolute inset-y-0 right-0 w-[3px] bg-sand" />
        <div className="absolute -right-24 top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full border border-primary-500/60" />
        <div className="absolute -right-10 top-1/2 h-[360px] w-[360px] -translate-y-1/2 rounded-full border border-sand/30" />
        <Wordmark light />
        <div className="relative mt-auto max-w-md">
          <p className="font-serif text-[40px] font-semibold leading-[1.12] text-white">
            Every class, record and notice of your campus in one place.
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-primary-200">
            Faculty mark attendance and evaluate work. Students submit assignments, check results and pay fees. The office runs calendars, messages and reports.
          </p>
        </div>
        <p className="relative mt-10 text-xs text-primary-300">Manithas Technology Pvt Ltd</p>
      </div>

      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Wordmark /></div>
          <h1 className="text-[28px] font-semibold">Sign in</h1>
          <p className="mt-1 text-ink-soft">Use the email registered with your institution.</p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
            <Button type="submit" loading={busy} className="w-full py-2.5">Sign in</Button>
          </form>
          <div className="mt-8 border-t border-primary-100 pt-5">
            <p className="text-[13px] text-ink-soft">Demo accounts (after running the seed script)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMO.map(([l, email, password]) => (
                <button key={l} type="button" onClick={() => setForm({ email, password })}
                  className="rounded-md bg-sand-50 px-3 py-1.5 text-[13px] font-medium text-primary ring-1 ring-sand-200 hover:bg-sand-100">{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
