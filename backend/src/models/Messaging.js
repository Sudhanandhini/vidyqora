import mongoose from 'mongoose';

export const CHANNELS = ['inapp', 'email', 'sms', 'push'];

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  event: { type: String, trim: true },
  channel: { type: String, enum: CHANNELS, default: 'inapp' },
  subject: String,
  body: { type: String, required: true },
  dltTemplateId: String,
  active: { type: Boolean, default: true },
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  body: { type: String, required: true },
  channels: { type: [{ type: String, enum: CHANNELS }], default: ['inapp'] },
  audience: {
    type: { type: String, enum: ['role', 'course', 'users'], default: 'role' },
    roles: [String],
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  scheduledAt: Date,
  status: { type: String, enum: ['scheduled', 'sent', 'failed'], default: 'scheduled', index: true },
  sentAt: Date,
  stats: { recipients: Number, inapp: Number, email: Number, sms: Number, push: Number, failed: Number },
  error: String,
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // sender, for messages (absent on system alerts)
  title: { type: String, required: true },
  body: String,
  link: String,
  read: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export const Template = mongoose.model('Template', templateSchema);
export const Message = mongoose.model('Message', messageSchema);
export const Notification = mongoose.model('Notification', notificationSchema);
