import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  role: { type: String, enum: ['admin', 'faculty', 'student', 'staff'], required: true, index: true },
  phone: { type: String, trim: true },
  department: { type: String, trim: true },
  designation: { type: String, trim: true },
  employeeId: { type: String, trim: true },
  rollNo: { type: String, trim: true },
  program: { type: String, trim: true },
  batch: { type: String, trim: true },
  section: { type: String, trim: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

userSchema.index({ role: 1, batch: 1, section: 1 });

userSchema.pre('save', async function hash(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function match(pw) { return bcrypt.compare(pw, this.password); };

export default mongoose.model('User', userSchema);
