import mongoose, { type Model, type Query, type Aggregate, type Schema } from 'mongoose';
import type { Request, Router } from 'express';
import { ah, allow, HttpError } from '../middleware/auth.js';
import type { AnyDoc, Role } from '../types.js';

/**
 * Soft delete: "deleting" sets deletedAt instead of removing the document, so it can be restored.
 * Every query hides deleted documents unless the filter mentions deletedAt itself
 * or the query is run with .setOptions({ withDeleted: true }).
 */
export default function softDelete(schema: Schema) {
  schema.add({ deletedAt: { type: Date, default: null, index: true }, deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } });
  function hide(this: Query<unknown, unknown>) {
    if (this.getOptions().withDeleted || 'deletedAt' in this.getFilter()) return;
    this.where({ deletedAt: null });
  }
  ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'updateOne', 'updateMany'].forEach((op) => schema.pre(op as 'find', hide));
  schema.pre('aggregate', function hideAgg(this: Aggregate<unknown>) {
    if (!(this.options as { withDeleted?: boolean }).withDeleted) this.pipeline().unshift({ $match: { deletedAt: null } });
  });
  schema.methods.softDelete = function del(this: any, user?: { _id?: unknown }) {
    this.deletedAt = new Date();
    this.deletedBy = user?._id;
    return this.save({ validateBeforeSave: false });
  };
}

/**
 * Adds GET <base>/deleted (the "Deleted" list), POST <base>/:id/restore and DELETE <base>/:id/permanent
 * (only for items already deleted) to a router. Register before any GET <base>/:id route.
 * `check(req, doc)` may throw to block a restore or purge (ownership etc.); `onPurge(doc)` cleans up references.
 */
export interface TrashOptions {
  base?: string;
  roles: Role[];
  /** Arguments for .populate(), either a path or [path, select]. */
  populate?: (string | [string, string])[];
  scope?: (req: Request) => AnyDoc | Promise<AnyDoc>;
  check?: (req: Request, doc: any) => unknown;
  onPurge?: (doc: any) => unknown;
}

export function trashRoutes(r: Router, Model: Model<AnyDoc>, {
  base = '', roles, populate = [], scope = () => ({}), check = async () => {}, onPurge = async () => {},
}: TrashOptions) {
  r.delete(`${base}/:id/permanent`, allow(...roles), ah(async (req, res) => {
    const doc = await Model.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!doc) throw new HttpError(404, 'Only deleted items can be removed permanently');
    await check(req, doc);
    await onPurge(doc);
    await Model.deleteOne({ _id: doc._id });
    res.json({ message: 'Deleted permanently' });
  }));
  r.get(`${base}/deleted`, allow(...roles), ah(async (req, res) => {
    let q = Model.find({ ...(await scope(req)), deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).limit(500).populate('deletedBy', 'name');
    populate.forEach((p) => { q = Array.isArray(p) ? q.populate(p[0], p[1]) : q.populate(p); });
    res.json(await q.lean());
  }));
  r.post(`${base}/:id/restore`, allow(...roles), ah(async (req, res) => {
    const doc = await Model.findOne({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!doc) throw new HttpError(404, 'Nothing to restore');
    await check(req, doc);
    doc.deletedAt = null;
    doc.deletedBy = undefined;
    await doc.save();
    res.json(doc);
  }));
}
