import { Router } from 'express';
import Event, { audiencesFor } from '../models/Event.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { notifyUsers } from '../utils/notify.js';

const r = Router();

r.get('/events', ah(async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 31 * 864e5);
  const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 62 * 864e5);
  const f = { start: { $lte: to }, end: { $gte: from }, audience: { $in: audiencesFor(req.user.role) } };
  if (req.query.type) f.type = req.query.type;
  res.json(await Event.find(f).sort({ start: 1 }).lean());
}));

r.post('/events', allow('admin', 'staff'), ah(async (req, res) => {
  const { title, description, type, start, end, audience, notify } = req.body;
  if (new Date(end || start) < new Date(start)) throw new HttpError(400, 'End date is before start date');
  const ev = await Event.create({ title, description, type, start, end: end || start, audience, createdBy: req.user._id });
  if (notify) {
    const roles = audience === 'all' ? ['faculty', 'student', 'staff'] : [audience];
    const users = await User.find({ role: { $in: roles }, active: true }).select('_id').lean();
    await notifyUsers(users.map((u) => u._id), { title: `${type === 'holiday' ? 'Holiday' : 'Event'}: ${title}`, body: new Date(start).toDateString(), link: '/calendar' });
  }
  res.status(201).json(ev);
}));

r.put('/events/:id', allow('admin', 'staff'), ah(async (req, res) => {
  const data = Object.fromEntries(['title', 'description', 'type', 'start', 'end', 'audience'].filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]));
  const ev = await Event.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!ev) throw new HttpError(404, 'Event not found');
  res.json(ev);
}));

r.delete('/events/:id', allow('admin', 'staff'), ah(async (req, res) => {
  await Event.findByIdAndDelete(req.params.id);
  res.json({ message: 'Event deleted' });
}));

r.get('/settings', ah(async (_req, res) => res.json(await Settings.getMain())));

r.put('/settings', allow('admin'), ah(async (req, res) => {
  const s = await Settings.getMain();
  ['institutionName', 'academicYear', 'weeklyOffs', 'sessions'].forEach((k) => { if (req.body[k] !== undefined) s[k] = req.body[k]; });
  await s.save();
  res.json(s);
}));

export default r;
