import { deletePhotos } from '../lib/store.js';
import { delImages } from '../lib/blob.js';
import { auth, json, signedOut } from '../lib/auth.js';

export async function DELETE(req) {
  const a = await auth(req, true);
  if (!a) return signedOut();
  let b = {};
  try { b = await req.json(); } catch {}
  const names = b.all ? null : (Array.isArray(b.names) ? b.names.map(String) : []);
  if (names && !names.length) return json({ removed: 0 });
  const urls = await deletePhotos(names);
  await delImages(urls);
  return json({ removed: urls.length });
}
