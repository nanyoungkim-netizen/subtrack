import { getAuth } from '../../lib/secure.js';

// 현재 로그인 상태/역할 조회
export default async function handler(req, res){
  const s = getAuth(req);
  if(!s) return res.status(200).json({ ok:true, authed:false });
  return res.status(200).json({ ok:true, authed:true, role:s.role, email:s.email });
}
