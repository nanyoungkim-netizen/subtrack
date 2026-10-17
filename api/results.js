import { listPhotos, listVoters } from '../lib/store.js';
import { auth, json, signedOut } from '../lib/auth.js';

export async function GET(req) {
  const a = await auth(req);
  if (!a) return signedOut();
  const [photos, voters] = await Promise.all([listPhotos(), listVoters()]);
  const by = new Map();
  for (const v of voters) for (const n of v.picks || []) {
    if (!by.has(n)) by.set(n, []);
    by.get(n).push(v.name);
  }
  const ranking = photos
    .filter(p => by.has(p.name))
    .map(p => ({ ...p, votes: by.get(p.name).length, by: by.get(p.name) }))
    .sort((x, y) => y.votes - x.votes || x.name.localeCompare(y.name, undefined, { numeric: true }));
  return json({
    max: Number(a.settings.max) || 20,
    totalPhotos: photos.length,
    voters: voters.map(v => ({ name: v.name, count: (v.picks || []).length, seen: v.seen, updated_at: v.updated_at })),
    ranking,
  });
}
