import { neon } from '@neondatabase/serverless';
import { getAuth } from '../lib/secure.js';
import { DEFAULT_TEMPLATES, TEMPLATE_VARS } from '../lib/msgtpl.js';

const SITE_URL = 'https://subtrack-sage.vercel.app';

// 관리자 본인에게만 DM (수신자 고정 — 이 API로 남에게 보낼 수 없음)
async function sendDM(token, userId, payload){
  try {
    const open = await fetch('https://slack.com/api/conversations.open', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify({ users: userId })
    }).then(r=>r.json());
    const channel = (open && open.ok && open.channel && open.channel.id) ? open.channel.id : userId;
    return await fetch('https://slack.com/api/chat.postMessage', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify(Object.assign({ channel: channel }, payload))
    }).then(r=>r.json());
  } catch(e){ return { ok:false, error:e.message }; }
}

// 문구 테스트 발송(관리자 본인 DM으로만). Hobby 함수 12개 제한 때문에 이 파일에 통합.
async function handleTestSend(req, res){
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return res.status(500).json({ ok:false, error:'slack_not_configured' });
  const to = process.env.ADMIN_SLACK_ID || 'U03JQ5FHP5Z';   // 수신자 고정
  const body = req.body || {};
  const text = String(body.text || '').slice(0, 3000).trim();
  if (!text) return res.status(400).json({ ok:false, error:'text required' });

  const full = '🧪 *[문구 테스트]* 실제 알림이 아니에요 — 저장 전 확인용입니다.\n\n' + text;
  let payload;
  if (String(body.key || '') === 'workflow') {
    const btn = String(body.buttonText || '반영하기').slice(0, 60) || '반영하기';
    payload = { text: full, unfurl_links:false, blocks: [
      { type:'section', text:{ type:'mrkdwn', text: full } },
      { type:'actions', elements:[
        { type:'button', text:{ type:'plain_text', text: btn, emoji:true }, url: SITE_URL, style:'primary' }
      ] }
    ] };
  } else {
    payload = { text: full, unfurl_links:false };
  }
  const r = await sendDM(token, to, payload);
  if (r && r.ok) return res.status(200).json({ ok:true });
  return res.status(200).json({ ok:false, error:(r && r.error) || 'send_failed' });
}

// 알림 문구 템플릿 조회/저장 (관리자 전용)
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = getAuth(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (auth.role !== 'admin') return res.status(403).json({ ok: false, error: 'forbidden' });

  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, val text, updated_at timestamptz DEFAULT now())`;

    if (req.method === 'GET') {
      let saved = {};
      try {
        const rows = await sql`SELECT val FROM app_settings WHERE key='msg_templates' LIMIT 1`;
        if (rows[0] && rows[0].val) saved = JSON.parse(rows[0].val) || {};
      } catch (_) { saved = {}; }
      return res.status(200).json({ ok: true, defaults: DEFAULT_TEMPLATES, saved: saved, vars: TEMPLATE_VARS });
    }

    if (req.method === 'POST') {
      // 테스트 발송 요청은 저장 대신 DM 발송
      if (req.body && req.body.action === 'test') return await handleTestSend(req, res);

      const t = (req.body && req.body.templates) || null;
      if (!t || typeof t !== 'object' || Array.isArray(t)) {
        return res.status(400).json({ ok: false, error: 'templates object required' });
      }
      // 기본값과 같은 항목은 저장하지 않음(기본값 변경 시 자동 반영되도록)
      const clean = {};
      Object.keys(t).forEach(function (k) {
        if (!(k in DEFAULT_TEMPLATES)) return;                 // 모르는 키 무시
        const v = typeof t[k] === 'string' ? t[k] : '';
        if (v.trim() && v !== DEFAULT_TEMPLATES[k]) clean[k] = v;
      });
      await sql`
        INSERT INTO app_settings (key, val, updated_at)
        VALUES ('msg_templates', ${JSON.stringify(clean)}, now())
        ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, updated_at = now()
      `;
      return res.status(200).json({ ok: true, saved: clean });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
