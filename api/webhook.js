export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    let service=body.service, user=body.user, description=body.description;
    let amount=body.amount, payment=body.payment, cycle=body.cycle;
    let start_date=body.start_date, note=body.note;

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
        if (key === '서비스명') service = val;
        else if (key === '사용자') user = val.replace(/^<@[^|]+\|/,'').replace(/>$/,'').replace(/^@/,'');
        else if (key === '내용') description = val;
        else if (key === '결제금액') amount = val;
        else if (key === '결제카드') payment = val;
        else if (key === '결제일') start_date = val.replace(/\./g,'-');
        else if (key === '결제방식') cycle = val.includes('연') ? '연결제' : '월결제';
      }
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
      body: JSON.stringify({ id: newId, s: service, d: description||null, u: user||null, a: amount||null, m: payment||null, c: cycle||'월결제', sd: start_date||null, note: note||null, status: '구독중', source: 'zapier' })
    });
    const result = await insertRes.json();
    return res.status(200).json({ success: true, id: newId, data: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}