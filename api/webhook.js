import { neon } from '@neondatabase/serverless';

const SITE_URL = 'https://subtrack-sage.vercel.app';

// 관리자(머시)에게 슬랙 개인 DM. SLACK_BOT_TOKEN 없으면 조용히 스킵.
async function notifyAdmin(info){
  const token = process.env.SLACK_BOT_TOKEN;
  const adminId = process.env.ADMIN_SLACK_ID || 'U03JQ5FHP5Z';
  if(!token) return;
  const text =
    '🔔 새 구독 결제 워크플로가 올라왔어요! 확인해서 반영 부탁드려요.\n\n' +
    '• 서비스: *'+(info.service||'-')+'*\n' +
    '• 사용자: '+(info.user||'-')+'\n' +
    '• 금액: '+(info.amount||'-')+'\n' +
    '• 결제수단: '+(info.payment||'-')+'\n' +
    '• 결제방식: '+(info.cycle||'월결제')+'\n\n' +
    '👉 <'+SITE_URL+'|구독관리에서 승인/반영하기>\n' +
    '(승인 탭에서 확인 후 등록해주세요 🙏)';
  try {
    const open = await fetch('https://slack.com/api/conversations.open', {
      method:'POST', headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify({ users: adminId })
    }).then(r=>r.json());
    const channel = (open && open.ok && open.channel && open.channel.id) ? open.channel.id : adminId;
    await fetch('https://slack.com/api/chat.postMessage', {
      method:'POST', headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, text, unfurl_links:false })
    });
  } catch(_){}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    let service=body.service, user=body.user, description=body.description;
    let amount=body.amount, payment=body.payment, cycle=body.cycle;
    let start_date=body.start_date, note=body.note;

    const SLACK_MAP = {"UGNKU8WLD":"Q","UGP8ENQ3V":"IRON","UGPBD81HA":"Yello","UGP9X2D3L":"Cus","UJD690FCM":"MacGook","UGNL59LJC":"Minu","U0180UXLD2Q":"Sante","U01SLNUA155":"Rilla","U0261145X18":"HODOO","U027F6SG8AC":"Lark","U027WL6H93N":"Sian","U0288AXGGCW":"Rokoon","U02D6CDKQ3W":"Stone","U02CX5SQNSZ":"Chovy","U02K890UPK3":"Pucca","U033U995K53":"Zerry","U03JQ5FHP5Z":"Mush","U03QQ53099N":"dDubi","U03TC2CQEVD":"DDao","U04ATHK9S84":"Burns","U04GTSZ93T7":"SALT","U04NX77SNJ1":"Rooney","U04SUG1K22D":"Hero","U04T8FN2ZCZ":"Moomin","U04SYARM2MS":"Rami","U04TN658A84":"Junta","U054RK2GKK8":"Woz","U0645BVMJES":"Peach","U066F6AA6KD":"Aqoo","U069A4EC72S":"Hook","U069GP8MWDQ":"Teddy","U06CFJYUGQZ":"Pire","U070M3N25LP":"MewTwo","U071QDWFQNL":"Endo","U072B0P4R6Y":"YAMUCHI","U05DQHV6XAT":"Beaver","U05EUR1CCN4":"Turkey","U05DQHVDS5D":"Pepe","D07LNQ9GMHV":"Jeongnam","U07S5FBLPK7":"Aki","U08990X2ZNH":"Kikr","U0A3JQ8SGHG":"Lime","U08RUG330D9":"Funky","U0A07QF0URW":"Newjin"};

    function resolveUser(raw) {
      if (!raw) return '';
      return raw.replace(/<@([A-Z0-9]+)(?:[|][^>]+)?>/g, function(m, uid){ return SLACK_MAP[uid] || uid; }).trim();
    }

    // text 필드 파싱
    const text = body.text || '';
    if (text) {
      const lines = text.split('\n');
      for (const line of lines) {
        const clean = line.replace(/[*]/g, '').trim();
        const ci = clean.indexOf(':');
        if (ci < 0) continue;
        const key = clean.slice(0, ci).trim();
        const val = clean.slice(ci + 1).trim();
        if (!val) continue;
        if (key === '서비스명') { if(!service) service = val; }
        else if (key === '사용자') { if(!user) user = resolveUser(val); }
        else if (key === '내용') { if(!description) description = val; }
        else if (key === '결제금액') { if(!amount) amount = val; }
        else if (key === '결제카드') {
          if(!payment) { const m = val.match(/\d{4}/); if(m) payment = m[0]; }
        }
        else if (key === '결제방식') {
          if(!cycle) cycle = val.includes('연') ? '연결제' : '월결제';
        }
        else if (key === '결제일') {
          if(!start_date) { const m = val.match(/(\d{4})[-./](\d{2})[-./](\d{2})/); if(m) start_date = m[1]+'-'+m[2]+'-'+m[3]; }
        }
      }
    }

    if (!service) return res.status(400).json({ error: 'service is required', body });

    const sql = neon(process.env.DATABASE_URL);

    // 중복 체크
    const existing = await sql`
      SELECT id FROM subscriptions WHERE s=${service} AND status='pending' LIMIT 1
    `;
    if (existing && existing.length > 0) return res.status(200).json({ ok: true, duplicate: true });

    // 새 id 계산
    const maxRow = await sql`SELECT COALESCE(MAX(id),0)+1 AS next_id FROM subscriptions`;
    const newId = maxRow[0].next_id;

    // 삽입
    await sql`
      INSERT INTO subscriptions (id,s,u,d,a,m,c,sd,status,source,note)
      VALUES (
        ${newId}, ${service}, ${user||''}, ${description||''},
        ${amount||''}, ${payment||''}, ${cycle||'월결제'},
        ${start_date||new Date().toISOString().slice(0,10)},
        'pending', 'zapier', ${note||''}
      )
    `;

    // 관리자에게 즉시 알림(사이트 링크 포함). 실패해도 웹훅 응답엔 영향 없음.
    await notifyAdmin({ service, user, amount, payment, cycle: cycle||'월결제' });

    return res.status(200).json({ ok: true, id: newId, service, user, payment });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
