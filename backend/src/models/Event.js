import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  type: { type: String, enum: ['holiday', 'event', 'exam', 'other'], default: 'event' },
  start: { type: Date, required: true, index: true },
  end: { type: Date, required: true },
  audience: { type: String, enum: ['all', 'faculty', 'student'], default: 'all' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Event', eventSchema);
