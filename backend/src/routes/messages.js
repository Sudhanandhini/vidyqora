import { Router } from 'express';
import { Template, Message, Notification } from '../models/Messaging.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { courseFor } from '../utils/access.js';
import { dispatch, resolveRecipients } from '../utils/notify.js';

const r = Router();

// ---- Templates ----
r.get('/templates', allow('admin', 'staff', 'faculty'), ah(async (_req, res) => res.json(await Template.find().sort({ name: 1 }).lean())));
const tpl = (b) => Object.fromEntries(['name', 'event', 'channel', 'subject', 'body', 'dltTemplateId', 'active'].filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
r.post('/templates', allow('admin'), ah(async (req, res) => res.status(201).json(await Template.create(tpl(req.body)))));
r.put('/templates/:id', allow('admin'), ah(async (req, res) => {
  const t = await Template.findByIdAndUpdate(req.params.id, tpl(req.body), { new: true, runValidators: true });
  if (!t) throw new HttpError(404, 'Template not found');
  res.json(t);
}));
r.delete('/templates/:id', allow('admin'), ah(async (req, res) => { await Template.findByIdAndDelete(req.params.id); res.json({ message: 'Template deleted' }); }));

// ---- Compose / send ----
async function checkAudience(user, audience) {
  if (!audience?.type) throw new HttpError(400, 'Choose who receives this message');
  if (user.role === 'faculty') {
    if (audience.type !== 'course') throw new HttpError(403, 'Faculty can message their own course students only');
    await courseFor(user, audience.course);
  }
  if (audience.type === 'role' && !audience.roles?.length) throw new HttpError(400, 'Choose at least one group');
  if (audience.type === 'course' && !audience.course) throw new HttpError(400, 'Choose a course');
}

r.post('/preview', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  await checkAudience(req.user, req.body.audience);
  res.json({ recipients: (await resolveRecipients(req.body.audience)).length });
}));

r.post('/', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  const { subject, body, channels, audience, scheduledAt, template } = req.body;
  await checkAudience(req.user, audience);
  if (!channels?.length) throw new HttpError(400, 'Choose at least one channel');
  const msg = await Message.create({ subject, body, channels, audience, template: template || undefined,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(), sentBy: req.user._id });
  if (msg.scheduledAt <= new Date()) await dispatch(msg);
  res.status(201).json(msg);
}));

r.get('/', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  const f = req.user.role === 'faculty' ? { sentBy: req.user._id } : {};
  if (req.query.status) f.status = req.query.status;
  res.json(await Message.find(f).populate('sentBy', 'name role').populate('audience.course', 'code name').sort({ createdAt: -1 }).limit(200).lean());
}));

r.delete('/:id', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  const m = await Message.findById(req.params.id);
  if (!m) throw new HttpError(404, 'Message not found');
  if (m.status !== 'scheduled') throw new HttpError(400, 'Only scheduled messages can be cancelled');
  if (req.user.role === 'faculty' && String(m.sentBy) !== String(req.user._id)) throw new HttpError(403, 'Not your message');
  await m.deleteOne();
  res.json({ message: 'Scheduled message cancelled' });
}));

// ---- Notifications (own inbox) ----
export const notifications = Router();
notifications.get('/', ah(async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(Number(req.query.limit) || 50).lean(),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ items, unread });
}));
notifications.put('/read-all', ah(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ message: 'All marked as read' });
}));
notifications.put('/:id/read', ah(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  res.json({ message: 'Marked as read' });
}));

export default r;
