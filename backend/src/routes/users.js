import { Router } from 'express';
import User from '../models/User.js';
import Course from '../models/Course.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { trashRoutes } from '../utils/softDelete.js';

const r = Router();
const FIELDS = ['name', 'email', 'role', 'phone', 'department', 'designation', 'employeeId', 'rollNo', 'level', 'program', 'batch', 'section', 'semester', 'active'];
const pick = (b) => Object.fromEntries(FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));

trashRoutes(r, User, {
  roles: ['admin'],
  scope: (req) => (req.query.role ? { role: req.query.role } : {}),
  onPurge: (u) => Promise.all([
    Course.updateMany({ students: u._id }, { $pull: { students: u._id } }).setOptions({ withDeleted: true }),
    Course.updateMany({ faculty: u._id }, { $unset: { faculty: 1 } }).setOptions({ withDeleted: true }),
  ]),
});

// Admin and staff can look up users; faculty can look up students only.
r.get('/', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  const { role, q, batch, section, active } = req.query;
  const f = {};
  if (req.user.role === 'faculty') f.role = 'student';
  else if (role) f.role = role;
  if (batch) f.batch = batch;
  if (section) f.section = section;
  if (active !== undefined && active !== '') f.active = active === 'true';
  if (q) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ name: rx }, { email: rx }, { phone: rx }, { rollNo: rx }, { employeeId: rx }];
  }
  res.json(await User.find(f).sort({ role: 1, name: 1 }).limit(500).lean());
}));

/** Enrol a new student in courses for their batch/section, plus any course ids picked (faculty: own courses only). */
async function enrolNewStudent(user, picked, by) {
  const match = [];
  if (user.batch) match.push({ batch: user.batch, section: { $in: [user.section || '', '', null] } });
  if (Array.isArray(picked) && picked.length) {
    match.push(by.role === 'faculty' ? { _id: { $in: picked }, faculty: by._id } : { _id: { $in: picked } });
  }
  if (!match.length) return 0;
  return (await Course.updateMany({ $or: match }, { $addToSet: { students: user._id } })).matchedCount;
}

// Admin can add any user; faculty can add students only.
r.post('/', allow('admin', 'faculty'), ah(async (req, res) => {
  const data = pick(req.body);
  if (req.user.role === 'faculty') { data.role = 'student'; delete data.active; }
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
