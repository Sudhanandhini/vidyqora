import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { accessFor } from '../utils/permissions.js';

export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const protect = ah(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw new HttpError(401, 'Sign in to continue');
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { throw new HttpError(401, 'Session expired. Sign in again'); }
  const user = await User.findById(payload.id).lean();
  if (!user || !user.active) throw new HttpError(401, 'Account not active');
  req.user = user;
  next();
});

export const allow = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have access to this action'));

/**
 * Mounted in front of a section's router: if the admin granted this section to the user's role,
 * the request runs with admin access (`actualRole` keeps the real one) for this section only.
 */
export const grant = (section) => ah(async (req, _res, next) => {
  if ((await accessFor(req.user.role)).includes(section)) req.user = { ...req.user, role: 'admin', actualRole: req.user.role };
  next();
});

export const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });
