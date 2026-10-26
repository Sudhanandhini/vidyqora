import { Router } from 'express';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { courseFor, courseScope } from '../utils/access.js';

const r = Router();

r.get('/', ah(async (req, res) => {
  const list = await Course.find(courseScope(req.user))
    .populate('faculty', 'name email').sort({ code: 1 }).lean();
  res.json(list.map((c) => ({ ...c, studentCount: c.students.length, students: undefined, lessonPlan: undefined,
    progress: c.lessonPlan?.length ? Math.round((c.lessonPlan.filter((l) => l.done).length / c.lessonPlan.length) * 100) : 0 })));
}));

r.get('/:id', ah(async (req, res) => {
  res.json(await courseFor(req.user, req.params.id, { populate: true }));
}));

async function enrol(body) {
  if (Array.isArray(body.students)) return body.students;
  if (!body.batch) return [];
  const f = { role: 'student', active: true, batch: body.batch };
  if (body.section) f.section = body.section;
  return (await User.find(f).select('_id').lean()).map((u) => u._id);
}

r.post('/', allow('admin'), ah(async (req, res) => {
  const { code, name, department, program, batch, section, credits, faculty } = req.body;
  const course = await Course.create({ code, name, department, program, batch, section, credits, faculty: faculty || undefined,
    students: await enrol(req.body) });
  res.status(201).json(course);
}));

r.put('/:id', allow('admin'), ah(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, 'Course not found');
  ['code', 'name', 'department', 'program', 'batch', 'section', 'credits'].forEach((k) => { if (req.body[k] !== undefined) course[k] = req.body[k]; });
  if (req.body.faculty !== undefined) course.faculty = req.body.faculty || undefined;
  if (req.body.reenrol || Array.isArray(req.body.students)) course.students = await enrol({ ...course.toObject(), ...req.body, students: req.body.students });
  await course.save();
  res.json(course);
}));

r.delete('/:id', allow('admin'), ah(async (req, res) => {
  await Course.findByIdAndDelete(req.params.id);
  res.json({ message: 'Course deleted' });
}));

// Lesson plan: faculty owns it.
r.put('/:id/lesson-plan', allow('faculty', 'admin'), ah(async (req, res) => {
  const course = await courseFor(req.user, req.params.id);
  course.lessonPlan = (req.body.lessonPlan || []).map(({ unit, topic, planned, done }) => ({ unit, topic, planned, done: !!done }));
  await course.save();
  res.json(course.lessonPlan);
}));

export default r;
