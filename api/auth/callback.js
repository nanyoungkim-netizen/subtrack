import { signSession, verifySession } from '../../lib/secure.js';

const REDIRECT_URI = 'https://subtrack-sage.vercel.app/api/auth/callback';
const DOMAIN = 'plabfootball.com';

function b64urlJson(seg){
  return JSON.parse(Buffer.from(String(seg).replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'));
}

// 구글 콜백: code→토큰 교환, 이메일·도메인 검증, 역할 결정, 세션 발급
export default async function handler(req, res){
  try {
    const q = req.query || {};
    if(q.error) return res.status(400).send('로그인이 취소됐어요.');
    const st = verifySession(q.state);
    if(!st || st.k !== 'state') return res.status(400).send('잘못된 요청이에요(state).');
    if(!q.code) return res.status(400).send('인증 코드가 없어요.');

    const body = new URLSearchParams({
      code: q.code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    });
    const tok = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body: body.toString()
    }).then(r=>r.json());
    if(!tok || !tok.id_token) return res.status(401).send('토큰 교환에 실패했어요.');

    // id_token은 구글 토큰엔드포인트에서 서버-서버로 직접 받았으므로 페이로드를 신뢰
    const p = b64urlJson(tok.id_token.split('.')[1]);
    const email = String(p.email || '').toLowerCase();
    const okDomain = email.endsWith('@'+DOMAIN) && (!p.hd || p.hd === DOMAIN) && p.email_verified;
    if(!email || !okDomain){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.status(403).send('<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;"><h3>접근할 수 없어요</h3><p><b>@'+DOMAIN+'</b> 워크스페이스 계정만 이용할 수 있어요.</p></body>');
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase();
    const role = (adminEmail && email === adminEmail) ? 'admin' : 'researcher';
    const session = signSession({ role: role, email: email }, 7*24*3600);

    // 탑레벨용 쿠키 + (팝업/iframe용) 토큰
    res.setHeader('Set-Cookie', 'sub_sess=' + session + '; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=' + (7*24*3600));

    if(st.p === '1'){
      // 새 탭/팝업(포털 iframe): opener에 토큰 전달 후 닫기
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.end('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;">로그인 완료! 이 창은 자동으로 닫혀요.<script>try{window.opener&&window.opener.postMessage({subtrackSession:'+JSON.stringify(session)+'},"*");}catch(e){}setTimeout(function(){window.close();},200);</script></body>');
    }
    // 탑레벨: 앱으로 리디렉트(토큰은 URL 프래그먼트로 전달)
    res.writeHead(302, { Location: '/#sess=' + encodeURIComponent(session) });
    res.end();
  } catch(e){
    res.status(500).send('로그인 처리 중 오류: ' + e.message);
  }
}
