import { put, head } from '@vercel/blob';
const BLOB_KEY = 'subtrack-subscriptions.json';
async function loadData() {
  try { const blob = await head(BLOB_KEY); const res = await fetch(blob.url); return await res.json(); }
  catch { return []; }
}
async function saveData(list) {
  await put(BLOB_KEY, JSON.stringify(list), { access: 'public', addRandomSuffix: false, allowOverwrite: true });
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    try { const list = await loadData(); return res.status(200).json({ ok: true, data: list }); }
    catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  }
  if (req.method === 'POST') {
    try {
      const body = req.body;
      const newItem = { id: Date.now(), s: body.service||body['서비스']||'', d: body.description||body['내용']||'', u: body.user||body['사용자']||'', a: body.amount||body['금액']||'', m: body.payment||body['결제수단']||'', c: body.cycle||body['결제주기']||'월결제', sd: body.start_date||body['시작일']||new Date().toISOString().slice(0,10), ed: body.end_date||body['종료일']||'', note: body.note||body['비고']||'', status:'구독중', source:'zapier', created_at:new Date().toISOString() };
      if (!newItem.s) return res.status(400).json({ ok: false, error: '서비스명 필요' });
      const list = await loadData(); list.push(newItem); await saveData(list);
      return res.status(201).json({ ok: true, added: newItem });
    } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}