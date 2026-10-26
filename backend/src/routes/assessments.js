import { Router } from 'express';
import Assessment from '../models/Assessment.js';
import Course from '../models/Course.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { courseFor } from '../utils/access.js';
import { notifyUsers } from '../utils/notify.js';

const r = Router();

r.get('/', allow('faculty', 'admin'), ah(async (req, res) => {
  if (!req.query.course) throw new HttpError(400, 'Select a course');
  await courseFor(req.user, req.query.course);
  res.json(await Assessment.find({ course: req.query.course }).sort({ date: -1, createdAt: -1 }).lean());
}));

r.get('/my', allow('student'), ah(async (req, res) => {
  const list = await Assessment.find({ 'marks.student': req.user._id, status: 'published' })
    .populate('course', 'code name').sort({ date: -1 }).lean();
  res.json(list.map((a) => {
    const m = a.marks.find((x) => String(x.student) === String(req.user._id));
    const scored = a.marks.filter((x) => !x.absent && typeof x.marks === 'number').map((x) => x.marks);
    return { _id: a._id, name: a.name, course: a.course, date: a.date, maxMarks: a.maxMarks,
      marks: m?.marks, absent: m?.absent, classAvg: scored.length ? +(scored.reduce((s, x) => s + x, 0) / scored.length).toFixed(1) : null };
  }));
}));

r.post('/', allow('faculty', 'admin'), ah(async (req, res) => {
  const c = await courseFor(req.user, req.body.course);
  const { name, maxMarks, date } = req.body;
  res.status(201).json(await Assessment.create({ course: c._id, name, maxMarks, date, createdBy: req.user._id,
    marks: c.students.map((s) => ({ student: s })) }));
}));

r.get('/:id', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assessment.findById(req.params.id).lean();
  if (!a) throw new HttpError(404, 'Assessment not found');
  const c = await courseFor(req.user, a.course, { populate: true });
  const by = Object.fromEntries(a.marks.map((m) => [String(m.student), m]));
  res.json({ ...a, course: { _id: c._id, code: c.code, name: c.name },
    marks: c.students.map((s) => ({ student: s, marks: by[String(s._id)]?.marks ?? '', absent: !!by[String(s._id)]?.absent })) });
}));

// Save marks; status: draft | submitted (faculty) | verified | published (admin or faculty publish)
r.put('/:id/marks', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assessment.findById(req.params.id);
  if (!a) throw new HttpError(404, 'Assessment not found');
  const c = await courseFor(req.user, a.course);
  if (['verified', 'published'].includes(a.status) && req.user.role !== 'admin') throw new HttpError(400, 'Marks are locked after verification');
  const { marks = [], status } = req.body;
  for (const m of marks) {
    if (!m.absent && m.marks !== '' && m.marks != null && (m.marks < 0 || m.marks > a.maxMarks)) {
      throw new HttpError(400, `Marks must be between 0 and ${a.maxMarks}`);
    }
  }
  a.marks = marks.map((m) => ({ student: m.student, absent: !!m.absent, marks: m.absent || m.marks === '' ? undefined : Number(m.marks) }));
  if (status) {
    if (status === 'verified' && req.user.role !== 'admin') throw new HttpError(403, 'Only admin can verify');
    a.status = status;
  }
  await a.save();
  if (status === 'published') await notifyUsers(c.students, { title: `Result published: ${a.name}`, body: `${c.code} ${c.name}`, link: '/marks' });
  res.json(a);
}));

r.delete('/:id', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assessment.findById(req.params.id);
  if (!a) throw new HttpError(404, 'Assessment not found');
  await courseFor(req.user, a.course);
  if (a.status !== 'draft' && req.user.role !== 'admin') throw new HttpError(400, 'Only draft assessments can be deleted');
  await a.deleteOne();
  res.json({ message: 'Assessment deleted' });
}));

export default r;
