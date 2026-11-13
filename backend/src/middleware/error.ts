import type { Request, Response, NextFunction } from 'express';

export function notFound(req: Request, res: Response) {
  res.status(404).json({ message: `Not found: ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  let status = err.status || 500;
  let message = err.message || 'Server error';
  if (err.name === 'ValidationError') { status = 400; message = Object.values(err.errors).map((e: any) => e.message).join(', '); }
  if (err.name === 'CastError') { status = 400; message = 'Invalid id'; }
  if (err.code === 11000) { status = 409; message = `${Object.entries(err.keyValue).map(([k, v]) => `${k} ${v}`).join(', ')} already exists`; }
  if (err.name === 'MulterError') { status = 400; message = err.field || err.message; }
  if (status >= 500) console.error(err);
  res.status(status).json({ message });
}
