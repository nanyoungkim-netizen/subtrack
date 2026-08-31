import crypto from 'node:crypto';
import { signSession } from '../../lib/secure.js';

// 포털(plab-account) '신뢰 패스' 토큰(body.sig, HMAC-SHA256 / SSO_BRIDGE_SECRET) 검증
function verifyPortalToken(token){
  const secret = process.env.SSO_BRIDGE_SECRET || '';
  if(!secret || !token) return null;
  const parts = String(token).split('.');
  if(parts.length !== 2) return null;
  const expect = Buffer.from(
    crypto.createHmac('sha256', secret).update(parts[0]).digest()
  ).toString('base64url');
  const a = Buffer.from(parts[1]); const b = Buffer.from(expect);
  if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if(!body.email || !body.exp || body.exp < Math.floor(Date.now()/1000)) return null;
    return body;
  } catch(_){ return null; }
}

// 포털 토큰 → subtrack 세션 발급 (자동로그인)
export default async function handler(req, res){
  let token = (req.query && req.query.token) || '';
  if(!token && req.body){ token = (typeof req.body === 'string' ? '' : req.body.token) || ''; }
  const p = verifyPortalToken(token);
  if(!p) return res.status(401).json({ ok:false, error:'invalid_sso' });

  const email = String(p.email).toLowerCase();
  const DOMAIN = 'plabfootball.com';
  if(!email.endsWith('@'+DOMAIN)) return res.status(403).json({ ok:false, error:'domain' });

  const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase();
  const role = (adminEmail && email === adminEmail) ? 'admin' : 'researcher';
  const session = signSession({ role, email }, 7*24*3600);

  res.setHeader('Set-Cookie', 'sub_sess=' + session + '; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=' + (7*24*3600));
  res.status(200).json({ ok:true, session, role, email });
}
