import mongoose from 'mongoose';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI, { maxPoolSize: 10 });
  console.log('MongoDB connected');
}
