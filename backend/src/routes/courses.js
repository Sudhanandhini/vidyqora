import { Router } from 'express';
import Course from '../models/Course.js';
import User from '../models/User.js';
import Assessment from '../models/Assessment.js';
import { schemeOf } from '../models/Course.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { courseFor, courseScope } from '../utils/access.js';
import { trashRoutes } from '../utils/softDelete.js';

const r = Router();
trashRoutes(r, Course, { roles: ['admin'], populate: [['faculty', 'name']] });

r.get('/', ah(async (req, res) => {
  const list = await Course.find(courseScope(req.user))
    .populate('faculty', 'name email').sort({ code: 1 }).lean();
  // Count only students that still exist (deleted users stay in the id list so a restore brings them back).
  const live = new Set((await User.find({ _id: { $in: list.flatMap((c) => c.students) } }).select('_id').lean()).map((u) => String(u._id)));
  res.json(list.map((c) => ({ ...c, studentCount: c.students.filter((s) => live.has(String(s))).length, students: undefined, lessonPlan: undefined,
    progress: c.lessonPlan?.length ? Math.round((c.lessonPlan.filter((l) => l.done).length / c.lessonPlan.length) * 100) : 0 })));
}));

r.get('/:id', ah(async (req, res) => {
  res.json(await courseFor(req.user, req.params.id, { populate: true }));
}));

// Student fields a course can target; a blank field on the course means "any".
export const GROUP_FIELDS = ['level', 'program', 'batch', 'section', 'semester'];

async function enrol(body) {
  if (Array.isArray(body.students)) return body.students;
  const f = { role: 'student', active: true };
  GROUP_FIELDS.forEach((k) => { if (body[k]) f[k] = body[k]; });
  if (!body.batch && !body.program) return []; // too broad: would enrol every student
  return (await User.find(f).select('_id').lean()).map((u) => u._id);
}

// Fields an admin can set on a course (subject), including the syllabus paper details.
const COURSE_FIELDS = ['code', 'name', 'department', 'level', 'program', 'batch', 'section', 'semester',
  'type', 'lectures', 'tutorials', 'practicals', 'credits', 'hours', 'evaluation', 'passMarks'];
const num = (v) => (v === '' || v == null ? undefined : Number(v));
const cleanScheme = (ev) => (Array.isArray(ev) ? ev.filter((p) => p?.key && Number(p.max) > 0)
  .map((p) => ({ key: p.key, label: p.label, max: Number(p.max), pass: num(p.pass) })) : undefined);

/** Pass marks must fit inside their maximum. */
function checkPassMarks(evaluation, passMarks) {
  const bad = evaluation.find((p) => p.pass != null && (p.pass < 0 || p.pass > p.max));
  if (bad) throw new HttpError(400, `${bad.key} pass mark must be between 0 and ${bad.max}`);
  const total = evaluation.reduce((t, p) => t + p.max, 0);
  if (passMarks != null && (passMarks < 0 || passMarks > total)) throw new HttpError(400, `Pass mark for the sub-total must be between 0 and ${total}`);
}

/** A new maximum cannot be below a mark already entered. */
async function checkMaxAgainstMarks(courseId, evaluation) {
  for (const p of evaluation) {
    const a = await Assessment.findOne({ course: courseId, component: p.key }).lean();
    const top = Math.max(0, ...(a?.marks || []).map((m) => (typeof m.marks === 'number' ? m.marks : 0)));
    if (top > p.max) throw new HttpError(400, `${p.key} maximum cannot be ${p.max}: a student already has ${top}`);
  }
}

r.post('/', allow('admin'), ah(async (req, res) => {
  const data = Object.fromEntries(COURSE_FIELDS.filter((k) => req.body[k] !== undefined && req.body[k] !== '').map((k) => [k, req.body[k]]));
  if (data.evaluation) data.evaluation = cleanScheme(data.evaluation);
  if (data.evaluation) checkPassMarks(data.evaluation, num(data.passMarks));
  const course = await Course.create({ ...data, faculty: req.body.faculty || undefined, students: await enrol(req.body) });
  res.status(201).json(course);
}));

r.put('/:id', allow('admin'), ah(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, 'Course not found');
  COURSE_FIELDS.forEach((k) => { if (req.body[k] !== undefined) course[k] = k === 'evaluation' ? cleanScheme(req.body[k]) : k === 'passMarks' ? num(req.body[k]) : req.body[k]; });
  checkPassMarks(course.evaluation, course.passMarks);
  await checkMaxAgainstMarks(course._id, course.evaluation);
  if (req.body.faculty !== undefined) course.faculty = req.body.faculty || undefined;
  if (req.body.reenrol || Array.isArray(req.body.students)) course.students = await enrol({ ...course.toObject(), ...req.body, students: req.body.students });
  await course.save();
  // Keep MSE/ESE/CPA assessments in step with the scheme's maximum marks.
  await Promise.all(course.evaluation.map((p) => Assessment.updateMany({ course: course._id, component: p.key }, { maxMarks: p.max })));
  res.json(course);
}));

r.delete('/:id', allow('admin'), ah(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new HttpError(404, 'Course not found');
  await course.softDelete(req.user);
  res.json({ message: 'Course deleted' });
}));

// Class list: the course's faculty (or admin) adds or removes individual students.
r.post('/:id/students', allow('faculty', 'admin'), ah(async (req, res) => {
  const course = await courseFor(req.user, req.params.id);
  const ids = Array.isArray(req.body.students) ? req.body.students : [];
  if (!ids.length) throw new HttpError(400, 'Select at least one student');
  const valid = (await User.find({ _id: { $in: ids }, role: 'student', active: true }).select('_id').lean()).map((u) => u._id);
  const before = course.students.length;
  course.students.addToSet(...valid);
  await course.save();
  res.json({ added: course.students.length - before, total: course.students.length });
}));

r.delete('/:id/students/:studentId', allow('faculty', 'admin'), ah(async (req, res) => {
  const course = await courseFor(req.user, req.params.id);
  course.students.pull(req.params.studentId);
  await course.save();
  res.json({ total: course.students.length });
}));

// Marking: the course's faculty may change each part's maximum and pass marks and the sub-total pass mark.
// Parts themselves (MSE, ESE...) are set by admin in the course form.
r.put('/:id/marking', allow('faculty', 'admin'), ah(async (req, res) => {
  const course = await courseFor(req.user, req.params.id);
  const given = Object.fromEntries((req.body.evaluation || []).map((p) => [String(p.key).toUpperCase(), p]));
  const evaluation = schemeOf(course).map((p) => {
    const g = given[p.key] || {};
    const max = g.max !== undefined ? Number(g.max) : p.max;
    if (!(max > 0)) throw new HttpError(400, `${p.key} maximum must be more than 0`);
    return { key: p.key, label: p.label, max, pass: g.pass !== undefined ? num(g.pass) : p.pass };
  });
  const passMarks = req.body.passMarks !== undefined ? num(req.body.passMarks) : course.passMarks;
  checkPassMarks(evaluation, passMarks);
  await checkMaxAgainstMarks(course._id, evaluation);
  course.evaluation = evaluation;
  course.passMarks = passMarks;
  await course.save();
  await Promise.all(evaluation.map((p) => Assessment.updateMany({ course: course._id, component: p.key }, { maxMarks: p.max })));
  res.json({ evaluation: course.evaluation, passMarks: course.passMarks });
}));

// Lesson plan: faculty owns it.
r.put('/:id/lesson-plan', allow('faculty', 'admin'), ah(async (req, res) => {
  const course = await courseFor(req.user, req.params.id);
  course.lessonPlan = (req.body.lessonPlan || []).map(({ unit, topic, planned, done }) => ({ unit, topic, planned, done: !!done }));
  await course.save();
  res.json(course.lessonPlan);
}));

export default r;
