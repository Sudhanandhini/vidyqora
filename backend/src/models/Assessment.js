import mongoose from 'mongoose';
import softDelete from '../utils/softDelete.js';

const assessmentSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  name: { type: String, required: true, trim: true },
  maxMarks: { type: Number, required: true, min: 1 },
  date: Date,
  marks: [{
    _id: false,
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    marks: Number,
    absent: { type: Boolean, default: false },
  }],
  status: { type: String, enum: ['draft', 'submitted', 'verified', 'published'], default: 'draft' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

assessmentSchema.index({ 'marks.student': 1 });

assessmentSchema.plugin(softDelete);

export default mongoose.model('Assessment', assessmentSchema);
