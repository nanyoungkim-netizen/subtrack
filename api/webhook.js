export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    let service=body.service, user=body.user, description=body.description;
    let amount=body.amount, payment=body.payment, cycle=body.cycle;
    let start_date=body.start_date, note=body.note;

    // 슬랙 유저 ID → 닉네임 매핑
    const SLACK_MAP = {"U03JQ5FHP5Z":"Merci","U05DQHV6XAT":"Beaver","U02D6CDKQ3W":"Stone","U0A3JQ8SGHG":"Lime","U0645BVMJES":"Peach","U04TN658A84":"Junta","U02FUHFGLGN":"Sante"};

    function resolveUser(raw) {
      if (!raw) return raw;
      // <@U03JQ5FHP5Z|머시> 형식 저리
      const matchFull = raw.match(/^<@([A-Z0-9]+)\|([^>]+)>$/);
      if (matchFull) {
        const id = matchFull[1];
        return SLACK_MAP[id] || matchFull[2];
      }
      // <@U03JQ5FHP5Z> 형식 저리
      const matchId = raw.match(/^<@([A-Z0-9]+)>$/);
      if (matchId) {
        const id = matchId[1];
        return SLACK_MAP[id] || id;
      }
      return raw.replace(/^@/, '');
    }

    const text = body.text || '';
    if (text && !service) {
      const lines = text.split('\n');
      for (const line of lines) {
        const clean = line.replace(/\*/g, '').trim();
        const colonIdx = clean.indexOf(':');
        if (colonIdx < 0) continue;
        const key = clean.slice(0, colonIdx).trim();
        const val = clean.slice(colonIdx + 1).trim();
        if (!val) continue;
        if (key === '\uc11c\ube44\uc2a4\uba85') service = val;
        else if (key === '\uc0ac\uc6a9\uc790') user = resolveUser(val);
        else if (key === '\ub0b4\uc6a9') description = val;
        else if (key === '\uacb0\uc81c\uae08\uc561') amount = val;
        else if (key === '\uacb0\uc81c\uce74\ub4dc') payment = val;
        else if (key === '\uacb0\uc81c\uc77c') start_date = val.replace(/\./g,'-');
        else if (key === '\uacb0\uc81c\ubc29\uc2dd') cycle = val.includes('\uc5f0') ? '\uc5f0\uACB0\uc81c' : '\uc6d4\uACB0\uc81c';
      }
    } else if (user) {
      user = resolveUser(user);
    }

    if (!service) return res.status(400).json({ error: 'service is required', body });

    const SUPABASE_URL = 'https://hwppttcigebpvpvzidex.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHB0dGNpZ2VicHZwdnppZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzE4NTUsImV4cCI6MjA4OTIwNzg1NX0.oNe50eIvP2guEugRk9x8GVlqvHUmYG6jPDWabukk3M8';
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer '+SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    const maxRes = await fetch(SUPABASE_URL+'/rest/v1/subscriptions?select=id&order=id.desc&limit=1', { headers });
    const maxData = await maxRes.json();
    const newId = (Array.isArray(maxData) && maxData.length > 0) ? maxData[0].id + 1 : 2000;

    const insertRes = await fetch(SUPABASE_URL+'/rest/v1/subscriptions', {
      method: 'POST', headers,
      body: JSON.stringify({
        id: newId, s: service, d: description||null, u: user||null,
        a: amount||null, m: payment||null, c: cycle||'\uc6d4\uACB0\uc81c',
        sd: start_date||null, note: note||null,
        status: 'pending',
        source: 'zapier'
      })
    });
    const result = await insertRes.json();
    return res.status(200).json({ success: true, id: newId, data: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}