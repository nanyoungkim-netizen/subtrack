import { signSession, passwordOk, getSession } from '../lib/secure.js';

// 서버 측 관리자 로그인. 성공 시 httpOnly 세션 쿠키 발급.
// (동일 출처에서만 쓰므로 CORS 헤더는 두지 않음 → 크로스도메인 인증 요청 차단)
export default async function handler(req, res){
  if(req.method === 'GET'){
    const s = getSession(req);
    return res.status(200).json({ ok:true, authed: !!(s && s.role === 'admin') });
  }
  if(req.method === 'POST'){
    const body = req.body || {};
    if(body.action === 'logout'){
      res.setHeader('Set-Cookie', 'sub_sess=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
      return res.status(200).json({ ok:true });
    }
    if(!process.env.ADMIN_PASSWORD || !process.env.AUTH_SECRET){
      return res.status(500).json({ ok:false, error:'server_not_configured' });
    }
    if(!passwordOk(body.password)){
      return res.status(401).json({ ok:false, error:'invalid' });
    }
    const token = signSession({ role:'admin' });
    res.setHeader('Set-Cookie', 'sub_sess=' + token + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + (7*24*3600));
    return res.status(200).json({ ok:true });
  }
  return res.status(405).json({ ok:false });
}
