import { getAuth } from '../lib/secure.js';

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

// 알림 문구 테스트 발송 (관리자 전용, 본인 DM으로만)
export default async function handler(req, res){
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });

  const auth = getAuth(req);
  if (!auth) return res.status(401).json({ ok:false, error:'unauthorized' });
  if (auth.role !== 'admin') return res.status(403).json({ ok:false, error:'forbidden' });

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return res.status(500).json({ ok:false, error:'slack_not_configured' });

  const to = process.env.ADMIN_SLACK_ID || 'U03JQ5FHP5Z';   // 수신자 고정
  const body = req.body || {};
  const text = String(body.text || '').slice(0, 3000).trim();
  if (!text) return res.status(400).json({ ok:false, error:'text required' });

  const prefix = '🧪 *[문구 테스트]* 실제 알림이 아니에요 — 저장 전 확인용입니다.\n\n';
  const full = prefix + text;

  let payload;
  if (String(body.key || '') === 'workflow') {
    // 워크플로 알림은 실제처럼 버튼까지 붙여서 보여줌
    const btn = String(body.buttonText || '반영하기').slice(0, 60) || '반영하기';
    payload = {
      text: full,
      blocks: [
        { type:'section', text:{ type:'mrkdwn', text: full } },
        { type:'actions', elements:[
          { type:'button', text:{ type:'plain_text', text: btn, emoji:true }, url: SITE_URL, style:'primary' }
        ] }
      ],
      unfurl_links:false
    };
  } else {
    payload = { text: full, unfurl_links:false };
  }

  const r = await sendDM(token, to, payload);
  if (r && r.ok) return res.status(200).json({ ok:true });
  return res.status(200).json({ ok:false, error:(r && r.error) || 'send_failed' });
}
