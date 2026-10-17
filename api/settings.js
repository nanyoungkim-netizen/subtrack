import { setSetting, resetVotes } from '../lib/store.js';
import { auth, json, signedOut, hashPw, sign } from '../lib/auth.js';

export async function POST(req) {
  const a = await auth(req, true);
  if (!a) return signedOut();
  let b = {};
  try { b = await req.json(); } catch {}
  const out = { ok: true };
  if (b.max !== undefined) {
    const m = Math.round(Number(b.max));
    if (!(m >= 1 && m <= 300)) return json({ error: '1장에서 300장 사이로 정해 주세요.' }, 400);
    await setSetting('max', m);
    out.max = m;
  }
  if (b.votePassword !== undefined) {
    const p = String(b.votePassword).trim();
    if (p.length < 4) return json({ error: '투표 암호는 4자 이상으로 정해 주세요.' }, 400);
    await setSetting('vote_pw', hashPw(a.settings, p));
    await setSetting('vote_pw_plain', p);
  }
  if (b.adminPassword !== undefined) {
    const p = String(b.adminPassword).trim();
    if (p.length < 6) return json({ error: '관리자 암호는 6자 이상으로 정해 주세요.' }, 400);
    const h = hashPw(a.settings, p);
    await setSetting('admin_pw', h);
    out.token = sign(a.settings, 'admin', a.name, h);   // keep this admin signed in
  }
  if (b.resetVotes === true) await resetVotes();
  return json(out);
}
