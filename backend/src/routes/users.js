import { Router } from 'express';
import User from '../models/User.js';
import Course from '../models/Course.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { trashRoutes } from '../utils/softDelete.js';

const r = Router();
const FIELDS = ['name', 'email', 'role', 'phone', 'department', 'designation', 'employeeId', 'rollNo', 'level', 'program', 'batch', 'section', 'semester', 'active'];
const pick = (b) => Object.fromEntries(FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));

// Staff or faculty given the Users section (see permissions) manage everyone except admins:
// they cannot create or promote an admin, or change, delete or restore an admin account.
r.use(ah(async (req, _res, next) => {
  if (!req.user.actualRole || req.method === 'GET') return next();
  if (req.body?.role === 'admin') throw new HttpError(403, 'Only an admin can create or promote admins');
  const id = req.path.split('/')[1];
  if (/^[0-9a-f]{24}$/i.test(id || '')) {
    const target = await User.findById(id).setOptions({ withDeleted: true }).select('role').lean();
    if (target?.role === 'admin') throw new HttpError(403, 'Only an admin can change admin accounts');
  }
  next();
}));

trashRoutes(r, User, {
  roles: ['admin'],
  scope: (req) => (req.query.role ? { role: req.query.role } : {}),
  onPurge: (u) => Promise.all([
    Course.updateMany({ students: u._id }, { $pull: { students: u._id } }).setOptions({ withDeleted: true }),
    Course.updateMany({ faculty: u._id }, { $unset: { faculty: 1 } }).setOptions({ withDeleted: true }),
  ]),
});

// Admin and staff can look up users. Faculty see only students enrolled in their own courses
// (faculty -> courses -> students), each tagged with the course codes; `pool=all` lists every
// active student so faculty can pick new ones for a course.
r.get('/', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  const { role, q, batch, section, active } = req.query;
  const f = {};
  let mine = null;
  if (req.user.role === 'faculty') {
    f.role = 'student';
    if (req.query.pool !== 'all') {
      mine = await Course.find({ faculty: req.user._id }).select('code name students').lean();
      f._id = { $in: [...new Set(mine.flatMap((c) => c.students.map(String)))] };
    }
  } else if (role) f.role = role;
  if (batch) f.batch = batch;
  if (section) f.section = section;
  if (active !== undefined && active !== '') f.active = active === 'true';
  if (q) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ name: rx }, { email: rx }, { phone: rx }, { rollNo: rx }, { employeeId: rx }];
  }
  const list = await User.find(f).sort({ role: 1, name: 1 }).limit(500).lean();
  if (!mine) return res.json(list);
  res.json(list.map((u) => ({ ...u, courses: mine.filter((c) => c.students.some((s) => String(s) === String(u._id))).map((c) => ({ _id: c._id, code: c.code, name: c.name })) })));
}));

/** Enrol a new student in courses for their batch/section, plus any course ids picked (faculty: own courses only). */
async function enrolNewStudent(user, picked, by) {
  const match = [];
  // Courses for the student's batch whose other targeting fields are blank or equal to the student's.
  if (user.batch) {
    match.push({ batch: user.batch, $and: ['level', 'program', 'section', 'semester'].map((k) => ({ [k]: { $in: [user[k] || '', '', null] } })) });
  }
  if (Array.isArray(picked) && picked.length) {
    match.push(by.role === 'faculty' ? { _id: { $in: picked }, faculty: by._id } : { _id: { $in: picked } });
  }
  if (!match.length) return 0;
  return (await Course.updateMany({ $or: match }, { $addToSet: { students: user._id } })).matchedCount;
}

// Admin can add any user; faculty can add students only.
r.post('/', allow('admin', 'faculty'), ah(async (req, res) => {
  const data = pick(req.body);
  if (req.user.role === 'faculty') {
    data.role = 'student'; delete data.active;
    // Faculty only see students of their own courses, so a new student must join at least one of them.
    const picked = Array.isArray(req.body.courses) ? req.body.courses : [];
    if (!picked.length || !(await Course.countDocuments({ _id: { $in: picked }, faculty: req.user._id }))) {
      throw new HttpError(400, 'Select at least one of your courses for this student');
    }
  }
  data.password = req.body.password || 'Welcome@123';
  const user = await User.create(data);
  const enrolled = user.role === 'student' ? await enrolNewStudent(user, req.body.courses, req.user) : 0;
  const o = user.toObject(); delete o.password;
  res.status(201).json({ ...o, enrolled });
}));

r.put('/:id', allow('admin'), ah(async (req, res) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) throw new HttpError(404, 'User not found');
  if (req.body.active === false && String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot deactivate your own account');
  Object.assign(user, pick(req.body));
  if (req.body.password) user.password = req.body.password;
  await user.save();
  const o = user.toObject(); delete o.password;
  res.json(o);
}));

// Deleted users disappear from lists and cannot sign in until restored.
r.delete('/:id', allow('admin'), ah(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new HttpError(400, 'You cannot delete your own account');
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  await user.softDelete(req.user);
  res.json({ message: 'User deleted' });
}));

export default r;
