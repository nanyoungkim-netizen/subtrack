import { neon } from '@neondatabase/serverless';

// 워크플로 스레드에 처리 결과 답글
function slackReply(token, channel, ts, text){
  return fetch('https://slack.com/api/chat.postMessage', {
    method:'POST', headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: channel, thread_ts: ts, text: text, unfurl_links:false })
  }).then(function(r){return r.json();}).catch(function(){return null;});
}

// 컬럼 보장(DDL)은 서버 인스턴스당 1회만. 예전엔 매 요청마다 ALTER 6번을
// 순차 실행해 GET 한 번에 DB를 7번 왕복(2~3초)했다.
let schemaReady = false;
async function ensureSchema(sql) {
  if (schemaReady) return;
  // 인상 승인 종료일(hu)·인상 금액(ha)·툴별 담당자(mgr) 컬럼 보장
  try { await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS hu text`; } catch (_) {}
  try { await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ha text`; } catch (_) {}
  try { await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mgr text`; } catch (_) {}
  // 워크플로 스레드 정보(채널/ts) + 결과답글 발송여부
  try { await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS thch text`; } catch (_) {}
  try { await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tts text`; } catch (_) {}
  try { await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS thdone text`; } catch (_) {}
  schemaReady = true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);
  await ensureSchema(sql);

  if (req.method === 'GET') {
    try {
      const { id, status, source } = req.query;
      if (id) {
        const rows = await sql`SELECT * FROM subscriptions WHERE id = ${parseInt(id)} LIMIT 1`;
        return res.status(200).json({ ok: true, data: rows[0] || null });
      }
      let rows;
      if (status && source) {
        rows = await sql`SELECT * FROM subscriptions WHERE status = ${status} AND source = ${source} ORDER BY id ASC`;
      } else if (status) {
        rows = await sql`SELECT * FROM subscriptions WHERE status = ${status} ORDER BY id ASC`;
      } else if (source) {
        rows = await sql`SELECT * FROM subscriptions WHERE source = ${source} ORDER BY id ASC`;
      } else {
        rows = await sql`SELECT * FROM subscriptions ORDER BY id ASC`;
      }
      return res.status(200).json({ ok: true, data: rows, initialized: rows.length > 0 });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, s, d, u, status, a, m, c, sd, ed, note, source, pd, hu, ha, mgr } = req.body;
      // 처리 결과 답글용: 업데이트 전 상태/스레드정보 조회
      let prev = null;
      try { const pr = await sql`SELECT status, thch, tts, thdone FROM subscriptions WHERE id=${id} LIMIT 1`; prev = pr[0] || null; } catch (_) {}
      const rows = await sql`
        UPDATE subscriptions SET
          s=${s||null}, d=${d||''}, u=${u||''}, status=${status||'구독중'},
          a=${a||''}, m=${m||''}, c=${c||'월결제'},
          sd=${sd||null}, ed=${ed||null}, note=${note||''},
          source=${source||null}, pd=${pd||null}, hu=${hu||null}, ha=${ha||null}, mgr=${mgr||null}
        WHERE id=${id}
        RETURNING *
      `;
      // pending → 처리완료 전환이면 워크플로 스레드에 결과 답글(1회)
      try {
        const token = process.env.SLACK_BOT_TOKEN;
        const LABEL = { '구독중':'✅ *신규 구독으로 등록했어요*', '거절':'🚫 *거절 처리했어요*', '업그레이드반영':'🔁 *기존 구독에 반영했어요*' };
        if (token && prev && prev.status === 'pending' && LABEL[status] && prev.thch && prev.tts && !prev.thdone) {
          const svc = (rows[0] && rows[0].s) || s || '';
          const msg = LABEL[status] + (svc ? ' — *' + svc + '*' : '');
          await slackReply(token, prev.thch, prev.tts, msg);
          try { await sql`UPDATE subscriptions SET thdone='1' WHERE id=${id}`; } catch (_) {}
        }
      } catch (_) {}
      return res.status(200).json({ ok: true, data: rows[0] });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      // 단건 삽입: body.item 이 있으면 single insert
      if (req.body && req.body.item) {
        const { id, s, d, u, status, a, m, c, sd, ed, note, source, pd, hu, ha, mgr } = req.body.item;
        let insertId = id;
        if (!insertId) {
          const maxRow = await sql`SELECT COALESCE(MAX(id),0)+1 AS next_id FROM subscriptions`;
          insertId = maxRow[0].next_id;
        }
        await sql`INSERT INTO subscriptions (id,s,d,u,status,a,m,c,sd,ed,note,source,pd,hu,ha,mgr)
          VALUES (${insertId},${s||null},${d||''},${u||''},${status||'구독중'},
                  ${a||''},${m||''},${c||'월결제'},${sd||null},${ed||null},
                  ${note||''},${source||null},${pd||null},${hu||null},${ha||null},${mgr||null})
          ON CONFLICT (id) DO UPDATE SET
            s=EXCLUDED.s, d=EXCLUDED.d, u=EXCLUDED.u, status=EXCLUDED.status,
            a=EXCLUDED.a, m=EXCLUDED.m, c=EXCLUDED.c, sd=EXCLUDED.sd, ed=EXCLUDED.ed,
            note=EXCLUDED.note, source=EXCLUDED.source, pd=EXCLUDED.pd, hu=EXCLUDED.hu, ha=EXCLUDED.ha, mgr=EXCLUDED.mgr`;
        return res.status(200).json({ ok: true, id: insertId });
      }

      // 전체 교체: body.data (array)
      const { data } = req.body;
      if (!Array.isArray(data)) return res.status(400).json({ ok: false, error: 'data array required' });
      await sql`DELETE FROM subscriptions`;
      for (const row of data) {
        const { id, s, d, u, status, a, m, c, sd, ed, note, source, pd, hu, ha, mgr } = row;
        await sql`INSERT INTO subscriptions (id,s,d,u,status,a,m,c,sd,ed,note,source,pd,hu,ha,mgr)
          VALUES (${id},${s||null},${d||''},${u||''},${status||'구독중'},
                  ${a||''},${m||''},${c||'월결제'},${sd||null},${ed||null},
                  ${note||''},${source||null},${pd||null},${hu||null},${ha||null},${mgr||null})`;
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── DELETE ────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      await sql`DELETE FROM subscriptions WHERE id = ${parseInt(id)}`;
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
