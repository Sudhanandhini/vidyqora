import Course from '../models/Course.js';
import { HttpError } from '../middleware/auth.js';

/** Load a course and ensure the user may work with it. */
export async function courseFor(user, courseId, { populate = false } = {}) {
  let q = Course.findById(courseId);
  if (populate) q = q.populate('students', 'name rollNo email phone level program batch section semester').populate('faculty', 'name email');
  const course = await q;
  if (!course) throw new HttpError(404, 'Course not found');
  const facultyId = String(course.faculty?._id || course.faculty);
  if (user.role === 'faculty' && facultyId !== String(user._id)) throw new HttpError(403, 'This course is not assigned to you');
  if (user.role === 'student' && !course.students.some((s) => String(s._id || s) === String(user._id))) {
    throw new HttpError(403, 'You are not enrolled in this course');
  }
  return course;
}

/** Course filter for list endpoints, by role. */
export function courseScope(user) {
  if (user.role === 'faculty') return { faculty: user._id };
  if (user.role === 'student') return { students: user._id };
  return {};
}

export const dayStart = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
