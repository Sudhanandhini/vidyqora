import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Mirrors the Mongoose User model: password is never selected unless asked for
// (`omit: { password: false }`), is hashed on write, and email is lowercased.
const normalize = async (data) => {
  if (!data) return;
  if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase();
  if (typeof data.password === 'string') data.password = await bcrypt.hash(data.password, 10);
  else if (typeof data.password?.set === 'string') data.password.set = await bcrypt.hash(data.password.set, 10);
};

const base = new PrismaClient({ omit: { user: { password: true } } });

export const prisma = base.$extends({
  query: {
    user: {
      async create({ args, query }) { await normalize(args.data); return query(args); },
      async update({ args, query }) { await normalize(args.data); return query(args); },
      async upsert({ args, query }) { await normalize(args.create); await normalize(args.update); return query(args); },
    },
  },
});

export default prisma;
