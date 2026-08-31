// 로그아웃: 세션 쿠키 제거(프론트는 sessionStorage 토큰도 지움)
export default async function handler(req, res){
  res.setHeader('Set-Cookie', 'sub_sess=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0');
  return res.status(200).json({ ok:true });
}
