import { Router } from 'express';
import Settings from '../models/Settings.js';
import { ah, allow, HttpError } from '../middleware/auth.js';
import { SECTIONS, GRANTABLE_ROLES } from '../utils/permissions.js';

const r = Router();
const view = (s) => Object.fromEntries(GRANTABLE_ROLES.map((role) => [role, s.permissions?.[role] || []]));

// Only a real admin manages permissions; this router is never opened up by a grant.
r.get('/', allow('admin'), ah(async (_req, res) => res.json(view(await Settings.getMain()))));

r.put('/', allow('admin'), ah(async (req, res) => {
  const s = await Settings.getMain();
  for (const role of GRANTABLE_ROLES) {
    const list = req.body[role];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.some((x) => !SECTIONS.includes(x))) throw new HttpError(400, 'Unknown section');
    s.permissions[role] = [...new Set(list)];
  }
  await s.save();
  res.json(view(s));
}));

export default r;
