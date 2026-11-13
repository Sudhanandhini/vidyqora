import type { Types } from 'mongoose';

export type Role = 'admin' | 'faculty' | 'student' | 'staff';

/** The signed-in user attached to every request by the `protect` middleware. */
export interface AuthUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: Role;
  /** Set by `grant` when the request runs with admin access granted to this role. */
  actualRole?: Role;
  active: boolean;
  [key: string]: any;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

/** Document shape used by the Mongoose models: fields stay loosely typed so populated refs read naturally. */
export type AnyDoc = Record<string, any>;
