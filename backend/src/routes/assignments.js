import { Router } from 'express';
import Assignment, { Submission } from '../models/Assignment.js';
import Course from '../models/Course.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { courseFor, courseScope } from '../utils/access.js';
import { upload, toFiles } from '../middleware/upload.js';
import { notifyUsers } from '../utils/notify.js';
import { trashRoutes } from '../utils/softDelete.js';

const r = Router();
const deadline = (a) => a.extendedDate || a.dueDate;

trashRoutes(r, Assignment, {
  roles: ['faculty', 'admin'],
  scope: async (req) => ({ course: { $in: (await Course.find(courseScope(req.user)).select('_id').lean()).map((c) => c._id) } }),
  populate: [['course', 'code name']],
  check: (req, a) => courseFor(req.user, a.course),
  onPurge: (a) => Submission.deleteMany({ assignment: a._id }),
});

r.get('/', ah(async (req, res) => {
  const courses = await Course.find(courseScope(req.user)).select('_id code name students').lean();
  const ids = courses.map((c) => c._id);
  const f = { course: req.query.course ? req.query.course : { $in: ids } };
  if (req.query.course && !ids.some((i) => String(i) === req.query.course)) throw new HttpError(403, 'No access to this course');
  if (req.user.role === 'student') f.publishDate = { $lte: new Date() };
  const list = await Assignment.find(f).populate('course', 'code name').sort({ dueDate: -1 }).lean();

  if (req.user.role === 'student') {
    const subs = await Submission.find({ student: req.user._id, assignment: { $in: list.map((a) => a._id) } }).lean();
    const by = Object.fromEntries(subs.map((s) => [String(s.assignment), s]));
    return res.json(list.map((a) => ({ ...a, submission: by[String(a._id)] || null })));
  }
  const counts = await Submission.aggregate([
    { $match: { assignment: { $in: list.map((a) => a._id) } } },
    { $group: { _id: '$assignment', submitted: { $sum: 1 }, evaluated: { $sum: { $cond: [{ $eq: ['$status', 'evaluated'] }, 1, 0] } } } },
  ]);
  const cm = Object.fromEntries(counts.map((c) => [String(c._id), c]));
  const size = Object.fromEntries(courses.map((c) => [String(c._id), c.students.length]));
  res.json(list.map((a) => ({ ...a, enrolled: size[String(a.course._id)] || 0,
    submitted: cm[String(a._id)]?.submitted || 0, evaluated: cm[String(a._id)]?.evaluated || 0 })));
}));

r.post('/', allow('faculty', 'admin'), upload.array('files', 5), ah(async (req, res) => {
  const c = await courseFor(req.user, req.body.course);
  const { title, description, topic, publishDate, dueDate, extendedDate, maxMarks, hideIdentity } = req.body;
  const a = await Assignment.create({
    course: c._id, title, description, topic, dueDate, maxMarks,
    publishDate: publishDate || new Date(), extendedDate: extendedDate || undefined,
    hideIdentity: hideIdentity === 'true' || hideIdentity === true,
    files: toFiles(req.files), createdBy: req.user._id,
  });
  await notifyUsers(c.students, { title: `New assignment in ${c.code}`, body: `${title} - due ${new Date(dueDate).toDateString()}`, link: '/assignments' });
  res.status(201).json(a);
}));

r.put('/:id', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assignment.findById(req.params.id);
  if (!a) throw new HttpError(404, 'Assignment not found');
  await courseFor(req.user, a.course);
  ['title', 'description', 'topic', 'publishDate', 'dueDate', 'maxMarks', 'hideIdentity'].forEach((k) => { if (req.body[k] !== undefined) a[k] = req.body[k]; });
  if (req.body.extendedDate !== undefined) a.extendedDate = req.body.extendedDate || undefined;
  await a.save();
  res.json(a);
}));

r.delete('/:id', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assignment.findById(req.params.id);
  if (!a) throw new HttpError(404, 'Assignment not found');
  await courseFor(req.user, a.course);
  await a.softDelete(req.user); // submissions are kept until the assignment is deleted permanently
  res.json({ message: 'Assignment deleted' });
}));

// Submissions list for faculty (includes students who have not submitted)
r.get('/:id/submissions', allow('faculty', 'admin'), ah(async (req, res) => {
  const a = await Assignment.findById(req.params.id).lean();
  if (!a) throw new HttpError(404, 'Assignment not found');
  const c = await courseFor(req.user, a.course, { populate: true });
  const subs = await Submission.find({ assignment: a._id }).lean();
  const by = Object.fromEntries(subs.map((s) => [String(s.student), s]));
  res.json({
    assignment: a,
    rows: c.students.map((s, i) => ({
      student: a.hideIdentity ? { _id: s._id, name: `Student ${i + 1}`, rollNo: '-' } : s,
      submission: by[String(s._id)] || null,
    })),
  });
}));

r.post('/:id/submit', allow('student'), upload.array('files', 5), ah(async (req, res) => {
  const a = await Assignment.findById(req.params.id);
  if (!a || a.publishDate > new Date()) throw new HttpError(404, 'Assignment not found');
  await courseFor(req.user, a.course);
  const existing = await Submission.findOne({ assignment: a._id, student: req.user._id });
  if (existing && existing.status === 'evaluated') throw new HttpError(400, 'This assignment is already evaluated');
  const now = new Date();
  const late = now > deadline(a);
  if (!req.body.text && !req.files?.length) throw new HttpError(400, 'Add an answer or attach a file');
  const data = { text: req.body.text, files: toFiles(req.files), submittedAt: now, late, status: 'submitted' };
  const sub = existing
    ? Object.assign(existing, data, { attempts: existing.attempts + 1 })
    : new Submission({ ...data, assignment: a._id, student: req.user._id });
  await sub.save();
  res.status(201).json(sub);
}));

r.put('/submissions/:sid/evaluate', allow('faculty', 'admin'), ah(async (req, res) => {
  const sub = await Submission.findById(req.params.sid).populate('assignment');
  if (!sub) throw new HttpError(404, 'Submission not found');
  await courseFor(req.user, sub.assignment.course);
  const { marks, remarks, status = 'evaluated' } = req.body;
  if (status === 'evaluated' && (marks === undefined || marks === '' || marks < 0 || marks > sub.assignment.maxMarks)) {
    throw new HttpError(400, `Marks must be between 0 and ${sub.assignment.maxMarks}`);
  }
  Object.assign(sub, { marks: status === 'evaluated' ? Number(marks) : sub.marks, remarks, status, evaluatedBy: req.user._id });
  await sub.save();
  await notifyUsers([sub.student], {
    title: status === 'resubmit' ? `Resubmit: ${sub.assignment.title}` : `Evaluated: ${sub.assignment.title}`,
    body: status === 'resubmit' ? remarks : `Marks ${sub.marks}/${sub.assignment.maxMarks}`, link: '/assignments',
  });
  res.json(sub);
}));

export default r;
