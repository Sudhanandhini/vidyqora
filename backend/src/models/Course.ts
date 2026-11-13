import type { AnyDoc } from '../types.js';
import mongoose from 'mongoose';
import softDelete from '../utils/softDelete.js';

// Default evaluation scheme by paper type, as in the university syllabus:
// theory = MSE 40 + ESE 60 (100), sessional/lab = CPA 20 + ESE 30 (50).
export interface SchemePart { key: string; label: string; max: number; pass?: number }

export const DEFAULT_SCHEME: Record<'theory' | 'sessional', SchemePart[]> = {
  theory: [{ key: 'MSE', label: 'Mid-Semester Exam', max: 40 }, { key: 'ESE', label: 'End-Semester Exam', max: 60 }],
  sessional: [{ key: 'CPA', label: 'Continuous Practical Assessment', max: 20 }, { key: 'ESE', label: 'End-Semester Exam', max: 30 }],
};
export const schemeOf = (c: any): SchemePart[] => (c?.evaluation?.length ? c.evaluation : DEFAULT_SCHEME[(c?.type || 'theory') as 'theory' | 'sessional']);

const courseSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  department: String,
  level: String,
  program: String,
  batch: String,
  section: String,
  semester: String,
  // Paper details from the syllabus
  type: { type: String, enum: ['theory', 'sessional'], default: 'theory' },
  lectures: { type: Number, default: 0, min: 0 },
  tutorials: { type: Number, default: 0, min: 0 },
  practicals: { type: Number, default: 0, min: 0 },
  credits: { type: Number, default: 3 },
  hours: { type: Number, default: 0, min: 0 },
  // pass = minimum marks needed in that part (optional); passMarks = minimum for the sub-total.
  evaluation: [{ _id: false, key: { type: String, uppercase: true, trim: true }, label: String, max: { type: Number, min: 1 }, pass: { type: Number, min: 0 } }],
  passMarks: { type: Number, min: 0 },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  lessonPlan: [{ unit: String, topic: String, planned: Date, done: { type: Boolean, default: false } }],
}, { timestamps: true });

courseSchema.pre('validate', function fillScheme(this: any, next) {
  if (!this.evaluation?.length) this.evaluation = DEFAULT_SCHEME[this.type || 'theory'];
  next();
});

courseSchema.plugin(softDelete);

export default mongoose.model<AnyDoc>('Course', courseSchema);
