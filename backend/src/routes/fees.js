import { Router } from 'express';
import crypto from 'crypto';
import Fee from '../models/Fee.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { notifyUsers } from '../utils/notify.js';
import { trashRoutes } from '../utils/softDelete.js';

const r = Router();
trashRoutes(r, Fee, { roles: ['admin'], populate: [['student', 'name email phone rollNo batch section']] });

r.get('/', ah(async (req, res) => {
  const f = {};
  if (req.user.role === 'student') f.student = req.user._id;
  else if (!['admin', 'staff'].includes(req.user.role)) throw new HttpError(403, 'No access');
  if (req.query.status) f.status = req.query.status;
  if (req.query.student && req.user.role !== 'student') f.student = req.query.student;
  // withDeleted: fees of a removed student still show who they belong to. Paid list shows the latest payment first.
  const list = await Fee.find(f).populate({ path: 'student', select: 'name email phone rollNo department batch section deletedAt', options: { withDeleted: true } })
    .sort(f.status === 'paid' ? { paidAt: -1 } : { dueDate: 1 }).limit(1000).lean();
  const sum = (s) => list.filter((x) => x.status === s).reduce((t, x) => t + x.amount, 0);
  res.json({ items: list, totals: { paid: sum('paid'), pending: sum('pending') } });
}));

// Students a fee goes to: one student, everyone enrolled in a course, or a whole batch/section.
async function targets({ student, course, batch, section }) {
  if (student) return [student];
  if (course) {
    const c = await Course.findById(course).select('students').lean();
    if (!c) throw new HttpError(404, 'Course not found');
    return (await User.find({ _id: { $in: c.students }, role: 'student', active: true }).select('_id').lean()).map((u) => u._id);
  }
  if (batch) return (await User.find({ role: 'student', active: true, batch, ...(section && { section }) }).select('_id').lean()).map((u) => u._id);
  return [];
}

// Create for one student, a course's students or a whole batch/section
r.post('/', allow('admin', 'staff'), ah(async (req, res) => {
  const { title, term, amount, dueDate } = req.body;
  const ids = await targets(req.body);
  if (!ids.length) throw new HttpError(400, 'No students match this selection');
  const docs = await Fee.insertMany(ids.map((s) => ({ student: s, title, term, amount, dueDate })));
  await notifyUsers(ids, { title: `Fee due: ${title}`, body: `Rs. ${Number(amount).toLocaleString('en-IN')} due ${dueDate ? new Date(dueDate).toDateString() : ''}`, link: '/fees' });
  res.status(201).json({ created: docs.length });
}));

// Several fees at once from the student and course forms: { student | course, fees: [{ title, term, amount, dueDate }] }.
// A student who already has the same fee and term (not deleted) is skipped, so saving a form twice doesn't charge twice.
r.post('/assign', allow('admin', 'staff'), ah(async (req, res) => {
  const fees = (req.body.fees || []).filter((x) => String(x.title || '').trim());
  for (const x of fees) if (!(Number(x.amount) >= 0) || x.amount === '' || x.amount == null) throw new HttpError(400, `Enter an amount for ${x.title}`);
  const ids = fees.length ? await targets(req.body) : [];
  if (!ids.length) return res.json({ created: 0, skipped: 0, students: 0 });
  const existing = await Fee.find({ student: { $in: ids }, title: { $in: fees.map((x) => x.title.trim()) } }).select('student title term').lean();
  const have = new Set(existing.map((e) => `${e.student}|${e.title}|${e.term || ''}`));
  const docs = [];
  for (const s of ids) for (const x of fees) {
    const doc = { student: s, title: x.title.trim(), term: x.term || undefined, amount: Number(x.amount), dueDate: x.dueDate || undefined };
    if (!have.has(`${s}|${doc.title}|${doc.term || ''}`)) docs.push(doc);
  }
  if (docs.length) await Fee.insertMany(docs);
  const charged = [...new Set(docs.map((d) => String(d.student)))];
  await Promise.all(charged.map((s) => {
    const mine = docs.filter((d) => String(d.student) === s);
    return notifyUsers([s], { title: mine.length === 1 ? `Fee due: ${mine[0].title}` : `${mine.length} fees due`,
      body: mine.map((d) => `${d.title}: Rs. ${d.amount.toLocaleString('en-IN')}${d.dueDate ? ` due ${new Date(d.dueDate).toDateString()}` : ''}`).join('\n'), link: '/fees' });
  }));
  res.status(201).json({ created: docs.length, skipped: ids.length * fees.length - docs.length, students: charged.length });
}));

r.delete('/:id', allow('admin'), ah(async (req, res) => {
  const fee = await Fee.findById(req.params.id);
  if (!fee) throw new HttpError(404, 'Fee not found');
  if (fee.status === 'paid') throw new HttpError(400, 'Paid fees cannot be deleted');
  await fee.softDelete(req.user);
  res.json({ message: 'Fee deleted' });
}));

/**
 * Online payment. In production replace the body with a gateway order (Razorpay/PayU):
 * 1) create order server-side, 2) open checkout on client, 3) verify signature in a webhook, then mark paid.
 * Here the payment is recorded directly so the flow can be tested end to end.
 */
r.post('/:id/pay', allow('student'), ah(async (req, res) => {
  const fee = await Fee.findOne({ _id: req.params.id, student: req.user._id });
  if (!fee) throw new HttpError(404, 'Fee not found');
  if (fee.status === 'paid') throw new HttpError(400, 'This fee is already paid');
  fee.status = 'paid';
  fee.paidAt = new Date();
  fee.mode = req.body.mode || 'Online';
  fee.txnId = 'TXN' + crypto.randomBytes(5).toString('hex').toUpperCase();
  fee.receiptNo = 'VQ' + Date.now().toString().slice(-8);
  await fee.save();
  await notifyUsers([req.user._id], { title: 'Payment received', body: `${fee.title}: Rs. ${fee.amount.toLocaleString('en-IN')}, receipt ${fee.receiptNo}`, link: '/fees' });
  res.json(fee);
}));

// Counter payment recorded by office
r.post('/:id/record', allow('admin', 'staff'), ah(async (req, res) => {
  const fee = await Fee.findById(req.params.id);
  if (!fee) throw new HttpError(404, 'Fee not found');
  if (fee.status === 'paid') throw new HttpError(400, 'This fee is already paid');
  Object.assign(fee, { status: 'paid', paidAt: new Date(), mode: req.body.mode || 'Cash', txnId: req.body.reference,
    receiptNo: 'VQ' + Date.now().toString().slice(-8) });
  await fee.save();
  res.json(fee);
}));

export default r;
