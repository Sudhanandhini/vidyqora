import Settings from '../models/Settings.js';

// Sections an admin can open up to office staff or faculty. Each matches a page path and an API router.
export const SECTIONS = ['users', 'courses', 'setup', 'calendar', 'messaging', 'fees', 'requests', 'reports'];
export const GRANTABLE_ROLES = ['staff', 'faculty'];

/** Sections granted to a role (empty for admin, who has everything, and students). */
export async function accessFor(role) {
  if (!GRANTABLE_ROLES.includes(role)) return [];
  return (await Settings.getMain()).permissions?.[role] || [];
}
