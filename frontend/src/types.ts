export type Role = 'admin' | 'faculty' | 'student' | 'staff';

/** The signed-in user, as returned by /auth/login and /auth/me. */
export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  /** Real role when a granted section runs with admin access (see AsAdmin). */
  actualRole?: Role;
  /** Sections the admin granted to this user's role. */
  access?: string[];
  phone?: string;
  department?: string;
  designation?: string;
  employeeId?: string;
  rollNo?: string;
  level?: string;
  program?: string;
  batch?: string;
  section?: string;
  semester?: string;
  active?: boolean;
  [key: string]: any;
}
