import { Router } from 'express';
import { Template, Message, Notification } from '../models/Messaging.js';
import Course from '../models/Course.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { courseFor } from '../utils/access.js';
import { dispatch, resolveRecipients } from '../utils/notify.js';
import { trashRoutes } from '../utils/softDelete.js';

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
r.delete('/templates/:id', allow('admin'), ah(async (req, res) => {
  const t = await Template.findById(req.params.id);
  if (!t) throw new HttpError(404, 'Template not found');
  await t.softDelete(req.user);
  res.json({ message: 'Template deleted' });
}));
trashRoutes(r, Template, { base: '/templates', roles: ['admin'] });

// Faculty see and manage only the messages they sent.
const ownMessage = (req, m) => {
  if (req.user.role === 'faculty' && String(m.sentBy?._id || m.sentBy) !== String(req.user._id)) throw new HttpError(403, 'Not your message');
};
trashRoutes(r, Message, {
  roles: ['admin', 'staff', 'faculty'],
  scope: (req) => (req.user.role === 'faculty' ? { sentBy: req.user._id } : {}),
  populate: [['sentBy', 'name role'], ['audience.course', 'code name'], ['audience.users', 'name']],
  check: async (req, m) => ownMessage(req, m),
});

// ---- Compose / send ----
async function checkAudience(user, audience) {
  if (!audience?.type) throw new HttpError(400, 'Choose who receives this message');
  if (audience.type === 'role' && !audience.roles?.length) throw new HttpError(400, 'Choose at least one group');
  if (audience.type === 'course' && !audience.course) throw new HttpError(400, 'Choose a course');
  if (audience.type === 'users' && !audience.users?.length) throw new HttpError(400, 'Choose at least one student');
  if (user.role === 'faculty') {
    if (audience.type === 'course') await courseFor(user, audience.course);
    else if (audience.type === 'users') {
      const mine = new Set((await Course.find({ faculty: user._id }).select('students').lean()).flatMap((c) => c.students.map(String)));
      if (!audience.users.every((id) => mine.has(String(id)))) throw new HttpError(403, 'Faculty can message students of their own courses only');
    } else throw new HttpError(403, 'Faculty can message their own course students only');
  }
}

r.post('/preview', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  await checkAudience(req.user, req.body.audience);
  res.json({ recipients: (await resolveRecipients(req.body.audience)).length });
}));

// Keep only the fields of the chosen audience type; the form also sends the unused ones (e.g. course: '').
const cleanAudience = ({ type, roles, course, users }) => ({ type,
  ...(type === 'role' && { roles }), ...(type === 'course' && { course }), ...(type === 'users' && { users }) });

r.post('/', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  const { subject, body, channels, scheduledAt, template } = req.body;
  await checkAudience(req.user, req.body.audience);
  const audience = cleanAudience(req.body.audience);
  if (!channels?.length) throw new HttpError(400, 'Choose at least one channel');
  const msg = await Message.create({ subject, body, channels, audience, template: template || undefined,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(), sentBy: req.user._id });
  if (msg.scheduledAt <= new Date()) await dispatch(msg);
  res.status(201).json(msg);
}));

r.get('/', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  const f = req.user.role === 'faculty' ? { sentBy: req.user._id } : {};
  if (req.query.status) f.status = req.query.status;
  res.json(await Message.find(f).populate('sentBy', 'name role').populate('audience.course', 'code name').populate('audience.users', 'name').sort({ createdAt: -1 }).limit(200).lean());
}));

r.delete('/:id', allow('admin', 'staff', 'faculty'), ah(async (req, res) => {
  const m = await Message.findById(req.params.id);
  if (!m) throw new HttpError(404, 'Message not found');
  ownMessage(req, m);
  await m.softDelete(req.user); // a deleted scheduled message is not sent unless restored
  res.json({ message: m.status === 'scheduled' ? 'Scheduled message cancelled' : 'Message deleted' });
}));

// ---- Notifications (own inbox) ----
export const notifications = Router();
notifications.get('/', ah(async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).populate('from', 'name role').sort({ createdAt: -1 }).limit(Number(req.query.limit) || 50).lean(),
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
