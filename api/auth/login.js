import { signSession } from '../../lib/secure.js';

const REDIRECT_URI = 'https://subtrack-sage.vercel.app/api/auth/callback';

// 구글 워크스페이스 로그인 시작 → 구글 동의 화면으로 리디렉트
export default async function handler(req, res){
  const CID = process.env.GOOGLE_CLIENT_ID;
  if(!CID) return res.status(500).json({ ok:false, error:'oauth_not_configured' });
  // state에 팝업여부 담아 서명(10분 유효) — CSRF 방지 겸용
  const popup = req.query && req.query.popup ? '1' : '';
  const state = signSession({ k:'state', p:popup }, 600);
  const params = new URLSearchParams({
    client_id: CID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    hd: 'plabfootball.com',
    prompt: 'select_account',
    state: state
  });
  res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
  res.end();
}
