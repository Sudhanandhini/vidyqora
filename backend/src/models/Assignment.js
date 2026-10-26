import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema({ name: String, path: String, size: Number }, { _id: false });

const assignmentSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: String,
  topic: String,
  publishDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  extendedDate: Date,
  maxMarks: { type: Number, default: 10 },
  hideIdentity: { type: Boolean, default: false },
  files: [fileSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const submissionSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: String,
  files: [fileSchema],
  submittedAt: { type: Date, default: Date.now },
  late: { type: Boolean, default: false },
  attempts: { type: Number, default: 1 },
  status: { type: String, enum: ['submitted', 'evaluated', 'resubmit'], default: 'submitted' },
  marks: Number,
  remarks: String,
  evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

export const Submission = mongoose.model('Submission', submissionSchema);
export default mongoose.model('Assignment', assignmentSchema);
