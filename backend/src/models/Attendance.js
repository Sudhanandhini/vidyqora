import mongoose from 'mongoose';

export const ATT_CODES = ['P', 'A', 'L', 'OD', 'LT'];
export const PRESENT_CODES = ['P', 'OD', 'LT'];

const attendanceSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  date: { type: Date, required: true },
  period: { type: Number, default: 1, min: 1, max: 12 },
  topic: String,
  records: [{
    _id: false,
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ATT_CODES, default: 'P' },
  }],
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

attendanceSchema.index({ course: 1, date: 1, period: 1 }, { unique: true });
attendanceSchema.index({ 'records.student': 1 });

export default mongoose.model('Attendance', attendanceSchema);
