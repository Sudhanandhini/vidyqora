import { Router } from 'express';
import crypto from 'crypto';
import Fee from '../models/Fee.js';
import User from '../models/User.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { notifyUsers } from '../utils/notify.js';

const r = Router();

r.get('/', ah(async (req, res) => {
  const f = {};
  if (req.user.role === 'student') f.student = req.user._id;
  else if (!['admin', 'staff'].includes(req.user.role)) throw new HttpError(403, 'No access');
  if (req.query.status) f.status = req.query.status;
  if (req.query.student && req.user.role !== 'student') f.student = req.query.student;
  const list = await Fee.find(f).populate('student', 'name rollNo batch section').sort({ dueDate: 1 }).limit(1000).lean();
  const sum = (s) => list.filter((x) => x.status === s).reduce((t, x) => t + x.amount, 0);
  res.json({ items: list, totals: { paid: sum('paid'), pending: sum('pending') } });
}));

// Create for one student or for a whole batch/section
r.post('/', allow('admin', 'staff'), ah(async (req, res) => {
  const { student, batch, section, title, term, amount, dueDate } = req.body;
  let ids = [];
  if (student) ids = [student];
  else if (batch) ids = (await User.find({ role: 'student', active: true, batch, ...(section && { section }) }).select('_id').lean()).map((u) => u._id);
  if (!ids.length) throw new HttpError(400, 'No students match this selection');
  const docs = await Fee.insertMany(ids.map((s) => ({ student: s, title, term, amount, dueDate })));
  await notifyUsers(ids, { title: `Fee due: ${title}`, body: `Rs. ${Number(amount).toLocaleString('en-IN')} due ${dueDate ? new Date(dueDate).toDateString() : ''}`, link: '/fees' });
  res.status(201).json({ created: docs.length });
}));

r.delete('/:id', allow('admin'), ah(async (req, res) => {
  const fee = await Fee.findById(req.params.id);
  if (!fee) throw new HttpError(404, 'Fee not found');
  if (fee.status === 'paid') throw new HttpError(400, 'Paid fees cannot be deleted');
  await fee.deleteOne();
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
