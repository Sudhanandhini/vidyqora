import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { accessFor } from '../utils/permissions.js';
import type { AuthUser, Role } from '../types.js';

const secret = (): string => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return process.env.JWT_SECRET;
};

/** Wraps an async route handler so a rejected promise reaches the error handler. */
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export const protect = ah(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw new HttpError(401, 'Sign in to continue');
  let payload: { id: string };
  try { payload = jwt.verify(token, secret()) as { id: string }; }
  catch { throw new HttpError(401, 'Session expired. Sign in again'); }
  const user = await User.findById(payload.id).lean<AuthUser>();
  if (!user || !user.active) throw new HttpError(401, 'Account not active');
  req.user = user;
  next();
});

export const allow = (...roles: Role[]): RequestHandler => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have access to this action'));

/**
 * Mounted in front of a section's router: if the admin granted this section to the user's role,
 * the request runs with admin access (`actualRole` keeps the real one) for this section only.
 */
export const grant = (section: string) => ah(async (req, _res, next) => {
  if ((await accessFor(req.user.role)).includes(section)) req.user = { ...req.user, role: 'admin', actualRole: req.user.role };
  next();
});

export const signToken = (id: unknown) =>
  jwt.sign({ id: String(id) }, secret(), { expiresIn: (process.env.JWT_EXPIRES || '7d') as jwt.SignOptions['expiresIn'] });
