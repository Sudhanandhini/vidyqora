import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import { protect } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/error.js';
import { startScheduler } from './utils/notify.js';
import { UPLOAD_DIR } from './middleware/upload.js';
import auth from './routes/auth.js';
import users from './routes/users.js';
import courses from './routes/courses.js';
import attendance from './routes/attendance.js';
import assignments from './routes/assignments.js';
import assessments from './routes/assessments.js';
import calendar from './routes/calendar.js';
import messages, { notifications } from './routes/messages.js';
import fees from './routes/fees.js';
import requests from './routes/requests.js';
import dashboard from './routes/dashboard.js';
import reports from './routes/reports.js';
import masters from './routes/masters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'Vidyqora' }));

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 }), auth);
app.use('/api/users', protect, users);
app.use('/api/courses', protect, courses);
app.use('/api/attendance', protect, attendance);
app.use('/api/assignments', protect, assignments);
app.use('/api/assessments', protect, assessments);
app.use('/api/calendar', protect, calendar);
app.use('/api/messages', protect, messages);
app.use('/api/notifications', protect, notifications);
app.use('/api/fees', protect, fees);
app.use('/api/requests', protect, requests);
app.use('/api/dashboard', protect, dashboard);
app.use('/api/reports', protect, reports);
app.use('/api/masters', protect, masters);
app.use('/api', notFound);

// Serve the built client (single deployment, e.g. cPanel Node.js app)
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1d', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Vidyqora API on :${PORT}`));
    startScheduler();
  })
  .catch((e) => { console.error('DB connection failed:', e.message); process.exit(1); });
