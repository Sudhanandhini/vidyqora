import mongoose from 'mongoose';
import { ah, allow, HttpError } from '../middleware/auth.js';

/**
 * Soft delete: "deleting" sets deletedAt instead of removing the document, so it can be restored.
 * Every query hides deleted documents unless the filter mentions deletedAt itself
 * or the query is run with .setOptions({ withDeleted: true }).
 */
export default function softDelete(schema) {
  schema.add({ deletedAt: { type: Date, default: null, index: true }, deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } });
  function hide() {
    if (this.getOptions().withDeleted || 'deletedAt' in this.getFilter()) return;
    this.where({ deletedAt: null });
  }
  ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'updateOne', 'updateMany'].forEach((op) => schema.pre(op, hide));
  schema.pre('aggregate', function hideAgg() {
    if (!this.options.withDeleted) this.pipeline().unshift({ $match: { deletedAt: null } });
  });
  schema.methods.softDelete = function del(user) {
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
export function trashRoutes(r, Model, { base = '', roles, populate = [], scope = () => ({}), check = async () => {}, onPurge = async () => {} }) {
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
    populate.forEach((p) => { q = q.populate(...[].concat(p)); });
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
