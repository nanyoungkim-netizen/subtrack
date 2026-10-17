import { saveVoter } from '../lib/store.js';
import { auth, json, signedOut } from '../lib/auth.js';

export async function PUT(req) {
  const a = await auth(req);
  if (!a) return signedOut();
  const text = await req.text();
  if (text.length > 400000) return json({ error: '기록이 너무 커요.' }, 413);
  let b;
  try { b = JSON.parse(text); } catch { return json({ error: '잘못된 요청이에요.' }, 400); }
  const max = Number(a.settings.max) || 20;
  const picks = [...new Set((Array.isArray(b.picks) ? b.picks : []).map(String))].slice(0, max);
  const state = b.state && typeof b.state === 'object' ? b.state : {};
  await saveVoter(a.name, state, picks);
  return json({ ok: true });
}
