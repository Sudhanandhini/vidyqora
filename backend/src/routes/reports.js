import { Router } from 'express';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Attendance, { PRESENT_CODES } from '../models/Attendance.js';
import Assignment, { Submission } from '../models/Assignment.js';
import Assessment from '../models/Assessment.js';
import Fee from '../models/Fee.js';
import Event, { audiencesFor } from '../models/Event.js';
import Request from '../models/Request.js';
import { Message } from '../models/Messaging.js';
import { ah, HttpError } from '../middleware/auth.js';
import { courseFor } from '../utils/access.js';
import { sendExcel, fmtDate } from '../utils/excel.js';

const r = Router();
const range = (q) => {
  const f = {};
  if (q.from) f.$gte = new Date(q.from);
  if (q.to) { const t = new Date(q.to); t.setHours(23, 59, 59, 999); f.$lte = t; }
  return Object.keys(f).length ? f : null;
};

// Which reports each role can run
const ACCESS = {
  'attendance-register': ['admin', 'faculty'],
  'assignment-status': ['admin', 'faculty'],
  'marks': ['admin', 'faculty'],
  'class-performance': ['admin', 'faculty'],
  'my-attendance': ['student'],
  'my-results': ['student'],
  'fee-collection': ['admin', 'staff'],
  'fee-dues': ['admin', 'staff'],
  'messages-sent': ['admin', 'staff', 'faculty'],
  'calendar': ['admin', 'staff', 'faculty', 'student'],
  'holidays': ['admin', 'staff', 'faculty', 'student'],
  'requests': ['admin', 'staff'],
  'users': ['admin'],
};

const handlers = {
  async 'attendance-register'(req, res) {
    const c = await courseFor(req.user, req.query.course, { populate: true });
    const f = { course: c._id }; const dr = range(req.query); if (dr) f.date = dr;
    const sheets = await Attendance.find(f).sort({ date: 1, period: 1 }).lean();
    const cols = sheets.map((s, i) => ({ header: `${fmtDate(s.date)} P${s.period}`, key: `s${i}`, width: 11 }));
    const rows = c.students.map((st) => {
      const row = { roll: st.rollNo, name: st.name }; let p = 0, t = 0;
      sheets.forEach((s, i) => {
        const rec = s.records.find((x) => String(x.student) === String(st._id));
        row[`s${i}`] = rec?.status || '';
        if (rec) { t++; if (PRESENT_CODES.includes(rec.status)) p++; }
      });
      return { ...row, present: p, total: t, pct: t ? Math.round((p / t) * 100) : '' };
    });
    return { filename: `attendance-${c.code}`, title: `Attendance Register - ${c.code} ${c.name}`, filters: dateLabel(req.query),
      columns: [{ header: 'Roll No', key: 'roll', width: 12 }, { header: 'Name', key: 'name', width: 26 }, ...cols,
        { header: 'Present', key: 'present', width: 9 }, { header: 'Total', key: 'total', width: 9 }, { header: '%', key: 'pct', width: 7 }], rows };
  },

  async 'assignment-status'(req, res) {
    const c = await courseFor(req.user, req.query.course, { populate: true });
    const asg = await Assignment.find({ course: c._id }).sort({ dueDate: 1 }).lean();
    const subs = await Submission.find({ assignment: { $in: asg.map((a) => a._id) } }).lean();
    const key = (a, s) => `${a}_${s}`;
    const by = new Map(subs.map((s) => [key(s.assignment, s.student), s]));
    const rows = [];
    asg.forEach((a) => c.students.forEach((st) => {
      const s = by.get(key(a._id, st._id));
      rows.push({ title: a.title, due: fmtDate(a.extendedDate || a.dueDate), roll: st.rollNo, name: st.name,
        status: s ? s.status : 'pending', submitted: s ? new Date(s.submittedAt).toLocaleString('en-IN') : '',
        late: s?.late ? 'Yes' : '', marks: s?.marks ?? '', max: a.maxMarks, remarks: s?.remarks || '' });
    }));
    return { filename: `assignments-${c.code}`, title: `Assignment Status - ${c.code} ${c.name}`,
      columns: [{ header: 'Assignment', key: 'title', width: 28 }, { header: 'Due', key: 'due', width: 12 }, { header: 'Roll No', key: 'roll', width: 12 },
        { header: 'Name', key: 'name', width: 24 }, { header: 'Status', key: 'status', width: 12 }, { header: 'Submitted On', key: 'submitted', width: 20 },
        { header: 'Late', key: 'late', width: 7 }, { header: 'Marks', key: 'marks', width: 8 }, { header: 'Max', key: 'max', width: 7 }, { header: 'Remarks', key: 'remarks', width: 30 }], rows };
  },

  async marks(req) {
    const c = await courseFor(req.user, req.query.course, { populate: true });
    const list = await Assessment.find({ course: c._id }).sort({ date: 1 }).lean();
    const rows = c.students.map((st) => {
      const row = { roll: st.rollNo, name: st.name }; let tot = 0, max = 0;
      list.forEach((a, i) => {
        const m = a.marks.find((x) => String(x.student) === String(st._id));
        row[`a${i}`] = m?.absent ? 'AB' : (m?.marks ?? '');
        if (typeof m?.marks === 'number') { tot += m.marks; max += a.maxMarks; }
      });
      return { ...row, total: tot, pct: max ? Math.round((tot / max) * 100) : '' };
    });
    return { filename: `marks-${c.code}`, title: `Marks Statement - ${c.code} ${c.name}`,
      columns: [{ header: 'Roll No', key: 'roll', width: 12 }, { header: 'Name', key: 'name', width: 26 },
        ...list.map((a, i) => ({ header: `${a.name} (${a.maxMarks})`, key: `a${i}`, width: 14 })),
        { header: 'Total', key: 'total', width: 9 }, { header: '%', key: 'pct', width: 7 }], rows };
  },

  async 'class-performance'(req) {
    const c = await courseFor(req.user, req.query.course);
    const list = await Assessment.find({ course: c._id }).sort({ date: 1 }).lean();
    const rows = list.map((a) => {
      const v = a.marks.filter((m) => !m.absent && typeof m.marks === 'number').map((m) => m.marks);
      const pass = v.filter((x) => x >= a.maxMarks * 0.4).length;
      return { name: a.name, date: fmtDate(a.date), max: a.maxMarks, appeared: v.length, absent: a.marks.filter((m) => m.absent).length,
        avg: v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2) : '', high: v.length ? Math.max(...v) : '',
        low: v.length ? Math.min(...v) : '', pass: v.length ? Math.round((pass / v.length) * 100) : '', status: a.status };
    });
    return { filename: `performance-${c.code}`, title: `Class Performance - ${c.code} ${c.name}`, filters: 'Pass mark 40%',
      columns: [{ header: 'Assessment', key: 'name', width: 24 }, { header: 'Date', key: 'date', width: 12 }, { header: 'Max', key: 'max', width: 7 },
        { header: 'Appeared', key: 'appeared', width: 10 }, { header: 'Absent', key: 'absent', width: 9 }, { header: 'Average', key: 'avg', width: 10 },
        { header: 'Highest', key: 'high', width: 10 }, { header: 'Lowest', key: 'low', width: 10 }, { header: 'Pass %', key: 'pass', width: 9 }, { header: 'Status', key: 'status', width: 11 }], rows };
  },

  async 'my-attendance'(req) {
    const sheets = await Attendance.find({ 'records.student': req.user._id }).populate('course', 'code name').sort({ date: 1 }).lean();
    const rows = sheets.map((s) => ({ date: fmtDate(s.date), period: s.period, course: `${s.course?.code} ${s.course?.name}`, topic: s.topic || '',
      status: s.records.find((x) => String(x.student) === String(req.user._id))?.status }));
    return { filename: 'my-attendance', title: `Attendance - ${req.user.name} (${req.user.rollNo || ''})`,
      columns: [{ header: 'Date', key: 'date', width: 12 }, { header: 'Period', key: 'period', width: 8 }, { header: 'Course', key: 'course', width: 34 },
        { header: 'Topic', key: 'topic', width: 28 }, { header: 'Status', key: 'status', width: 8 }], rows };
  },

  async 'my-results'(req) {
    const list = await Assessment.find({ 'marks.student': req.user._id, status: 'published' }).populate('course', 'code name').sort({ date: 1 }).lean();
    const rows = list.map((a) => { const m = a.marks.find((x) => String(x.student) === String(req.user._id));
      return { course: `${a.course.code} ${a.course.name}`, name: a.name, date: fmtDate(a.date), marks: m?.absent ? 'AB' : m?.marks ?? '', max: a.maxMarks }; });
    return { filename: 'my-results', title: `Results - ${req.user.name} (${req.user.rollNo || ''})`,
      columns: [{ header: 'Course', key: 'course', width: 34 }, { header: 'Assessment', key: 'name', width: 22 }, { header: 'Date', key: 'date', width: 12 },
        { header: 'Marks', key: 'marks', width: 9 }, { header: 'Max', key: 'max', width: 8 }], rows };
  },

  async 'fee-collection'(req) {
    const f = { status: 'paid' }; const dr = range(req.query); if (dr) f.paidAt = dr;
    const list = await Fee.find(f).populate('student', 'name rollNo batch section').sort({ paidAt: 1 }).lean();
    const rows = list.map((x) => ({ date: fmtDate(x.paidAt), receipt: x.receiptNo, roll: x.student?.rollNo, name: x.student?.name,
      batch: [x.student?.batch, x.student?.section].filter(Boolean).join(' / '), title: x.title, mode: x.mode, txn: x.txnId, amount: x.amount }));
    rows.push({ name: 'Total', amount: list.reduce((s, x) => s + x.amount, 0) });
    return { filename: 'fee-collection', title: 'Fee Collection Report', filters: dateLabel(req.query),
      columns: [{ header: 'Paid On', key: 'date', width: 12 }, { header: 'Receipt', key: 'receipt', width: 14 }, { header: 'Roll No', key: 'roll', width: 12 },
        { header: 'Name', key: 'name', width: 24 }, { header: 'Batch / Section', key: 'batch', width: 16 }, { header: 'Fee', key: 'title', width: 22 },
        { header: 'Mode', key: 'mode', width: 10 }, { header: 'Transaction', key: 'txn', width: 16 }, { header: 'Amount (Rs.)', key: 'amount', width: 14 }], rows };
  },

  async 'fee-dues'() {
    const list = await Fee.find({ status: 'pending' }).populate('student', 'name rollNo batch section phone').sort({ dueDate: 1 }).lean();
    const now = Date.now();
    const rows = list.map((x) => ({ roll: x.student?.rollNo, name: x.student?.name, batch: [x.student?.batch, x.student?.section].filter(Boolean).join(' / '),
      phone: x.student?.phone, title: x.title, due: fmtDate(x.dueDate), overdue: x.dueDate && x.dueDate < now ? Math.floor((now - x.dueDate) / 864e5) : 0, amount: x.amount }));
    rows.push({ name: 'Total', amount: list.reduce((s, x) => s + x.amount, 0) });
    return { filename: 'fee-dues', title: 'Fee Due Report',
      columns: [{ header: 'Roll No', key: 'roll', width: 12 }, { header: 'Name', key: 'name', width: 24 }, { header: 'Batch / Section', key: 'batch', width: 16 },
        { header: 'Phone', key: 'phone', width: 14 }, { header: 'Fee', key: 'title', width: 22 }, { header: 'Due Date', key: 'due', width: 12 },
        { header: 'Days Overdue', key: 'overdue', width: 12 }, { header: 'Amount (Rs.)', key: 'amount', width: 14 }], rows };
  },

  async 'messages-sent'(req) {
    const f = req.user.role === 'faculty' ? { sentBy: req.user._id } : {}; const dr = range(req.query); if (dr) f.createdAt = dr;
    const list = await Message.find(f).populate('sentBy', 'name').populate('audience.course', 'code').sort({ createdAt: -1 }).lean();
    const rows = list.map((m) => ({ date: m.sentAt ? new Date(m.sentAt).toLocaleString('en-IN') : `Scheduled ${new Date(m.scheduledAt).toLocaleString('en-IN')}`,
      subject: m.subject, channels: m.channels.join(', '), audience: m.audience.type === 'course' ? m.audience.course?.code : (m.audience.roles || []).join(', '),
      recipients: m.stats?.recipients ?? '', status: m.status, by: m.sentBy?.name }));
    return { filename: 'messages-sent', title: 'Message Sent Report', filters: dateLabel(req.query),
      columns: [{ header: 'Date', key: 'date', width: 22 }, { header: 'Subject', key: 'subject', width: 30 }, { header: 'Channels', key: 'channels', width: 18 },
        { header: 'Audience', key: 'audience', width: 18 }, { header: 'Recipients', key: 'recipients', width: 11 }, { header: 'Status', key: 'status', width: 10 },
        { header: 'Sent By', key: 'by', width: 20 }], rows };
  },

  // Every calendar entry (exams, events, holidays, other) the user's role can see; `kind` narrows to one type.
  async calendar(req) {
    const f = { audience: { $in: audiencesFor(req.user.role) } };
    if (req.query.kind) f.type = req.query.kind;
    const dr = range(req.query); if (dr) f.start = dr;
    const list = await Event.find(f).sort({ start: 1 }).lean();
    const day = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'long' });
    const label = (t) => t[0].toUpperCase() + t.slice(1);
    return { filename: `calendar${req.query.kind ? `-${req.query.kind}` : ''}`, title: req.query.kind ? `Calendar - ${label(req.query.kind)}` : 'Academic Calendar',
      filters: [req.query.kind ? `Type: ${label(req.query.kind)}` : 'All types', dateLabel(req.query)].filter(Boolean).join(' · '),
      columns: [{ header: 'From', key: 'from', width: 12 }, { header: 'To', key: 'to', width: 12 }, { header: 'Day', key: 'day', width: 12 },
        { header: 'Type', key: 'type', width: 10 }, { header: 'Title', key: 'title', width: 32 }, { header: 'Description', key: 'desc', width: 40 }, { header: 'Applies To', key: 'aud', width: 12 }],
      rows: list.map((e) => ({ from: fmtDate(e.start), to: fmtDate(e.end), day: day(e.start), type: label(e.type), title: e.title, desc: e.description || '', aud: e.audience })) };
  },

  async holidays(req) {
    const f = { type: 'holiday' }; const dr = range(req.query); if (dr) f.start = dr;
    const list = await Event.find(f).sort({ start: 1 }).lean();
    return { filename: 'holiday-list', title: 'Holiday List', filters: dateLabel(req.query),
      columns: [{ header: 'From', key: 'from', width: 12 }, { header: 'To', key: 'to', width: 12 }, { header: 'Day', key: 'day', width: 12 },
        { header: 'Holiday', key: 'title', width: 32 }, { header: 'Applies To', key: 'aud', width: 12 }],
      rows: list.map((e) => ({ from: fmtDate(e.start), to: fmtDate(e.end), day: new Date(e.start).toLocaleDateString('en-IN', { weekday: 'long' }), title: e.title, aud: e.audience })) };
  },

  async requests(req) {
    const f = {}; const dr = range(req.query); if (dr) f.createdAt = dr;
    const list = await Request.find(f).populate('student', 'name rollNo').populate('handledBy', 'name').sort({ createdAt: -1 }).lean();
    return { filename: 'service-requests', title: 'Service Requests', filters: dateLabel(req.query),
      columns: [{ header: 'Raised On', key: 'date', width: 12 }, { header: 'Roll No', key: 'roll', width: 12 }, { header: 'Name', key: 'name', width: 24 },
        { header: 'Type', key: 'type', width: 22 }, { header: 'Details', key: 'details', width: 34 }, { header: 'Status', key: 'status', width: 11 },
        { header: 'Remarks', key: 'remarks', width: 28 }, { header: 'Handled By', key: 'by', width: 18 }],
      rows: list.map((x) => ({ date: fmtDate(x.createdAt), roll: x.student?.rollNo, name: x.student?.name, type: x.type, details: x.details,
        status: x.status, remarks: x.remarks, by: x.handledBy?.name })) };
  },

  async users(req) {
    const f = req.query.role ? { role: req.query.role } : {};
    const list = await User.find(f).sort({ role: 1, name: 1 }).lean();
    return { filename: 'users', title: 'User List', filters: req.query.role ? `Role: ${req.query.role}` : 'All roles',
      columns: [{ header: 'Name', key: 'name', width: 24 }, { header: 'Email', key: 'email', width: 28 }, { header: 'Role', key: 'role', width: 10 },
        { header: 'Roll / Emp ID', key: 'id', width: 14 }, { header: 'Department', key: 'department', width: 18 }, { header: 'Batch', key: 'batch', width: 10 },
        { header: 'Section', key: 'section', width: 9 }, { header: 'Phone', key: 'phone', width: 14 }, { header: 'Active', key: 'active', width: 8 }],
      rows: list.map((u) => ({ ...u, id: u.rollNo || u.employeeId, active: u.active ? 'Yes' : 'No' })) };
  },
};

function dateLabel(q) {
  if (!q.from && !q.to) return '';
  return `Period: ${q.from ? fmtDate(q.from) : 'start'} to ${q.to ? fmtDate(q.to) : 'today'}`;
}

r.get('/', (req, res) => res.json(Object.keys(ACCESS).filter((k) => ACCESS[k].includes(req.user.role))));

r.get('/:type', ah(async (req, res) => {
  const { type } = req.params;
  if (!handlers[type]) throw new HttpError(404, 'Report not found');
  if (!ACCESS[type].includes(req.user.role)) throw new HttpError(403, 'You cannot run this report');
  if (['attendance-register', 'assignment-status', 'marks', 'class-performance'].includes(type) && !req.query.course) {
    throw new HttpError(400, 'Select a course');
  }
  await sendExcel(res, await handlers[type](req, res));
}));

export default r;
