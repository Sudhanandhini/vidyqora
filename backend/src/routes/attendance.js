import { Router } from 'express';
import mongoose from 'mongoose';
import Attendance, { PRESENT_CODES } from '../models/Attendance.js';
import Course from '../models/Course.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { courseFor, dayStart } from '../utils/access.js';
import { notifyUsers } from '../utils/notify.js';

const r = Router();

// Existing sheet for a course/date/period (faculty, admin)
r.get('/', allow('faculty', 'admin'), ah(async (req, res) => {
  const { course, date, period = 1 } = req.query;
  if (!course || !date) throw new HttpError(400, 'Course and date are required');
  await courseFor(req.user, course);
  res.json(await Attendance.findOne({ course, date: dayStart(date), period: Number(period) }).lean());
}));

r.post('/', allow('faculty', 'admin'), ah(async (req, res) => {
  const { course, date, period = 1, topic, records = [] } = req.body;
  const c = await courseFor(req.user, course);
  const day = dayStart(date);
  if (day > dayStart(new Date())) throw new HttpError(400, 'Attendance cannot be marked for a future date');
  const enrolled = new Set(c.students.map(String));
  const clean = records.filter((x) => enrolled.has(String(x.student)));
  const doc = await Attendance.findOneAndUpdate(
    { course, date: day, period: Number(period) },
    { records: clean, topic, markedBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const absent = clean.filter((x) => x.status === 'A').map((x) => x.student);
  await notifyUsers(absent, { title: `Marked absent in ${c.code}`, body: `${c.name}, ${day.toDateString()}, period ${period}`, link: '/attendance' });
  res.json(doc);
}));

// Course register summary (faculty/admin)
r.get('/course/:id/summary', allow('faculty', 'admin'), ah(async (req, res) => {
  const c = await courseFor(req.user, req.params.id, { populate: true });
  const sheets = await Attendance.find({ course: c._id }).lean();
  const map = new Map(c.students.map((s) => [String(s._id), { student: s, total: 0, present: 0 }]));
  sheets.forEach((sh) => sh.records.forEach((x) => {
    const m = map.get(String(x.student)); if (!m) return;
    m.total++; if (PRESENT_CODES.includes(x.status)) m.present++;
  }));
  res.json({ sessions: sheets.length, rows: [...map.values()].map((m) => ({ ...m, pct: m.total ? Math.round((m.present / m.total) * 100) : null })) });
}));

// Student's own summary
r.get('/my', allow('student'), ah(async (req, res) => {
  const id = new mongoose.Types.ObjectId(String(req.user._id));
  const agg = await Attendance.aggregate([
    { $match: { 'records.student': id } },
    { $unwind: '$records' },
    { $match: { 'records.student': id } },
    { $group: { _id: '$course', total: { $sum: 1 },
      present: { $sum: { $cond: [{ $in: ['$records.status', PRESENT_CODES] }, 1, 0] } } } },
  ]);
  const courses = await Course.find({ _id: { $in: agg.map((a) => a._id) } }).select('code name').lean();
  const byId = Object.fromEntries(courses.map((c) => [String(c._id), c]));
  const rows = agg.map((a) => ({ course: byId[String(a._id)], total: a.total, present: a.present, pct: Math.round((a.present / a.total) * 100) }));
  const total = rows.reduce((s, x) => s + x.total, 0), present = rows.reduce((s, x) => s + x.present, 0);
  res.json({ overall: total ? Math.round((present / total) * 100) : null, rows });
}));

// Student's day-wise log for one course
r.get('/my/:courseId', allow('student'), ah(async (req, res) => {
  await courseFor(req.user, req.params.courseId);
  const sheets = await Attendance.find({ course: req.params.courseId, 'records.student': req.user._id }).sort({ date: -1 }).lean();
  res.json(sheets.map((s) => ({ date: s.date, period: s.period, topic: s.topic,
    status: s.records.find((x) => String(x.student) === String(req.user._id))?.status })));
}));

export default r;
