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

    // text 필드 파싱 - 키를 유니코드 이스케이프로 비교 (인코딩 무관)
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
        // 유니코드 이스케이프로 한글 키 비교
        if (key === '\uC11C\uBE44\uC2A4\uBA85') { if(!service) service = val; }
        else if (key === '\uC0AC\uC6A9\uC790') { if(!user) user = resolveUser(val); }
        else if (key === '\uB0B4\uC6A9') { if(!description) description = val; }
        else if (key === '\uACB0\uC81C\uAE08\uC561') { if(!amount) amount = val; }
        else if (key === '\uACB0\uC81C\uCE74\uB4DC') {
          if(!payment) { const m = val.match(/\d{4}/); if(m) payment = m[0]; }
        }
        else if (key === '\uACB0\uC81C\uBC29\uC2DD') {
          if(!cycle) cycle = val.includes('\uC5F0') ? '\uC5F0\uACB0\uC81C' : '\uC6D4\uACB0\uC81C';
        }
        else if (key === '\uACB0\uC81C\uC77C') {
          if(!start_date) { const m = val.match(/(\d{4})[-./](\d{2})[-./](\d{2})/); if(m) start_date = m[1]+'-'+m[2]+'-'+m[3]; }
        }
      }
    }

    if (!service) return res.status(400).json({ error: 'service is required', body });

    const SB_URL = 'https://hwppttcigebpvpvzidex.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHB0dGNpZ2VicHZwdnppZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzE4NTUsImV4cCI6MjA4OTIwNzg1NX0.oNe50eIvP2guEugRk9x8GVlqvHUmYG6jPDWabukk3M8';
    const hdrs = {'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY};

    const existing = await fetch(SB_URL+'/rest/v1/subscriptions?s=eq.'+encodeURIComponent(service)+'&status=eq.pending',{headers:hdrs}).then(r=>r.json());
    if (existing && existing.length > 0) return res.status(200).json({ok:true, duplicate:true});

    const maxData = await fetch(SB_URL+'/rest/v1/subscriptions?select=id&order=id.desc&limit=1',{headers:hdrs}).then(r=>r.json());
    const newId = (maxData[0]?.id || 0) + 1;

    const saveRes = await fetch(SB_URL+'/rest/v1/subscriptions', {
      method:'POST',
      headers:{...hdrs,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify({
        id:newId, s:service, u:user||'', d:description||'',
        a:amount||'', m:payment||'', c:cycle||'\uC6D4\uACB0\uC81C',
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