import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Attendance, { PRESENT_CODES } from '../models/Attendance.js';
import Assignment, { Submission } from '../models/Assignment.js';
import Assessment from '../models/Assessment.js';
import Fee from '../models/Fee.js';
import Request from '../models/Request.js';
import Event, { audiencesFor } from '../models/Event.js';
import { Message, Notification } from '../models/Messaging.js';
import { ah } from '../middleware/auth.js';
import { dayStart } from '../utils/access.js';

const r = Router();
const pct = (p, t) => (t ? Math.round((p / t) * 100) : null);

async function attendancePct(match) {
  const [a] = await Attendance.aggregate([
    { $match: match }, { $unwind: '$records' },
    ...(match['records.student'] ? [{ $match: { 'records.student': match['records.student'] } }] : []),
    { $group: { _id: null, t: { $sum: 1 }, p: { $sum: { $cond: [{ $in: ['$records.status', PRESENT_CODES] }, 1, 0] } } } },
  ]);
  return a ? pct(a.p, a.t) : null;
}

const sumFees = async (match) => (await Fee.aggregate([{ $match: match }, { $group: { _id: null, t: { $sum: '$amount' } } }]))[0]?.t || 0;

r.get('/', ah(async (req, res) => {
  const u = req.user;
  const today = dayStart(new Date());
  const aud = audiencesFor(u.role);
  const events = await Event.find({ end: { $gte: today }, audience: { $in: aud } }).sort({ start: 1 }).limit(5).lean();

  if (u.role === 'student') {
    const id = new mongoose.Types.ObjectId(String(u._id));
    const courses = await Course.find({ students: u._id }).select('_id').lean();
    const assignments = await Assignment.find({ course: { $in: courses.map((c) => c._id) }, publishDate: { $lte: new Date() } })
      .populate('course', 'code').sort({ dueDate: 1 }).lean();
    const done = new Set((await Submission.find({ student: u._id }).select('assignment').lean()).map((s) => String(s.assignment)));
    const pending = assignments.filter((a) => !done.has(String(a._id)) && (a.extendedDate || a.dueDate) >= new Date());
    const results = await Assessment.find({ 'marks.student': u._id, status: 'published' }).populate('course', 'code').sort({ date: -1 }).limit(5).lean();
    return res.json({
      role: 'student',
      stats: {
        attendance: await attendancePct({ 'records.student': id }),
        pendingAssignments: pending.length,
        feeDue: await sumFees({ student: id, status: 'pending' }),
        unread: await Notification.countDocuments({ user: u._id, read: false }),
        courses: courses.length,
      },
      pending: pending.slice(0, 5),
      results: results.map((a) => ({ _id: a._id, name: a.name, course: a.course, maxMarks: a.maxMarks,
        marks: a.marks.find((m) => String(m.student) === String(u._id))?.marks })),
      events,
    });
  }

  if (u.role === 'faculty') {
    const courses = await Course.find({ faculty: u._id }).select('code name students lessonPlan').lean();
    const ids = courses.map((c) => c._id);
    const asg = await Assignment.find({ course: { $in: ids } }).select('_id').lean();
    const markedToday = await Attendance.distinct('course', { course: { $in: ids }, date: today });
    return res.json({
      role: 'faculty',
      stats: {
        courses: courses.length,
        students: new Set(courses.flatMap((c) => c.students.map(String))).size,
        pendingEvaluations: await Submission.countDocuments({ assignment: { $in: asg.map((a) => a._id) }, status: 'submitted' }),
        draftMarks: await Assessment.countDocuments({ course: { $in: ids }, status: 'draft' }),
        attendance: await attendancePct({ course: { $in: ids } }),
      },
      courses: courses.map((c) => ({ _id: c._id, code: c.code, name: c.name, students: c.students.length,
        markedToday: markedToday.some((x) => String(x) === String(c._id)),
        progress: c.lessonPlan?.length ? pct(c.lessonPlan.filter((l) => l.done).length, c.lessonPlan.length) : 0 })),
      events,
    });
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [students, faculty, courses, pendingRequests, messagesThisMonth] = await Promise.all([
    User.countDocuments({ role: 'student', active: true }),
    User.countDocuments({ role: 'faculty', active: true }),
    Course.countDocuments(),
    Request.countDocuments({ status: 'pending' }),
    Message.countDocuments({ status: 'sent', sentAt: { $gte: monthStart } }),
  ]);
  res.json({
    role: u.role,
    stats: {
      students, faculty, courses, pendingRequests, messagesThisMonth,
      attendanceToday: await attendancePct({ date: today }),
      feeCollected: await sumFees({ status: 'paid' }),
      feeDue: await sumFees({ status: 'pending' }),
    },
    recentRequests: await Request.find({ status: 'pending' }).populate('student', 'name rollNo').sort({ createdAt: -1 }).limit(5).lean(),
    events,
  });
}));

export default r;
