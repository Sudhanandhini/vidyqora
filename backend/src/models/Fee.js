import mongoose from 'mongoose';

const feeSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  term: String,
  amount: { type: Number, required: true, min: 0 },
  dueDate: Date,
  status: { type: String, enum: ['pending', 'paid'], default: 'pending', index: true },
  paidAt: Date,
  mode: String,
  txnId: String,
  receiptNo: String,
}, { timestamps: true });

export default mongoose.model('Fee', feeSchema);
