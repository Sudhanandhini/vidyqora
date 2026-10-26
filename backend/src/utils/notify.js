import nodemailer from 'nodemailer';
import User from '../models/User.js';
import Course from '../models/Course.js';
import { Message, Notification } from '../models/Messaging.js';

let transporter = null;
function mailer() {
  if (!process.env.SMTP_HOST) return null;
  transporter ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export async function sendEmail(to, subject, text) {
  const t = mailer();
  if (!t || !to) return false;
  await t.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
  return true;
}

export async function sendSms(to, message) {
  if (!to) return false;
  if (!process.env.SMS_API_URL) { console.log(`[SMS] ${to}: ${message}`); return true; }
  const r = await fetch(process.env.SMS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_API_KEY}` },
    body: JSON.stringify({ to, message }),
  });
  return r.ok;
}

/** In-app notifications for a list of user ids. */
export async function notifyUsers(userIds, { title, body, link }) {
  if (!userIds?.length) return 0;
  const docs = userIds.map((user) => ({ user, title, body, link }));
  await Notification.insertMany(docs, { ordered: false });
  return docs.length;
}

export const fill = (text, u) => String(text || '')
  .replace(/\{name\}/g, u.name || '')
  .replace(/\{rollNo\}/g, u.rollNo || '')
  .replace(/\{email\}/g, u.email || '');

export async function resolveRecipients(audience) {
  const sel = 'name email phone rollNo';
  if (audience.type === 'course') {
    const c = await Course.findById(audience.course).populate('students', sel).lean();
    return c ? c.students : [];
  }
  if (audience.type === 'users') return User.find({ _id: { $in: audience.users }, active: true }).select(sel).lean();
  return User.find({ role: { $in: audience.roles || [] }, active: true }).select(sel).lean();
}

/** Deliver a Message document through its channels. */
export async function dispatch(msg) {
  const users = await resolveRecipients(msg.audience);
  const stats = { recipients: users.length, inapp: 0, email: 0, sms: 0, push: 0, failed: 0 };
  try {
    if (msg.channels.includes('inapp') || msg.channels.includes('push')) {
      await Notification.insertMany(users.map((u) => ({ user: u._id, from: msg.sentBy, title: fill(msg.subject, u), body: fill(msg.body, u) })));
      stats.inapp = users.length;
      // Push: wire Firebase Cloud Messaging here using stored device tokens.
      if (msg.channels.includes('push')) stats.push = users.length;
    }
    for (const u of users) {
      if (msg.channels.includes('email')) {
        try { if (await sendEmail(u.email, fill(msg.subject, u), fill(msg.body, u))) stats.email++; } catch { stats.failed++; }
      }
      if (msg.channels.includes('sms')) {
        try { if (await sendSms(u.phone, fill(msg.body, u))) stats.sms++; } catch { stats.failed++; }
      }
    }
    msg.status = 'sent';
  } catch (e) {
    msg.status = 'failed';
    msg.error = e.message;
  }
  msg.stats = stats;
  msg.sentAt = new Date();
  await msg.save();
  return msg;
}

/** Sends scheduled messages that are due. Runs every minute. */
export function startScheduler() {
  const tick = async () => {
    try {
      const due = await Message.find({ status: 'scheduled', scheduledAt: { $lte: new Date() } }).limit(20);
      for (const m of due) await dispatch(m);
    } catch (e) { console.error('Scheduler:', e.message); }
  };
  setInterval(tick, 60_000).unref();
}
