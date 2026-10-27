import { Router } from 'express';
import Settings from '../models/Settings.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { ah, allow, HttpError } from '../middleware/auth.js';

// Levels (UG/PG), departments, programs, batches, sections and semesters kept on the main Settings document.
// List name -> field on courses and users that holds the chosen value.
const FIELD = { levels: 'level', departments: 'department', programs: 'program', batches: 'batch', sections: 'section', semesters: 'semester' };
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

// Rename a value and carry the change over to courses and users already using it.
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
    const f = FIELD[kind];
    await Promise.all([Course.updateMany({ [f]: old }, { [f]: name }), User.updateMany({ [f]: old }, { [f]: name })]);
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
