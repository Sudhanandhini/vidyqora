import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Course from './models/Course.js';
import Attendance from './models/Attendance.js';
import Assignment, { Submission } from './models/Assignment.js';
import Assessment from './models/Assessment.js';
import Event from './models/Event.js';
import Settings from './models/Settings.js';
import { Template, Message, Notification } from './models/Messaging.js';
import Fee from './models/Fee.js';
import Request from './models/Request.js';

const day = (offset) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };

await connectDB();
await Promise.all([User, Course, Attendance, Assignment, Submission, Assessment, Event, Settings, Template, Message, Notification, Fee, Request]
  .map((m) => m.deleteMany({})));

const mk = (d) => new User(d).save();
const admin = await mk({ name: 'Admin Office', email: 'admin@vidyqora.edu', password: 'Admin@123', role: 'admin', employeeId: 'EMP001' });
await mk({ name: 'Ravi Shankar', email: 'staff@vidyqora.edu', password: 'Staff@123', role: 'staff', employeeId: 'EMP010', department: 'Accounts' });
const f1 = await mk({ name: 'Dr. Meera Iyer', email: 'meera@vidyqora.edu', password: 'Faculty@123', role: 'faculty', employeeId: 'EMP101', department: 'Computer Science', designation: 'Associate Professor', phone: '9800000001' });
const f2 = await mk({ name: 'Prof. Arjun Rao', email: 'arjun@vidyqora.edu', password: 'Faculty@123', role: 'faculty', employeeId: 'EMP102', department: 'Mathematics', designation: 'Assistant Professor', phone: '9800000002' });

const names = ['Aarav Sharma', 'Diya Nair', 'Ishaan Gupta', 'Ananya Reddy', 'Kabir Menon', 'Saanvi Patel', 'Vihaan Kulkarni', 'Myra Joseph',
  'Reyansh Das', 'Kiara Pillai', 'Aditya Bhat', 'Navya Hegde'];
const students = [];
for (const [i, name] of names.entries()) {
  students.push(await mk({ name, email: i === 0 ? 'student@vidyqora.edu' : `${name.split(' ')[0].toLowerCase()}@vidyqora.edu`,
    password: 'Student@123', role: 'student', rollNo: `BCA24${String(i + 1).padStart(3, '0')}`, program: 'BCA', batch: '2024', section: 'A',
    phone: `98100000${String(i + 10)}` }));
}
const ids = students.map((s) => s._id);

const plan = (topics) => topics.map((t, i) => ({ unit: `Unit ${Math.floor(i / 2) + 1}`, topic: t, planned: day(-20 + i * 5), done: i < topics.length / 2 }));
const c1 = await Course.create({ code: 'BCA301', name: 'Data Structures', department: 'Computer Science', program: 'BCA', batch: '2024', section: 'A', credits: 4, faculty: f1._id, students: ids,
  lessonPlan: plan(['Arrays and complexity', 'Linked lists', 'Stacks', 'Queues', 'Trees', 'Graphs']) });
const c2 = await Course.create({ code: 'BCA302', name: 'Database Systems', department: 'Computer Science', program: 'BCA', batch: '2024', section: 'A', credits: 4, faculty: f1._id, students: ids,
  lessonPlan: plan(['ER modelling', 'Relational algebra', 'SQL basics', 'Normalisation']) });
const c3 = await Course.create({ code: 'MAT301', name: 'Discrete Mathematics', department: 'Mathematics', program: 'BCA', batch: '2024', section: 'A', credits: 3, faculty: f2._id, students: ids });

// Attendance for the last 8 weekdays
for (let o = -12; o <= 0; o++) {
  const d = day(o); if ([0, 6].includes(d.getUTCDay())) continue;
  for (const c of [c1, c2, c3]) {
    await Attendance.create({ course: c._id, date: d, period: 1, markedBy: c.faculty,
      records: ids.map((s, i) => ({ student: s, status: (i + o) % 9 === 0 ? 'A' : (i + o) % 13 === 0 ? 'L' : 'P' })) });
  }
}

const a1 = await Assignment.create({ course: c1._id, title: 'Implement a stack using linked list', description: 'Submit source code and a short note on time complexity.',
  topic: 'Stacks', publishDate: day(-6), dueDate: day(4), maxMarks: 10, createdBy: f1._id });
await Assignment.create({ course: c2._id, title: 'Normalise the library schema to 3NF', description: 'Show each step with functional dependencies.',
  topic: 'Normalisation', publishDate: day(-2), dueDate: day(7), maxMarks: 20, createdBy: f1._id });
const a3 = await Assignment.create({ course: c3._id, title: 'Problem set 2: Graph theory', publishDate: day(-15), dueDate: day(-5), maxMarks: 15, createdBy: f2._id });
for (const [i, s] of ids.slice(1, 7).entries()) {
  await Submission.create({ assignment: a1._id, student: s, text: 'Submitted via portal.', submittedAt: day(-1) });
  await Submission.create({ assignment: a3._id, student: s, text: 'Answers attached.', submittedAt: day(-6), status: 'evaluated', marks: 9 + (i % 6), remarks: 'Good work', evaluatedBy: f2._id });
}

await Assessment.create({ course: c1._id, name: 'Internal Test 1', maxMarks: 25, date: day(-10), status: 'published', createdBy: f1._id,
  marks: ids.map((s, i) => ({ student: s, marks: 12 + ((i * 7) % 13), absent: false })) });
await Assessment.create({ course: c3._id, name: 'Quiz 1', maxMarks: 10, date: day(-8), status: 'published', createdBy: f2._id,
  marks: ids.map((s, i) => ({ student: s, marks: i === 4 ? undefined : 4 + ((i * 3) % 7), absent: i === 4 })) });
await Assessment.create({ course: c2._id, name: 'Internal Test 1', maxMarks: 25, date: day(2), status: 'draft', createdBy: f1._id, marks: ids.map((s) => ({ student: s })) });

await Settings.create({ key: 'main', institutionName: process.env.INSTITUTION_NAME || 'Vidyqora Institute', weeklyOffs: [0],
  academicYear: { label: '2026-27', start: new Date('2026-06-01'), end: new Date('2027-04-30') },
  sessions: [{ name: 'Period 1', start: '09:00', end: '09:50' }, { name: 'Period 2', start: '09:50', end: '10:40' }, { name: 'Break', start: '10:40', end: '11:00', isBreak: true },
    { name: 'Period 3', start: '11:00', end: '11:50' }, { name: 'Period 4', start: '11:50', end: '12:40' }, { name: 'Lunch', start: '12:40', end: '13:30', isBreak: true },
    { name: 'Period 5', start: '13:30', end: '14:20' }, { name: 'Period 6', start: '14:20', end: '15:10' }] });

await Event.insertMany([
  { title: 'Deepavali', type: 'holiday', start: day(5), end: day(6), audience: 'all', createdBy: admin._id },
  { title: 'Kannada Rajyotsava', type: 'holiday', start: day(13), end: day(13), audience: 'all', createdBy: admin._id },
  { title: 'Internal Assessment Week', type: 'exam', start: day(16), end: day(20), audience: 'all', createdBy: admin._id },
  { title: 'Faculty development programme', type: 'event', start: day(9), end: day(9), audience: 'faculty', createdBy: admin._id },
  { title: 'Annual sports day', type: 'event', start: day(24), end: day(24), audience: 'all', createdBy: admin._id },
]);

await Template.insertMany([
  { name: 'Absence alert', event: 'attendance.absent', channel: 'sms', body: 'Dear {name}, you were marked absent today. Contact your class teacher if this is incorrect.' },
  { name: 'Fee reminder', event: 'fee.due', channel: 'email', subject: 'Fee payment reminder', body: 'Dear {name}, your fee payment is due. Pay online from the student portal.' },
  { name: 'Assignment deadline', event: 'assignment.due', channel: 'inapp', subject: 'Assignment due soon', body: 'Dear {name}, an assignment is due in 2 days.' },
  { name: 'Holiday notice', event: 'calendar.holiday', channel: 'inapp', subject: 'Holiday notice', body: 'The institution will remain closed on the declared holiday.' },
]);

await Fee.insertMany(ids.flatMap((s, i) => [
  { student: s, title: 'Tuition fee - Term 1', term: 'Term 1', amount: 45000, dueDate: day(-30), status: 'paid', paidAt: day(-32), mode: 'Online', txnId: `TXN${1000 + i}`, receiptNo: `VQ${20000 + i}` },
  { student: s, title: 'Tuition fee - Term 2', term: 'Term 2', amount: 45000, dueDate: day(15), status: i % 3 === 0 ? 'paid' : 'pending', ...(i % 3 === 0 && { paidAt: day(-1), mode: 'Online', txnId: `TXN${2000 + i}`, receiptNo: `VQ${30000 + i}` }) },
  { student: s, title: 'Examination fee', term: 'Term 2', amount: 2500, dueDate: day(10) },
]));

await Request.insertMany([
  { student: ids[0], type: 'Bonafide certificate', details: 'Required for bank education loan.' },
  { student: ids[2], type: 'ID card', details: 'Lost my ID card, need a duplicate.' },
  { student: ids[5], type: 'Profile correction', details: 'Date of birth is wrong in records.', status: 'completed', remarks: 'Corrected', handledBy: admin._id },
]);

await Notification.insertMany([
  { user: ids[0], title: 'Welcome to Vidyqora', body: 'Check your attendance, assignments and fees from the menu.' },
  { user: f1._id, title: 'Welcome to Vidyqora', body: 'Mark attendance and post assignments for your courses.' },
]);

console.log(`Seeded.
  Admin    admin@vidyqora.edu   / Admin@123
  Staff    staff@vidyqora.edu   / Staff@123
  Faculty  meera@vidyqora.edu   / Faculty@123
  Student  student@vidyqora.edu / Student@123`);
await mongoose.disconnect();
