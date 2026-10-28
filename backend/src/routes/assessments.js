import { Router } from 'express';
import Assessment from '../models/Assessment.js';
import Course, { schemeOf } from '../models/Course.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { courseFor } from '../utils/access.js';
import { notifyUsers } from '../utils/notify.js';
import { trashRoutes } from '../utils/softDelete.js';

const r = Router();

trashRoutes(r, Assessment, {
  roles: ['faculty', 'admin'],
  scope: async (req) => {
    if (!req.query.course) throw new HttpError(400, 'Select a course');
    await courseFor(req.user, req.query.course);
    return { course: req.query.course };
  },
  check: (req, a) => courseFor(req.user, a.course),
});

r.get('/', allow('faculty', 'admin'), ah(async (req, res) => {
  if (!req.query.course) throw new HttpError(400, 'Select a course');
  await courseFor(req.user, req.query.course);
  res.json(await Assessment.find({ course: req.query.course }).sort({ date: -1, createdAt: -1 }).lean());
}));

r.get('/my', allow('student'), ah(async (req, res) => {
  const list = (await Assessment.find({ 'marks.student': req.user._id, status: 'published' })
    .populate('course', 'code name type credits semester program evaluation passMarks').sort({ date: -1 }).lean())
    .filter((a) => a.course); // skip results of deleted courses
  res.json(list.map((a) => {
    const m = a.marks.find((x) => String(x.student) === String(req.user._id));
    const scored = a.marks.filter((x) => !x.absent && typeof x.marks === 'number').map((x) => x.marks);
    return { _id: a._id, name: a.name, component: a.component, course: a.course, date: a.date, maxMarks: a.maxMarks, passMarks: a.passMarks,
      marks: m?.marks, absent: m?.absent, classAvg: scored.length ? +(scored.reduce((s, x) => s + x, 0) / scored.length).toFixed(1) : null };
  }));
}));

// Either an evaluation-scheme part of the course (component: 'MSE' etc. — name and max come from the
// scheme, one per course) or a free-form extra test with its own name and maximum.
r.post('/', allow('faculty', 'admin'), ah(async (req, res) => {
  const c = await courseFor(req.user, req.body.course);
  let { name, maxMarks } = req.body;
  const { date } = req.body;
  const passMarks = req.body.passMarks === '' || req.body.passMarks == null ? undefined : Number(req.body.passMarks);
  if (passMarks != null && (passMarks < 0 || passMarks > Number(maxMarks))) throw new HttpError(400, `Pass mark must be between 0 and ${maxMarks}`);
  const component = req.body.component ? String(req.body.component).toUpperCase() : undefined;
  if (component) {
    const part = schemeOf(c).find((p) => p.key === component);
    if (!part) throw new HttpError(400, `${component} is not part of ${c.code}'s evaluation scheme`);
    if (await Assessment.exists({ course: c._id, component })) throw new HttpError(409, `${component} already exists for ${c.code}`);
    name = name || `${part.key} - ${part.label}`;
    maxMarks = part.max;
  }
  res.status(201).json(await Assessment.create({ course: c._id, name, maxMarks, passMarks: component ? undefined : passMarks, component, date, createdBy: req.user._id,
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

// Take a published result back: students stop seeing it (every student view lists only 'published'),
// and it returns to draft so the faculty can correct the marks and publish again.
r.put('/:id/unpublish', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assessment.findById(req.params.id);
  if (!a) throw new HttpError(404, 'Assessment not found');
  await courseFor(req.user, a.course);
  if (a.status !== 'published') throw new HttpError(400, `${a.name} is not published`);
  a.status = 'draft';
  await a.save();
  res.json(a);
}));

// Rename / change the maximum or date of an extra test. Scheme parts (MSE, ESE...) change through PUT /courses/:id/marking.
r.put('/:id', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assessment.findById(req.params.id);
  if (!a) throw new HttpError(404, 'Assessment not found');
  await courseFor(req.user, a.course);
  if (a.component) throw new HttpError(400, `${a.component} follows the course's marking scheme`);
  if (req.body.maxMarks !== undefined) {
    const max = Number(req.body.maxMarks);
    const top = Math.max(0, ...a.marks.map((m) => (typeof m.marks === 'number' ? m.marks : 0)));
    if (!(max > 0)) throw new HttpError(400, 'Maximum marks must be more than 0');
    if (top > max) throw new HttpError(400, `Maximum cannot be ${max}: a student already has ${top}`);
    a.maxMarks = max;
  }
  if (req.body.passMarks !== undefined) {
    const pass = req.body.passMarks === '' || req.body.passMarks == null ? undefined : Number(req.body.passMarks);
    if (pass != null && (pass < 0 || pass > a.maxMarks)) throw new HttpError(400, `Pass mark must be between 0 and ${a.maxMarks}`);
    a.passMarks = pass;
  }
  if (req.body.name) a.name = req.body.name;
  if (req.body.date !== undefined) a.date = req.body.date || undefined;
  await a.save();
  res.json(a);
}));

// One student's mark (used by "Edit marks" on a student row); other students' marks are untouched.
r.put('/:id/marks/:studentId', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assessment.findById(req.params.id);
  if (!a) throw new HttpError(404, 'Assessment not found');
  const c = await courseFor(req.user, a.course);
  if (['verified', 'published'].includes(a.status) && req.user.role !== 'admin') throw new HttpError(400, `${a.name} is locked after verification`);
  if (!c.students.some((s) => String(s) === req.params.studentId)) throw new HttpError(400, 'Student is not in this course');
  const absent = !!req.body.absent;
  const raw = req.body.marks;
  const marks = absent || raw === '' || raw == null ? undefined : Number(raw);
  if (marks !== undefined && (Number.isNaN(marks) || marks < 0 || marks > a.maxMarks)) throw new HttpError(400, `${a.name}: marks must be between 0 and ${a.maxMarks}`);
  const row = a.marks.find((m) => String(m.student) === req.params.studentId);
  if (row) Object.assign(row, { marks, absent });
  else a.marks.push({ student: req.params.studentId, marks, absent });
  await a.save();
  res.json({ student: req.params.studentId, marks, absent });
}));

r.delete('/:id', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assessment.findById(req.params.id);
  if (!a) throw new HttpError(404, 'Assessment not found');
  await courseFor(req.user, a.course);
  if (a.status !== 'draft' && req.user.role !== 'admin') throw new HttpError(400, 'Only draft assessments can be deleted');
  await a.softDelete(req.user);
  res.json({ message: 'Assessment deleted' });
}));

export default r;
