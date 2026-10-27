import mongoose from 'mongoose';
import softDelete from '../utils/softDelete.js';

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  type: { type: String, enum: ['holiday', 'event', 'exam', 'other'], default: 'event' },
  start: { type: Date, required: true, index: true },
  end: { type: Date, required: true },
  audience: { type: String, enum: ['all', 'faculty', 'student', 'staff'], default: 'all' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

/** Audiences a role may see. Admin and office staff manage the calendar, so they see every event. */
export const audiencesFor = (role) => (role === 'faculty' ? ['all', 'faculty'] : role === 'student' ? ['all', 'student'] : ['all', 'faculty', 'student', 'staff']);

eventSchema.plugin(softDelete);

export default mongoose.model('Event', eventSchema);
