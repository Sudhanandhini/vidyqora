import { Router } from 'express';
import User from '../models/User.js';
import { ah, allow, HttpError } from '../middleware/auth.js';

const r = Router();
const FIELDS = ['name', 'email', 'role', 'phone', 'department', 'designation', 'employeeId', 'rollNo', 'program', 'batch', 'section', 'active'];
const pick = (b) => Object.fromEntries(FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));

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
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ name: rx }, { email: rx }, { rollNo: rx }, { employeeId: rx }];
  }
  res.json(await User.find(f).sort({ role: 1, name: 1 }).limit(500).lean());
}));

r.post('/', allow('admin'), ah(async (req, res) => {
  const data = pick(req.body);
  data.password = req.body.password || 'Welcome@123';
  const user = await User.create(data);
  const o = user.toObject(); delete o.password;
  res.status(201).json(o);
}));

r.put('/:id', allow('admin'), ah(async (req, res) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) throw new HttpError(404, 'User not found');
  Object.assign(user, pick(req.body));
  if (req.body.password) user.password = req.body.password;
  await user.save();
  const o = user.toObject(); delete o.password;
  res.json(o);
}));

r.delete('/:id', allow('admin'), ah(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new HttpError(400, 'You cannot deactivate your own account');
  await User.findByIdAndUpdate(req.params.id, { active: false });
  res.json({ message: 'User deactivated' });
}));

export default r;
