import { neon } from '@neondatabase/serverless';
import { getAuth } from '../../lib/secure.js';

// 현재 로그인 상태/역할 조회
//
// ?bundle=1 : 화면이 처음 뜰 때 차례로 부르던 7번(데이터·닉네임·설정 3개·자피어 대기)을
// 여기서 한 번에 묶어 돌려준다(DB 조회는 병렬). 각 값은 개별 API 와 똑같은 모양이라
// 화면 쪽은 받은 값을 그대로 쓰고, 묶음이 없거나 실패하면 예전처럼 개별로 부른다.
// 로그인 안 됐으면 묶음 없음(개별 API 와 같은 권한 규칙).
export default async function handler(req, res){
  const s = getAuth(req);
  if(!s) return res.status(200).json({ ok:true, authed:false });
  const out = { ok:true, authed:true, role:s.role, email:s.email };
  if(req.query && req.query.bundle && process.env.DATABASE_URL){
    try {
      const sql = neon(process.env.DATABASE_URL);
      const [data, zapier, settings] = await Promise.all([
        sql`SELECT * FROM subscriptions ORDER BY id ASC`,
        sql`SELECT * FROM subscriptions WHERE status = 'pending' AND source = 'zapier' ORDER BY id ASC`,
        sql`SELECT key, val FROM app_settings WHERE key IN ('ko_map','card_managers','retired_nicks','slack_ids')`,
      ]);
      const st = {};
      for (const r of settings) {
        try { st[r.key] = r.val ? JSON.parse(r.val) : null; } catch (_) { st[r.key] = null; }
      }
      out.bundle = {
        data, zapier,
        settings: {
          ko_map: st.ko_map ?? null,
          card_managers: st.card_managers ?? null,
          retired_nicks: st.retired_nicks ?? null,
          slack_ids: st.slack_ids ?? null,
        },
      };
    } catch (_) {
      // 묶음 실패 → bundle 없이 응답(화면이 개별로 부름)
    }
  }
  return res.status(200).json(out);
}
