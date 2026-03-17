export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = req.body || {};
    let service = body.service;
    let user = body.user;
    let description = body.description;
    let amount = body.amount;
    let payment = body.payment;
    let cycle = body.cycle;
    let start_date = body.start_date;
    let note = body.note;

    // 슬랙 자동-결제 메시지 파싱
    const text = body.text || '';
    if (text && !service) {
      const lines = text.split('\n');
      for (const line of lines) {
        const clean = line.replace(/\*/g, '').trim();
        if (clean.startsWith('\uc11c\ube44\uc2a4\uba85:')) service = clean.slice(clean.indexOf(':')+1).trim();
        else if (clean.startsWith('\uc0ac\uc6a9\uc790:')) user = clean.slice(clean.indexOf(':')+1).trim().replace(/^<@[^|]+\|/,'').replace(/>$/,'').replace(/^@/,'');
        else if (clean.startsWith('\ub0b4\uc6a9:')) description = clean.slice(clean.indexOf(':')+1).trim();
        else if (clean.startsWith('\uacb0\uc81c\uae08\uc561:')) amount = clean.slice(clean.indexOf(':')+1).trim();
        else if (clean.startsWith('\uacb0\uc81c\uce74\ub4dc:')) payment = clean.slice(clean.indexOf(':')+1).trim();
        else if (clean.startsWith('\uacb0\uc81c\uc77c:')) start_date = clean.slice(clean.indexOf(':')+1).trim().replace(/\./g,'-');
        else if (clean.startsWith('\uacb0\uc81c\ubc29\uc2dd:')) {
          const v = clean.slice(clean.indexOf(':')+1).trim();
          cycle = v.includes('\uc5f0') ? '\uc5f0\uACB0\uc81c' : '\uc6d4\uACB0\uc81c';
        }
      }
    }

    if (!service) {
      return res.status(400).json({ error: 'service is required', body: body });
    }

    const SUPABASE_URL = 'https://hwppttcigebpvpvzidex.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHB0dGNpZ2VicHZwdnppZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzE4NTUsImV4cCI6MjA4OTIwNzg1NX0.oNe50eIvP2guEugRk9x8GVlqvHUmYG6jPDWabukk3M8';
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    // 최대 ID 조회
    const maxRes = await fetch(SUPABASE_URL + '/rest/v1/subscriptions?select=id&order=id.desc&limit=1', { headers });
    const maxData = await maxRes.json();
    const newId = (Array.isArray(maxData) && maxData.length > 0) ? maxData[0].id + 1 : 2000;

    // 삽입
    const insertRes = await fetch(SUPABASE_URL + '/rest/v1/subscriptions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: newId,
        s: service,
        d: description || null,
        u: user || null,
        a: amount || null,
        m: payment || null,
        c: cycle || '\uc6d4\uACB0\uc81c',
        sd: start_date || null,
        note: note || null,
        status: '\uAD6C\uB3C5\uC911',
        source: 'zapier'
      })
    });

    const result = await insertRes.json();
    return res.status(200).json({ success: true, id: newId, data: result });

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}