import mongoose from 'mongoose';
import softDelete from '../utils/softDelete.js';

const courseSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  department: String,
  level: String,
  program: String,
  batch: String,
  section: String,
  semester: String,
  credits: { type: Number, default: 3 },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  lessonPlan: [{ unit: String, topic: String, planned: Date, done: { type: Boolean, default: false } }],
}, { timestamps: true });

courseSchema.plugin(softDelete);

export default mongoose.model('Course', courseSchema);
