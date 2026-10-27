import mongoose from 'mongoose';
import softDelete from '../utils/softDelete.js';

export const REQUEST_TYPES = ['Bonafide certificate', 'ID card', 'Transfer certificate', 'Profile correction', 'Leave request', 'Other'];

const requestSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: REQUEST_TYPES, required: true },
  details: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending', index: true },
  remarks: String,
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

requestSchema.plugin(softDelete);

export default mongoose.model('Request', requestSchema);
