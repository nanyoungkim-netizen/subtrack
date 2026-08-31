// 공용 보안 유틸: 세션 서명/검증(HMAC), 카드 데이터 암호화(AES-256-GCM)
import crypto from 'node:crypto';

function b64url(buf){
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(s){
  s = String(s).replace(/-/g,'+').replace(/_/g,'/');
  return Buffer.from(s, 'base64');
}

// ── 세션 토큰(HMAC 서명) ──────────────────────────
export function signSession(payload, ttlSec){
  const secret = process.env.AUTH_SECRET || '';
  const body = Object.assign({}, payload, { exp: Math.floor(Date.now()/1000) + (ttlSec || 7*24*3600) });
  const p = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', secret).update(p).digest());
  return p + '.' + sig;
}
export function verifySession(token){
  try {
    const secret = process.env.AUTH_SECRET || '';
    if(!secret || !token) return null;
    const parts = String(token).split('.');
    if(parts.length !== 2) return null;
    const expect = b64url(crypto.createHmac('sha256', secret).update(parts[0]).digest());
    const a = Buffer.from(parts[1]); const b = Buffer.from(expect);
    if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const body = JSON.parse(b64urlDecode(parts[0]).toString('utf8'));
    if(!body.exp || body.exp < Math.floor(Date.now()/1000)) return null;
    return body;
  } catch(_){ return null; }
}
export function parseCookies(req){
  const h = (req.headers && req.headers.cookie) || '';
  const out = {};
  h.split(';').forEach(function(c){
    const i = c.indexOf('=');
    if(i > 0) out[c.slice(0,i).trim()] = decodeURIComponent(c.slice(i+1).trim());
  });
  return out;
}
export function getSession(req){
  return verifySession(parseCookies(req).sub_sess);
}
// 쿠키(sub_sess) 우선, 없으면 Authorization: Bearer 토큰으로 인증.
// (포털 iframe 등 제3자 쿠키가 차단되는 환경 대비)
export function getAuth(req){
  var s = getSession(req);
  if(s) return s;
  var h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if(h.indexOf('Bearer ') === 0) return verifySession(h.slice(7).trim());
  return null;
}

// ── 관리자 비밀번호 검증(서버 측, 상수시간 비교) ──
export function passwordOk(input){
  const pw = process.env.ADMIN_PASSWORD || '';
  if(!pw || input == null) return false;
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(pw).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── 카드 데이터 암호화(AES-256-GCM) ──────────────
const ALG = 'aes-256-gcm';
function keyBuf(){
  const k = process.env.CARD_ENC_KEY || '';
  if(/^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, 'hex');   // 64 hex = 32 bytes
  return crypto.createHash('sha256').update(k).digest();          // 그 외엔 해시로 32바이트
}
export function encrypt(plain){
  if(plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, keyBuf(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return b64url(iv) + '.' + b64url(tag) + '.' + b64url(ct);
}
export function decrypt(blob){
  try {
    if(!blob) return '';
    const parts = String(blob).split('.');
    if(parts.length !== 3) return '';
    const d = crypto.createDecipheriv(ALG, keyBuf(), b64urlDecode(parts[0]));
    d.setAuthTag(b64urlDecode(parts[1]));
    return Buffer.concat([d.update(b64urlDecode(parts[2])), d.final()]).toString('utf8');
  } catch(_){ return ''; }
}

// ── 표시용 마스킹 ─────────────────────────────────
export function maskCard(last4){
  const s = String(last4 || '').replace(/\D/g,'').slice(-4);
  return s ? ('**** **** **** ' + s) : '****';
}
