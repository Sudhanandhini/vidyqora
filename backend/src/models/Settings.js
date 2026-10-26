import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  institutionName: String,
  academicYear: { start: Date, end: Date, label: String },
  weeklyOffs: { type: [Number], default: [0] },
  sessions: [{ _id: false, name: String, start: String, end: String, isBreak: Boolean }],
}, { timestamps: true });

settingsSchema.statics.getMain = async function getMain() {
  return (await this.findOne({ key: 'main' })) || this.create({ key: 'main' });
};

export default mongoose.model('Settings', settingsSchema);
