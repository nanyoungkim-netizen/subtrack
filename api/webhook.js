import { put, get } from '@vercel/blob';

const BLOB_KEY = 'subtrack-subscriptions.json';

async function loadData() {
  try {
    const blob = await get(BLOB_KEY);
    const res = await fetch(blob.url);
    return await res.json();
  } catch {
    return [];
  }
}

async function saveData(list) {
  await put(BLOB_KEY, JSON.stringify(list), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const list = await loadData();
      return res.status(200).json({ ok: true, data: list });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      const newItem = { id: Date.now(), s: body.service||body.tool||'', d: body.description||body.content||'', u: body.user||body.member||'', a: body.amount||body.price||'', m: body.payment||body.card||'', c: body.cycle||'웝결제', sd: body.start_date||new Date().toISOString().slice(0,10), ed: body.end_date||'', note: body.note||'',status: 구독중', source: 'zapier', created_at: new Date().toISOString() }; if(!newItem.s) return res.status(400).json({ok:false,error:'service 필드가 필요합눈다'}); const list=await loadData(); list.push(newItem); await saveData(list); return res.status(201).json({ok:true,added:newItem});
    } catch (e) { return res.status(500).json({ok:false,error:e.message}); }
  }
  return res.status(405).json({error:'Method not allowed'});
}
