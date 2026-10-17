import crypto from 'node:crypto';
import { getSettings } from './store.js';

// The signing secret lives in the settings table (row 'auth_secret'),
// so the deployment needs only DATABASE_URL.
const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('base64url');
const secretOf = s => s.auth_secret || process.env.AUTH_SECRET || 'local-dev-secret';

export const hashPw = (settings, pw) => crypto.createHash('sha256').update(secretOf(settings) + ':' + pw).digest('hex');

// A token carries the start of the password hash it was issued under,
// so changing a password signs out everyone who used the old one.
export function sign(settings, role, name, pwHash) {
  const body = Buffer.from(JSON.stringify({ r: role, n: name, v: pwHash.slice(0, 12) })).toString('base64url');
  return body + '.' + hmac(secretOf(settings), body);
}

export async function auth(req, needAdmin = false) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [body, sig] = t.split('.');
  if (!body || !sig) return null;
  const settings = await getSettings();
  const good = hmac(secretOf(settings), body);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  const current = p.r === 'admin' ? settings.admin_pw : settings.vote_pw;
  if (!current || p.v !== current.slice(0, 12)) return null;
  if (needAdmin && p.r !== 'admin') return null;
  return { role: p.r, name: p.n, settings };
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const signedOut = () => json({ error: '다시 들어와 주세요.' }, 401);
