import type { AnyDoc } from '../types.js';
import mongoose, { type Model } from 'mongoose';

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  institutionName: String,
  academicYear: { start: Date, end: Date, label: String },
  weeklyOffs: { type: [Number], default: [0] },
  sessions: [{ _id: false, name: String, start: String, end: String, isBreak: Boolean }],
  // Master lists shown as dropdowns in course, user and fee forms
  levels: { type: [String], default: [] },
  departments: { type: [String], default: [] },
  programs: { type: [String], default: [] },
  batches: { type: [String], default: [] },
  sections: { type: [String], default: [] },
  semesters: { type: [String], default: [] },
  feeTypes: { type: [String], default: [] }, // fee titles offered in the Add fee form
  // Sections (users, courses, setup, ...) the admin has opened up to a role with full admin access
  permissions: {
    staff: { type: [String], default: [] },
    faculty: { type: [String], default: [] },
  },
}, { timestamps: true });

export interface SettingsModel extends Model<AnyDoc> {
  /** The single settings document, created on first use. */
  getMain(): Promise<any>;
}

settingsSchema.statics.getMain = async function getMain(this: Model<any>) {
  return (await this.findOne({ key: 'main' })) || this.create({ key: 'main' });
};

export default mongoose.model<AnyDoc, SettingsModel>('Settings', settingsSchema);
