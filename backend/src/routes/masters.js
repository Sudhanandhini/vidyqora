import { Router } from 'express';
import Settings from '../models/Settings.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import Fee from '../models/Fee.js';
import { ah, allow, HttpError } from '../middleware/auth.js';

// Levels (UG/PG), departments, programs, batches, sections, semesters and fee types kept on the main Settings document.
// List name -> the models and field that hold the chosen value, so a rename carries over to existing records.
const academic = (f) => [[Course, f], [User, f]];
const FIELD = { levels: academic('level'), departments: academic('department'), programs: academic('program'), batches: academic('batch'),
  sections: academic('section'), semesters: academic('semester'), feeTypes: [[Fee, 'title']] };
const KINDS = Object.keys(FIELD);
const r = Router();

const pick = (s) => Object.fromEntries(KINDS.map((k) => [k, [...(s[k] || [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))]));
const kindOf = (k) => { if (!KINDS.includes(k)) throw new HttpError(404, 'Unknown list'); return k; };

r.get('/', ah(async (_req, res) => res.json(pick(await Settings.getMain()))));

const nameOf = (body) => { const n = String(body.name || '').trim(); if (!n) throw new HttpError(400, 'Name is required'); return n; };
const ensureUnique = (list, name, except) => {
  if (list.some((x) => x !== except && x.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `${name} already exists`);
};

r.post('/:kind', allow('admin'), ah(async (req, res) => {
  const kind = kindOf(req.params.kind);
  const name = nameOf(req.body);
  const s = await Settings.getMain();
  ensureUnique(s[kind], name);
  s[kind].push(name);
  await s.save();
  res.status(201).json(pick(s));
}));

// Rename a value and carry the change over to the records already using it.
r.put('/:kind/:name', allow('admin'), ah(async (req, res) => {
  const kind = kindOf(req.params.kind);
  const old = req.params.name;
  const name = nameOf(req.body);
  const s = await Settings.getMain();
  const i = s[kind].indexOf(old);
  if (i < 0) throw new HttpError(404, `${old} not found`);
  ensureUnique(s[kind], name, old);
  s[kind].set(i, name);
  await s.save();
  if (name !== old) {
    await Promise.all(FIELD[kind].map(([Model, f]) => Model.updateMany({ [f]: old }, { [f]: name })));
  }
  res.json(pick(s));
}));

r.delete('/:kind/:name', allow('admin'), ah(async (req, res) => {
  const kind = kindOf(req.params.kind);
  const s = await Settings.getMain();
  s[kind] = s[kind].filter((x) => x !== req.params.name);
  await s.save();
  res.json(pick(s));
}));

export default r;
