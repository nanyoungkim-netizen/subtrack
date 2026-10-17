import { listPhotos, getVoter } from '../lib/store.js';
import { auth, json, signedOut } from '../lib/auth.js';

export async function GET(req) {
  const a = await auth(req);
  if (!a) return signedOut();
  const [photos, me] = await Promise.all([listPhotos(), getVoter(a.name)]);
  return json({
    role: a.role, name: a.name, max: Number(a.settings.max) || 20,
    invitePw: a.role === 'admin' ? a.settings.vote_pw_plain || '' : undefined,
    photos, me,
  });
}
