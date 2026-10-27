import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import softDelete from '../utils/softDelete.js';

// Letters, spaces and dots (for initials like "S. Mangai"); no digits or other symbols.
const NAME_RX = /^[A-Za-z][A-Za-z. ]*$/;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PHONE_RX = /^\d{10}$/;

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true, match: [NAME_RX, 'Name can contain only letters, spaces and dots'] },
  email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true, match: [EMAIL_RX, 'Enter a valid email address'] },
  password: { type: String, required: true, minlength: 6, select: false },
  role: { type: String, enum: ['admin', 'faculty', 'student', 'staff'], required: true, index: true },
  phone: { type: String, trim: true, validate: { validator: (v) => !v || PHONE_RX.test(v), message: 'Phone number must be exactly 10 digits' } },
  department: { type: String, trim: true },
  designation: { type: String, trim: true },
  employeeId: { type: String, trim: true, uppercase: true },
  rollNo: { type: String, trim: true, uppercase: true },
  level: { type: String, trim: true },
  program: { type: String, trim: true },
  batch: { type: String, trim: true },
  section: { type: String, trim: true },
  semester: { type: String, trim: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

userSchema.index({ role: 1, batch: 1, section: 1 });
userSchema.plugin(softDelete);

// Email, phone, employee ID and roll number must each belong to one user only (deleted users included,
// so restoring one can never create a duplicate).
const UNIQUE = { email: 'Email', phone: 'Phone number', employeeId: 'Employee ID', rollNo: 'Roll number' };
userSchema.pre('validate', async function unique(next) {
  const taken = [];
  await Promise.all(Object.entries(UNIQUE).map(async ([k, label]) => {
    if (!this[k] || (!this.isNew && !this.isModified(k))) return;
    const other = await this.constructor.findOne({ [k]: this[k], _id: { $ne: this._id } })
      .setOptions({ withDeleted: true }).select('name deletedAt').lean();
    if (other) taken.push(`${label} ${this[k]} is already used by ${other.name}${other.deletedAt ? ' (deleted user)' : ''}`);
  }));
  if (taken.length) return next(Object.assign(new Error(taken.join('. ')), { status: 409 }));
  next();
});

userSchema.pre('save', async function hash(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function match(pw) { return bcrypt.compare(pw, this.password); };

export default mongoose.model('User', userSchema);
