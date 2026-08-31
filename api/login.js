import { signSession, passwordOk, getAuth } from '../lib/secure.js';

// 서버 측 관리자 로그인. 성공 시 httpOnly 세션 쿠키 발급.
// (동일 출처에서만 쓰므로 CORS 헤더는 두지 않음 → 크로스도메인 인증 요청 차단)
export default async function handler(req, res){
  if(req.method === 'GET'){
    const s = getAuth(req);
    return res.status(200).json({ ok:true, authed: !!(s && s.role === 'admin') });
  }
  if(req.method === 'POST'){
    const body = req.body || {};
    if(body.action === 'logout'){
      res.setHeader('Set-Cookie', 'sub_sess=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0');
      return res.status(200).json({ ok:true });
    }
    if(!process.env.ADMIN_PASSWORD || !process.env.AUTH_SECRET){
      return res.status(500).json({ ok:false, error:'server_not_configured' });
    }
    if(!passwordOk(body.password)){
      return res.status(401).json({ ok:false, error:'invalid' });
    }
    const token = signSession({ role:'admin' });
    // SameSite=None: 포털 iframe 등 제3자 컨텍스트에서도 쿠키 허용(Secure 필수)
    res.setHeader('Set-Cookie', 'sub_sess=' + token + '; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=' + (7*24*3600));
    // 쿠키가 차단되는 환경(iframe/사파리) 대비 토큰도 함께 반환 → 프론트가 Authorization 헤더로 사용
    return res.status(200).json({ ok:true, token: token });
  }
  return res.status(405).json({ ok:false });
}
