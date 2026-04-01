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
      return raw.replace(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g, (m, uid) => SLACK_MAP[uid] || uid).trim();
    }

    function getField(text, ...keys) {
      for (const key of keys) {
        const re = new RegExp('[*]?' + key + '[*]?\\s*:\\s*([^\\n*]+)', 'i');
        const m = text.match(re);
        if (m && m[1].trim()) return m[1].trim();
      }
      return '';
    }

    const text = body.text || '';
    if (text) {
      if (!service)     service     = getField(text, '서비스명', '서비스');
      if (!user)        user        = resolveUser(getField(text, '사용자'));
      if (!description) description = getField(text, '내용');
      if (!amount)      amount      = getField(text, '결제금액', '금액');
      if (!payment) {
        const raw = getField(text, '결제카드', '카드번호', '카드');
        const m = raw.match(/\d{4}/);
        if (m) payment = m[0];
      }
      if (!cycle) {
        const v = getField(text, '결제방식', '결제주기');
        if (v) cycle = v.includes('연') ? '연결제' : '월결제';
      }
      if (!start_date) {
        const v = getField(text, '결제일', '결제일자');
        if (v) {
          const dm = v.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
          if (dm) start_date = dm[1]+'-'+dm[2]+'-'+dm[3];
        }
      }
    }

    if (!service) return res.status(400).json({ error: 'service is required', body });

    const SB_URL = 'https://hwppttcigebpvpvzidex.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHB0dGNpZ2VicHZwdnppZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzE4NTUsImV4cCI6MjA4OTIwNzg1NX0.oNe50eIvP2guEugRk9x8GVlqvHUmYG6jPDWabukk3M8';

    const existing = await fetch(SB_URL+'/rest/v1/subscriptions?s=eq.'+encodeURIComponent(service)+'&status=eq.pending',{
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}
    }).then(r=>r.json());
    if (existing && existing.length > 0) return res.status(200).json({ok:true, duplicate:true});

    const maxRes = await fetch(SB_URL+'/rest/v1/subscriptions?select=id&order=id.desc&limit=1',{
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}
    });
    const maxData = await maxRes.json();
    const newId = (maxData[0]?.id || 0) + 1;

    const saveRes = await fetch(SB_URL+'/rest/v1/subscriptions',{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify({
        id:newId, s:service, u:user||'', d:description||'',
        a:amount||'', m:payment||'', c:cycle||'월결제',
        sd:start_date||new Date().toISOString().slice(0,10),
        status:'pending', source:'zapier', note:note||''
      })
    });

    if (!saveRes.ok) return res.status(500).json({ error: 'DB save failed', detail: await saveRes.text() });
    return res.status(200).json({ ok:true, id:newId, service, user, payment });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}