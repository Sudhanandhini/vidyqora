import { Router } from 'express';
import User from '../models/User.js';
import { ah, protect, signToken, HttpError } from '../middleware/auth.js';
import { accessFor } from '../utils/permissions.js';

const r = Router();
// `access`: sections the admin granted to this user's role, so the app can show those pages
const pub = async (u) => { const o = u.toObject ? u.toObject() : { ...u }; delete o.password; return { ...o, access: await accessFor(o.role) }; };

r.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new HttpError(400, 'Enter email and password');
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
  if (!user || !(await user.matchPassword(password))) throw new HttpError(401, 'Email or password is incorrect');
  if (!user.active) throw new HttpError(403, 'Your account is deactivated. Contact the admin office');
  res.json({ token: signToken(user._id), user: await pub(user) });
}));

r.get('/me', protect, ah(async (req, res) => res.json(await pub(req.user))));

r.put('/profile', protect, ah(async (req, res) => {
  const { phone, name } = req.body;
  const user = await User.findById(req.user._id);
  if (phone !== undefined) user.phone = phone;
  if (name) user.name = name;
  await user.save(); // same format and uniqueness checks as admin edits
  res.json(await pub(user));
}));

r.put('/password', protect, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(currentPassword || ''))) throw new HttpError(400, 'Current password is incorrect');
  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password changed' });
}));

export default r;
