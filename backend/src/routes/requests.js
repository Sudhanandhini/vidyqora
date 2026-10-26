import { Router } from 'express';
import Request, { REQUEST_TYPES } from '../models/Request.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { notifyUsers } from '../utils/notify.js';

const r = Router();

r.get('/types', (_req, res) => res.json(REQUEST_TYPES));

r.get('/', ah(async (req, res) => {
  const f = {};
  if (req.user.role === 'student') f.student = req.user._id;
  else if (!['admin', 'staff'].includes(req.user.role)) throw new HttpError(403, 'No access');
  if (req.query.status) f.status = req.query.status;
  res.json(await Request.find(f).populate('student', 'name rollNo batch section').populate('handledBy', 'name').sort({ createdAt: -1 }).limit(500).lean());
}));

r.post('/', allow('student'), ah(async (req, res) => {
  const { type, details } = req.body;
  res.status(201).json(await Request.create({ student: req.user._id, type, details }));
}));

r.put('/:id', allow('admin', 'staff'), ah(async (req, res) => {
  const rq = await Request.findById(req.params.id);
  if (!rq) throw new HttpError(404, 'Request not found');
  const { status, remarks } = req.body;
  Object.assign(rq, { status, remarks, handledBy: req.user._id });
  await rq.save();
  await notifyUsers([rq.student], { title: `Request ${status}: ${rq.type}`, body: remarks, link: '/requests' });
  res.json(rq);
}));

export default r;
