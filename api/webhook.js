export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    let service=body.service,user=body.user,description=body.description;
    let amount=body.amount,payment=body.payment,cycle=body.cycle;
    let start_date=body.start_date,note=body.note;

    const SLACK_MAP = {"UGNKU8WLD":"Q","UGP8ENQ3V":"IRON","UGPBD81HA":"Yello","UGP9X2D3L":"Cus","UJD690FCM":"MacGook","UGNL59LJC":"Minu","U0180UXLD2Q":"Sante","U01SLNUA155":"Rilla","U0261145X18":"HODOO","U027F6SG8AC":"Lark","U027WL6H93N":"Sian","U0288AXGGCW":"Rokoon","U02D6CDKQ3W":"Stone","U02CX5SQNSZ":"Chovy","U02K890UPK3":"Pucca","U033U995K53":"Zerry","U03JQ5FHP5Z":"Mush","U03QQ53099N":"dDubi","U03TC2CQEVD":"DDao","U04ATHK9S84":"Burns","U04GTSZ93T7":"SALT","U04NX77SNJ1":"Rooney","U04SUG1K22D":"Hero","U04T8FN2ZCZ":"Moomin","U04SYARM2MS":"Rami","U04TN658A84":"Junta","U054RK2GKK8":"Woz","U0645BVMJES":"Peach","U066F6AA6KD":"Aqoo","U069A4EC72S":"Hook","U069GP8MWDQ":"Teddy","U06CFJYUGQZ":"Pire","U070M3N25LP":"MewTwo","U071QDWFQNL":"Endo","U072B0P4R6Y":"YAMUCHI","U05DQHV6XAT":"Beaver","U05EUR1CCN4":"Turkey","U05DQHVDS5D":"Pepe","D07LNQ9GMHV":"Jeongnam","U07S5FBLPK7":"Aki","U08990X2ZNH":"Kikr"};

    function resolveUser(raw) {
      if (!raw) return raw;
      const m1 = raw.match(/^<@([A-Z0-9]+)\|([^>]+)>$/);
      if (m1) return SLACK_MAP[m1[1]] || m1[2];
      const m2 = raw.match(/^<@([A-Z0-9]+)>$/);
      if (m2) return SLACK_MAP[m2[1]] || m2[1];
      return raw.replace(/^@/, '');
    }

    const text = body.text || '';
    if (text && !service) {
      const lines = text.split('\n');
      for (const line of lines) {
        const clean = line.replace(/\*/g,'').trim();
        const ci = clean.indexOf(':');
        if (ci < 0) continue;
        const key = clean.slice(0, ci).trim();
        const val = clean.slice(ci + 1).trim();
        if (!val) continue;
        if (key==='서비스명') service=val;
        else if (key==='사용자') user=resolveUser(val);
        else if (key==='내용') description=val;
        else if (key==='결제금액') amount=val;
        else if (key==='결제카드') payment=val;
        else if (key==='결제일') start_date=val.replace(/\./g,'-');
        else if (key==='결제방식') cycle=val.includes('연')?'연결제':'월결제';
      }
    } else if (user) {
      user = resolveUser(user);
    }

    if (!service) return res.status(400).json({ error: 'service is required', body });

    const SUPABASE_URL = 'https://hwppttcigebpvpvzidex.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHB0dGNpZ2VicHZwdnppZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzE4NTUsImV4cCI6MjA4OTIwNzg1NX0.oNe50eIvP2guEugRk9x8GVlqvHUmYG6jPDWabukk3M8';
    const headers = {'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation'};

    const maxRes = await fetch(SUPABASE_URL+'/rest/v1/subscriptions?select=id&order=id.desc&limit=1', {headers});
    const maxData = await maxRes.json();
    const newId = (Array.isArray(maxData)&&maxData.length>0) ? maxData[0].id+1 : 2000;

    const insertRes = await fetch(SUPABASE_URL+'/rest/v1/subscriptions', {
      method:'POST', headers,
      body: JSON.stringify({
        id:newId, s:service, d:description||null, u:user||null,
        a:amount||null, m:payment||null, c:cycle||'월결제',
        sd:start_date||null, note:note||null, status:'pending', source:'zapier'
      })
    });
    const result = await insertRes.json();
    return res.status(200).json({ success:true, id:newId, data:result });
  } catch(err) {
    return res.status(500).json({ error:err.message });
  }
}