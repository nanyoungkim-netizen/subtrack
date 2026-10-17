import { getSettings } from '../lib/store.js';
import { hashPw, sign, json } from '../lib/auth.js';

export async function POST(req) {
  let b = {};
  try { b = await req.json(); } catch {}
  const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  const password = String(b.password || '').trim();
  if (!name) return json({ error: '이름을 적어 주세요.' }, 400);
  const s = await getSettings();
  const h = hashPw(s, password);
  const role = h === s.admin_pw ? 'admin' : h === s.vote_pw ? 'voter' : null;
  if (!role) {
    await new Promise(r => setTimeout(r, 700));
    return json({ error: '암호가 맞지 않아요. 받은 암호를 다시 확인해 주세요.' }, 401);
  }
  return json({ token: sign(s, role, name, role === 'admin' ? s.admin_pw : s.vote_pw), role, name });
}
